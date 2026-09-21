#!/usr/bin/env node
import path from "node:path";
import { loadCourseConfig, resolveCourse } from "./config/courses.js";
import { formatDate, outputPath, parseDate, validateAudioPath, validateInputAudio } from "./files/output.js";
import { formatTimestamp } from "./audio/chunk.js";
import { discoverAllRecordings, type RecordingJob } from "./files/discovery.js";
import { DEFAULT_MODEL } from "./transcription/openrouter.js";
import { transcribeRecording } from "./transcription/recording.js";

type Args = { command?: string; file?: string; course?: string; title?: string; date?: string; model?: string; output?: string; language?: string; dryRun?: boolean; force?: boolean; help?: boolean };

function parseArgs(argv: string[]): Args {
  const [command, second, ...remaining] = argv;
  const hasOptionAsSecondArgument = second?.startsWith("-") ?? false;
  const file = hasOptionAsSecondArgument ? undefined : second;
  const rest = hasOptionAsSecondArgument ? [second, ...remaining] : remaining;
  const help = command === "-h" || command === "--help" || file === "-h" || file === "--help";
  const result: Args = { command: help && (command === "-h" || command === "--help") ? undefined : command, file, help };
  for (let i = 0; i < rest.length; i++) {
    const argument = rest[i];
    if (argument === "--help" || argument === "-h") result.help = true;
    else if (argument === "--dry-run") result.dryRun = true;
    else if (argument === "--force") result.force = true;
    else if (argument.startsWith("--")) {
      const key = argument.slice(2) as keyof Args;
      const value = rest[++i];
      if (!value || value.startsWith("--")) throw new Error(`Option ${argument} requires a value.`);
      if (!["course", "title", "date", "model", "output", "language"].includes(key)) throw new Error(`Unknown option ${argument}.`);
      (result as Record<string, string>)[key] = value;
    } else throw new Error(`Unexpected argument "${argument}".`);
  }
  return result;
}

function printHelp(): void {
  console.log(`lecture - transcribe university lectures\n\nUsage:\n  lecture transcribe <audio-file> --course <alias> --title <title> [options]\n  lecture sync [--dry-run] [--force]\n  lecture courses\n\nOptions:\n  --course <alias>       Course alias from the config (required for transcribe)\n  --title <title>        Output title (defaults to the audio filename)\n  --date <YYYY-MM-DD>    Local date (defaults to today)\n  --model <model>        OpenRouter model (default: ${DEFAULT_MODEL})\n  --output <directory>   Override the course output directory\n  --language <language>  Transcription language (default: Italian)\n  --dry-run              Show pending sync work without transcribing\n  --force                Retranscribe existing sync outputs\n  -h, --help             Show help`);
}

function chunkProgress() {
  return (chunk: { index: number; start: number; end: number }, total: number, duration: number) => {
    if (chunk.index === 1) console.log(`Recording duration: ${formatTimestamp(duration)}\nSplitting into ${total} chunks...\n\nTranscribing:`);
    console.log(`[${chunk.index}/${total}] ${formatTimestamp(chunk.start)}–${formatTimestamp(chunk.end)} ✓`);
  };
}

function syncRelative(root: string, filePath: string): string {
  return path.relative(root, filePath) || filePath;
}

async function runSync(args: Args, config: Awaited<ReturnType<typeof loadCourseConfig>>, apiKey: string | undefined): Promise<void> {
  const all = await discoverAllRecordings(config);
  const pending = args.force ? all : all.filter((job) => !job.transcribed);
  const root = path.resolve(config.universityRoot);
  const audioRoot = path.resolve(root, config.audioDirectory);
  console.log(`Scanning ${audioRoot}...\n\nFound ${all.length} recordings\nAlready transcribed: ${all.filter((job) => job.transcribed).length}\nPending: ${pending.length}`);
  if (args.dryRun) {
    if (pending.length) {
      console.log("\nPending:\n");
      for (const job of pending) console.log(`${syncRelative(audioRoot, path.dirname(job.audioPath))}/\n  ${path.basename(job.audioPath)}\n    → ${syncRelative(root, job.transcriptPath)}\n`);
    }
    console.log(`${pending.length} recording${pending.length === 1 ? "" : "s"} would be transcribed.`);
    return;
  }
  if (!pending.length) {
    console.log("\nDone.\n0 transcribed\n0 skipped\n0 failed");
    return;
  }
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured.\nAdd it to your shell environment before running this command.");
  let succeeded = 0;
  const failures: Array<{ job: RecordingJob; message: string }> = [];
  for (const [index, job] of pending.entries()) {
    const relativeAudio = syncRelative(audioRoot, job.audioPath);
    console.log(`\n[${index + 1}/${pending.length}] ${relativeAudio}\n      Transcribing...`);
    try {
      const date = job.date ?? formatDate(new Date());
      parseDate(date);
      const result = await transcribeRecording({ inputPath: job.audioPath, outputPath: job.transcriptPath, title: job.title, date, course: job.course, model: args.model ?? DEFAULT_MODEL, language: args.language ?? "Italian", apiKey, allowExisting: args.force, chunking: { onChunkComplete: chunkProgress() } }, validateAudioPath(job.audioPath));
      succeeded++;
      console.log(`      ✓ ${syncRelative(root, job.transcriptPath)}${result.cost === undefined ? "" : ` ($${result.cost.toFixed(6)})`}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ job, message });
      console.error(`      ✗ ${message}`);
    }
  }
  console.log(`\nDone.\n${succeeded} transcribed\n${all.filter((job) => job.transcribed && !args.force).length} skipped\n${failures.length} failed`);
  if (failures.length) {
    console.log("\nFailed:");
    for (const failure of failures) console.log(`- ${syncRelative(audioRoot, failure.job.audioPath)}`);
    throw new Error(`${failures.length} recording${failures.length === 1 ? "" : "s"} failed.`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.command) return printHelp();
  const config = await loadCourseConfig();
  if (args.command === "courses") {
    for (const [alias, course] of Object.entries(config.courses).sort(([a], [b]) => a.localeCompare(b))) console.log(`${alias.padEnd(12)} ${course.name}`);
    return;
  }
  if (args.command === "sync") {
    return runSync(args, config, process.env.OPENROUTER_API_KEY);
  }
  if (args.command !== "transcribe" || !args.file) throw new Error("Usage: lecture transcribe <audio-file> --course <alias> --title <title>");
  if (!args.course) throw new Error("--course is required.");
  const format = await validateInputAudio(args.file);
  const course = resolveCourse(config, args.course);
  const title = args.title ?? path.basename(args.file, path.extname(args.file));
  const date = args.date ?? formatDate(new Date());
  parseDate(date);
  const destination = args.output ?? course.path;
  const target = outputPath(destination, date, title);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured.\nAdd it to your shell environment before running this command.");
  const model = args.model ?? DEFAULT_MODEL;
  console.log(`Transcribing ${path.basename(args.file)}...\nCourse: ${course.name}\nModel: ${model}\n`);
  const result = await transcribeRecording({ inputPath: args.file, outputPath: target, title, date, course: course.name, model, language: args.language ?? "Italian", apiKey, chunking: { onChunkComplete: chunkProgress() } }, format);
  console.log(`✓ Transcription complete\n✓ Saved:\n\n${target}`);
  if (result.cost !== undefined) console.log(`\nCost: $${result.cost.toFixed(6)}`);
}

main().catch((error: unknown) => { console.error(`Error: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
