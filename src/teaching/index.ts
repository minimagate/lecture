import path from "node:path";
import { readFile, readdir, lstat } from "node:fs/promises";
import { discoverTranscripts, type TranscriptRecord } from "../files/discovery.js";
import { parseMarkdown, stringifyFrontmatter, vaultRelativePath, type Frontmatter } from "../markdown/frontmatter.js";
import { fallbackTitle } from "../markdown/transcript.js";
import { writeAtomic, sanitizeFilename } from "../files/output.js";
import { DEFAULT_TEACHING_MODEL, type AppConfig } from "../config/app-config.js";
import { teachingPrompt } from "./prompt.js";
import { generateTeachingNote, type TeachingResult } from "./openrouter.js";
import { sourceHash } from "./hash.js";

export type TeachingCandidate = { transcript: TranscriptRecord; source: string; hash: string; notePath?: string; stale: boolean };
export type TeachingReport = { candidates: TeachingCandidate[]; pending: TeachingCandidate[]; stale: TeachingCandidate[]; skipped: number; noteCount: number };

function transcriptBody(body: string): string {
  return (/## Transcript\s*\n([\s\S]*)$/i.exec(body)?.[1] ?? body).trim();
}

async function walkMarkdown(directory: string, files: string[] = []): Promise<string[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return files; throw error; }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name.endsWith(".tmp")) continue;
    const current = path.join(directory, entry.name);
    if ((await lstat(current)).isDirectory()) await walkMarkdown(current, files);
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(current);
  }
  return files;
}

async function generatedNotes(config: AppConfig): Promise<Map<string, { path: string; frontmatter: Frontmatter }>> {
  const notesRoot = path.join(config.vaultRoot, "Notes");
  const result = new Map<string, { path: string; frontmatter: Frontmatter }>();
  for (const file of await walkMarkdown(notesRoot)) {
    if (path.relative(notesRoot, file).split(path.sep)[1] !== "Lectures") continue;
    const parsed = parseMarkdown(await readFile(file, "utf8"));
    if (parsed.frontmatter.type !== "lecture-note" || typeof parsed.frontmatter.source_transcript !== "string") continue;
    result.set(vaultRelativePath(parsed.frontmatter.source_transcript), { path: file, frontmatter: parsed.frontmatter });
  }
  return result;
}

export async function inspectTeaching(config: AppConfig, course?: string): Promise<TeachingReport> {
  const notes = await generatedNotes(config);
  const allRecords = await discoverTranscripts(config);
  const records = allRecords.filter((record) => record.frontmatter.metadata_status !== "pending" && (!course || record.frontmatter.course === course));
  const candidates = records.map((transcript) => {
    const relative = vaultRelativePath(path.relative(config.vaultRoot, transcript.path));
    const hash = sourceHash(transcriptBody(transcript.body));
    const note = notes.get(relative);
    return { transcript, source: relative, hash, notePath: note?.path, stale: Boolean(note && note.frontmatter.source_hash !== hash) };
  });
  const stale = candidates.filter((candidate) => candidate.stale);
  const pending = candidates.filter((candidate) => !candidate.notePath);
  return { candidates, pending, stale, skipped: allRecords.length - candidates.length + candidates.length - pending.length, noteCount: notes.size };
}

function notePath(config: AppConfig, candidate: TeachingCandidate): string {
  return candidate.notePath ?? path.join(config.vaultRoot, "Notes", String(candidate.transcript.frontmatter.course), "Lectures", `${String(candidate.transcript.frontmatter.date)} - ${sanitizeFilename(String(candidate.transcript.frontmatter.title))}.md`);
}

function renderNote(candidate: TeachingCandidate, model: string, result: TeachingResult): string {
  const frontmatter: Frontmatter = { type: "lecture-note", course: candidate.transcript.frontmatter.course, date: candidate.transcript.frontmatter.date, title: candidate.transcript.frontmatter.title, source_transcript: candidate.source, source_hash: candidate.hash, teaching_model: model, taught_at: new Date().toISOString() };
  return stringifyFrontmatter(frontmatter, result.body);
}

export async function teachTranscripts(config: AppConfig, options: { apiKey: string; force?: boolean; course?: string; generate?: typeof generateTeachingNote; onStart?: (candidate: TeachingCandidate, index: number, total: number) => void }): Promise<{ created: number; failed: TeachingCandidate[]; report: TeachingReport; costs: number; costAvailable: boolean }> {
  const report = await inspectTeaching(config, options.course);
  const jobs = options.force ? report.candidates.filter((candidate) => candidate.notePath || !candidate.stale) : report.pending;
  const failed: TeachingCandidate[] = [];
  let costs = 0; let costAvailable = true; let created = 0;
  for (const [index, candidate] of jobs.entries()) {
    options.onStart?.(candidate, index, jobs.length);
    try {
      const model = config.teachingModel ?? DEFAULT_TEACHING_MODEL;
      const result = await (options.generate ?? generateTeachingNote)(teachingPrompt(String(candidate.transcript.frontmatter.course), String(candidate.transcript.frontmatter.date), String(candidate.transcript.frontmatter.title), transcriptBody(candidate.transcript.body)), model, options.apiKey);
      if (result.cost === undefined) costAvailable = false; else costs += result.cost;
      await writeAtomic(notePath(config, candidate), renderNote(candidate, model, result));
      created++;
    } catch { failed.push(candidate); }
  }
  return { created, failed, report, costs, costAvailable };
}
