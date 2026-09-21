#!/usr/bin/env node
import path from "node:path";
import { loadCourseConfig, resolveCourse } from "./config/courses.js";
import { ensureNewOutput, formatDate, outputPath, parseDate, validateInputAudio, writeAtomic } from "./files/output.js";
import { DEFAULT_MODEL, transcribeAudio } from "./transcription/openrouter.js";

type Args = { command?: string; file?: string; course?: string; title?: string; date?: string; model?: string; output?: string; language?: string; help?: boolean };

function parseArgs(argv: string[]): Args {
  const [command, file, ...rest] = argv;
  const help = command === "-h" || command === "--help" || file === "-h" || file === "--help";
  const result: Args = { command: help && (command === "-h" || command === "--help") ? undefined : command, file: help && (file === "-h" || file === "--help") ? undefined : file, help };
  for (let i = 0; i < rest.length; i++) {
    const argument = rest[i];
    if (argument === "--help" || argument === "-h") result.help = true;
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
  console.log(`lecture - transcribe university lectures\n\nUsage:\n  lecture transcribe <audio-file> --course <alias> --title <title> [options]\n  lecture courses\n\nOptions:\n  --course <alias>       Course alias from the config (required for transcribe)\n  --title <title>        Output title (defaults to the audio filename)\n  --date <YYYY-MM-DD>    Local date (defaults to today)\n  --model <model>        OpenRouter model (default: ${DEFAULT_MODEL})\n  --output <directory>   Override the course output directory\n  --language <language>  Transcription language (default: Italian)\n  -h, --help             Show help`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.command) return printHelp();
  const config = await loadCourseConfig();
  if (args.command === "courses") {
    for (const [alias, course] of Object.entries(config.courses).sort(([a], [b]) => a.localeCompare(b))) console.log(`${alias.padEnd(12)} ${course.name}`);
    return;
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
  await ensureNewOutput(target);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured.\nAdd it to your shell environment before running this command.");
  const model = args.model ?? DEFAULT_MODEL;
  console.log(`Transcribing ${path.basename(args.file)}...\nCourse: ${course.name}\nModel: ${model}\n`);
  const result = await transcribeAudio(args.file, format, model, args.language ?? "Italian", apiKey);
  const displayDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(parseDate(date));
  const markdown = `# ${title}\n\n**Course:** ${course.name}  \n**Date:** ${displayDate}  \n**Source:** ${path.basename(args.file)}  \n**Transcription model:** ${result.model}\n\n---\n\n## Transcript\n\n${result.text}\n`;
  await writeAtomic(target, markdown);
  console.log(`✓ Transcription complete\n✓ Saved:\n\n${target}`);
  if (result.cost !== undefined) console.log(`\nCost: $${result.cost.toFixed(6)}`);
}

main().catch((error: unknown) => { console.error(`Error: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
