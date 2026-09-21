import { access, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createAudioChunks, planChunks, shouldChunkAudio } from "../src/audio/chunk.js";
import { transcribeWithChunking } from "../src/transcription/chunked.js";
import type { AudioChunk } from "../src/audio/chunk.js";

test("short recordings bypass chunking and long recordings use the centralized threshold", () => {
  assert.equal(shouldChunkAudio(1200), false);
  assert.equal(shouldChunkAudio(1201), true);
});

test("plans sequential chunks with overlap and a bounded final chunk", () => {
  assert.deepEqual(planChunks(2500, 1200, 3), [
    { index: 1, start: 0, end: 1203 },
    { index: 2, start: 1200, end: 2403 },
    { index: 3, start: 2400, end: 2500 },
  ]);
});

test("creates deterministic chunk files and cleans them up", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "lecture-chunk-test-"));
  const commands: string[] = [];
  const run = async (command: string, args: string[]) => {
    commands.push(`${command} ${args.join(" ")}`);
    if (command === "ffprobe") return { stdout: '{"format":{"duration":"2500"}}', stderr: "" };
    if (command === "ffmpeg" && args.includes("-version")) return { stdout: "ffmpeg", stderr: "" };
    if (command === "ffprobe" && args.includes("-version")) return { stdout: "ffprobe", stderr: "" };
    await writeFile(args[args.length - 1], "audio");
    return { stdout: "", stderr: "" };
  };
  const result = await createAudioChunks("recording.m4a", "m4a", 2500, { commandRunner: run, tempRoot, chunkDuration: 1200, overlap: 3 });
  assert.deepEqual(result.chunks.map(({ index, start, end }) => ({ index, start, end })), [
    { index: 1, start: 0, end: 1203 },
    { index: 2, start: 1200, end: 2403 },
    { index: 3, start: 2400, end: 2500 },
  ]);
  assert.deepEqual(result.chunks.map((chunk) => path.basename(chunk.path)), ["chunk-0001.m4a", "chunk-0002.m4a", "chunk-0003.m4a"]);
  assert.ok(commands.some((command) => command.includes("-c copy")));
  const directory = result.directory;
  const { removeAudioChunks } = await import("../src/audio/chunk.js");
  await removeAudioChunks(directory);
  await assert.rejects(access(directory));
});

function chunk(index: number, start: number, end: number): AudioChunk {
  return { index, start, end, path: `/tmp/chunk-${index}.m4a` };
}

test("transcribes short files through the existing single-file path", async () => {
  const calls: string[] = [];
  const result = await transcribeWithChunking("recording.m4a", "m4a", "model", "Italian", "key", {
    getDuration: async () => 100,
    transcribe: async (filePath) => { calls.push(filePath); return { text: "short", model: "model", cost: 0.01 }; },
  });
  assert.deepEqual(calls, ["recording.m4a"]);
  assert.equal(result.chunked, false);
  assert.equal(result.text, "short");
});

test("transcribes chunks sequentially, preserves order, and aggregates cost", async () => {
  const calls: string[] = [];
  const completed: number[] = [];
  const chunks = [chunk(1, 0, 1203), chunk(2, 1200, 2403)];
  let removed = false;
  const result = await transcribeWithChunking("recording.m4a", "m4a", "model", "Italian", "key", {
    getDuration: async () => 2500,
    createChunks: async () => ({ chunks, directory: "/tmp/lecture-test-job" }),
    removeChunks: async () => { removed = true; },
    transcribe: async (filePath) => { calls.push(filePath); return { text: filePath.includes("1") ? "uno" : "due", model: "model", cost: 0.02 }; },
    onChunkComplete: (item) => completed.push(item.index),
  });
  assert.deepEqual(calls, ["/tmp/chunk-1.m4a", "/tmp/chunk-2.m4a"]);
  assert.deepEqual(completed, [1, 2]);
  assert.equal(result.text, "uno\n\ndue");
  assert.equal(result.cost, 0.04);
  assert.equal(removed, true);
});

test("cleans temporary chunks and fails the whole operation when one chunk fails", async () => {
  let removed = false;
  await assert.rejects(
    transcribeWithChunking("recording.m4a", "m4a", "model", "Italian", "key", {
      getDuration: async () => 2500,
      createChunks: async () => ({ chunks: [chunk(1, 0, 1203), chunk(2, 1200, 2403)], directory: "/tmp/lecture-test-job" }),
      removeChunks: async () => { removed = true; },
      transcribe: async (_filePath, _format, _model, _language, _key) => { throw new Error("provider failed"); },
    }),
    /Chunk 1 of 2 failed: provider failed/,
  );
  assert.equal(removed, true);
});
