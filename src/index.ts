#!/usr/bin/env node
import path from "node:path";
import { stat } from "node:fs/promises";
import { defaultVaultRoot, loadAppConfig, type AppConfig } from "./config/app-config.js";
import { listCourses } from "./config/courses.js";
import { countAudio, discoverTranscripts, type RecordingJob } from "./files/discovery.js";
import { formatTimestamp } from "./audio/chunk.js";
import { formatDate, parseDate } from "./files/output.js";
import { DEFAULT_TRANSCRIPTION_MODEL } from "./config/app-config.js";
import { addCourse, setupVault } from "./vault/setup.js";
import { enrichTranscript, pendingMetadata, pendingRecordings, processRecording } from "./vault/transcripts.js";

type Args = { command?: string; positionals: string[]; path?: string; model?: string; language?: string; dryRun: boolean; help: boolean };

function parseArgs(argv: string[]): Args {
  const positionals: string[] = [];
  const result: Args = { positionals, dryRun: false, help: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") result.help = true;
    else if (argument === "--dry-run") result.dryRun = true;
    else if (argument.startsWith("--")) {
      const key = argument.slice(2);
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`Option ${argument} requires a value.`);
      if (key === "path") result.path = value;
      else if (key === "model") result.model = value;
      else if (key === "language") result.language = value;
      else throw new Error(`Unknown option ${argument}.`);
    } else positionals.push(argument);
  }
  result.command = positionals[0];
  return result;
}

function printHelp(): void {
  console.log(`Lecture - local university study workspace\n\nUsage:\n  lecture transcribe              Process pending metadata and recordings\n  lecture setup [--path <path>]   Initialize an Obsidian vault\n  lecture course add <name>       Add a course to the vault\n  lecture courses                 List filesystem-backed courses\n  lecture status                  Show vault status\n  lecture --dry-run               Show pending work without changing files\n  lecture transcribe <file>       One-off transcription of an audio file\n\nOptions:\n  --model <model>       Override the transcription model\n  --language <language> Override the transcription language\n  --dry-run             Do not call OpenRouter or modify files\n  -h, --help            Show help\n\nDefault transcription model: ${DEFAULT_TRANSCRIPTION_MODEL}`);
}

function progress() {
  return (chunk: { index: number; start: number; end: number }, total: number, duration: number) => {
    if (chunk.index === 1) console.log(`      ${formatTimestamp(duration)}\n      Splitting into ${total} chunks...`);
    console.log(`      [${chunk.index}/${total}] ${formatTimestamp(chunk.start)}-${formatTimestamp(chunk.end)} ✓`);
  };
}

async function runStatus(config: AppConfig): Promise<void> {
  const transcripts = await discoverTranscripts(config);
  const recordings = await countAudio(config);
  const pending = await pendingRecordings(config);
  const metadata = transcripts.filter((record) => record.frontmatter.metadata_status === "pending");
  console.log(`Vault: ${config.vaultRoot}\n\nCourses: ${(await listCourses(config.vaultRoot)).length}\n\nAudio recordings:       ${recordings}\nTranscripts:            ${transcripts.length}\nPending transcription:  ${pending.length}\nPending metadata:       ${metadata.length}`);
  if (metadata.length) console.log(`\nPending metadata:\n${metadata.map((record) => `  ${path.relative(config.vaultRoot, record.path)}`).join("\n")}`);
  if (pending.length) console.log(`\nPending transcription:\n${pending.map((job) => `  ${job.relativePath}`).join("\n")}`);
}

async function runWorkspace(config: AppConfig, args: Args): Promise<void> {
  const metadataJobs = await pendingMetadata(config);
  const recordings = await pendingRecordings(config);
  console.log(`University\n\nMetadata pending: ${metadataJobs.length}\nNew recordings: ${recordings.length}`);
  if (args.dryRun) {
    if (metadataJobs.length) console.log(`\nPending metadata:\n${metadataJobs.map((record) => `  ${path.relative(config.vaultRoot, record.path)}`).join("\n")}`);
    if (recordings.length) console.log(`\nPending transcription:\n${recordings.map((job) => `  ${job.relativePath} -> _transcripts/${job.course}/<generated title>.md`).join("\n")}`);
    console.log("\nNo files will be modified.");
    return;
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if ((metadataJobs.length || recordings.length) && !apiKey) throw new Error("OPENROUTER_API_KEY is not configured.\nAdd it to your shell environment before running this command.");
  let failed = 0;
  let repaired = 0;
  let transcribed = 0;
  let totalCost = 0;
  let costAvailable = true;
  if (metadataJobs.length) {
    console.log("\nEnriching:");
    for (const [index, record] of metadataJobs.entries()) {
      try { const result = await enrichTranscript(record, config, apiKey!); if (result.cost === undefined) costAvailable = false; else totalCost += result.cost; repaired++; console.log(`[${index + 1}/${metadataJobs.length}] ${path.relative(config.vaultRoot, result.path)} ✓`); } catch (error) { failed++; console.error(`[${index + 1}/${metadataJobs.length}] ${path.relative(config.vaultRoot, record.path)} ✗ ${error instanceof Error ? error.message : String(error)}`); }
    }
  }
  if (recordings.length) {
    console.log("\nTranscribing:");
    for (const [index, job] of recordings.entries()) {
      console.log(`[${index + 1}/${recordings.length}] ${job.relativePath}\n      Transcribing...`);
      try {
        const result = await processRecording({ ...job, sourceAudio: job.sourceAudio, stem: job.stem, date: job.date }, { ...config, transcriptionModel: args.model ?? config.transcriptionModel, language: args.language ?? config.language }, apiKey!, { onChunkComplete: progress() });
        if (result.transcriptionCost === undefined || result.metadataCost === undefined) costAvailable = false; else totalCost += result.transcriptionCost + result.metadataCost;
        transcribed++;
        console.log(`      Generating title and summary...\n      ✓ ${path.relative(config.vaultRoot, result.transcriptPath)}${result.metadataPending ? " (metadata pending)" : ""}`);
      } catch (error) { failed++; console.error(`      ✗ ${error instanceof Error ? error.message : String(error)}`); }
    }
  }
  console.log(`\nDone.\n\nTranscribed: ${transcribed}\nMetadata repaired: ${repaired}\nFailed: ${failed}${costAvailable && (transcribed || repaired) ? `\nOpenRouter cost: $${totalCost.toFixed(6)}` : ""}`);
  if (failed) throw new Error(`${failed} item${failed === 1 ? "" : "s"} failed.`);
}

async function runManualTranscription(args: Args, config: AppConfig): Promise<void> {
  const file = args.positionals[1];
  if (!file) throw new Error("Usage: lecture transcribe <audio-file> --course <course>");
  const course = args.positionals[2] ?? "Unsorted";
  const details = await stat(file);
  const root = path.resolve(config.vaultRoot);
  const absolute = path.resolve(file);
  const relative = path.relative(root, absolute);
  const job: RecordingJob = { audioPath: absolute, sourceAudio: relative && !relative.startsWith("..") ? relative.replaceAll(path.sep, "/") : `_audio/${course}/${path.basename(file)}`, relativePath: relative, course, stem: path.basename(file, path.extname(file)), birthtimeMs: details.birthtimeMs, mtimeMs: details.mtimeMs };
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured.");
  const result = await processRecording(job, { ...config, transcriptionModel: args.model ?? config.transcriptionModel, language: args.language ?? config.language }, apiKey, { onChunkComplete: progress() });
  console.log(`✓ Saved ${result.transcriptPath}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();
  if (!args.command && !args.dryRun) return runWorkspace(await loadAppConfig(), args);
  if (!args.command && args.dryRun) return runWorkspace(await loadAppConfig(), args);
  if (args.command === "setup") { const config = await setupVault(args.path ?? defaultVaultRoot()); console.log(`Lecture vault ready: ${config.vaultRoot}`); return; }
  const config = await loadAppConfig();
  if (args.command === "course" && args.positionals[1] === "add") { const name = args.positionals.slice(2).join(" "); if (!name) throw new Error("Usage: lecture course add <name>"); console.log(`Course ready: ${await addCourse(config.vaultRoot, name)}`); return; }
  if (args.command === "courses") { for (const course of await listCourses(config.vaultRoot)) console.log(course); return; }
  if (args.command === "status") return runStatus(config);
  if (args.command === "sync") return runWorkspace(config, args);
  if (args.command === "transcribe" && args.positionals.length === 1) return runWorkspace(config, args);
  if (args.command === "transcribe") return runManualTranscription(args, config);
  throw new Error(`Unknown command "${args.command}". Use lecture --help.`);
}

main().catch((error: unknown) => { console.error(`Error: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
