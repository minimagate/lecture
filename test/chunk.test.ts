import { access, mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createAudioChunks, createCompressedAudio, planChunks, shouldChunkAudio } from "../src/audio/chunk.js";
import { transcribeWithChunking } from "../src/transcription/chunked.js";
import { OpenRouterRequestError } from "../src/transcription/openrouter.js";
import type { AudioChunk } from "../src/audio/chunk.js";

test("short recordings bypass chunking and long recordings use the centralized threshold", () => {
  assert.equal(shouldChunkAudio(300), false);
  assert.equal(shouldChunkAudio(301), true);
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
  assert.deepEqual(result.chunks.map((chunk) => path.basename(chunk.path)), ["chunk-0001.mp3", "chunk-0002.mp3", "chunk-0003.mp3"]);
  assert.ok(commands.some((command) => command.includes("-ac 1 -ar 16000 -c:a libmp3lame -b:a 32k")));
  const directory = result.directory;
  const { removeAudioChunks } = await import("../src/audio/chunk.js");
  await removeAudioChunks(directory);
  await assert.rejects(access(directory));
});

function chunk(index: number, start: number, end: number): AudioChunk {
  return { index, start, end, path: `/tmp/chunk-${index}.m4a` };
}

test("compresses a recording to a temporary mono 16 kHz 32 kbps MP3 and removes it", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "lecture-compress-test-"));
  const commands: string[] = [];
  const run = async (command: string, args: string[]) => {
    commands.push(`${command} ${args.join(" ")}`);
    if (command === "ffmpeg" && args.includes("-version")) return { stdout: "ffmpeg", stderr: "" };
    if (command === "ffprobe" && args.includes("-version")) return { stdout: "ffprobe", stderr: "" };
    await writeFile(args[args.length - 1], "compressed audio");
    return { stdout: "", stderr: "" };
  };
  const compressed = await createCompressedAudio("recording.wav", { commandRunner: run, tempRoot });
  assert.equal(path.basename(compressed.path), "audio.mp3");
  assert.ok(commands.some((command) => command.includes("-ac 1 -ar 16000 -c:a libmp3lame -b:a 32k")));
  const { removeAudioChunks } = await import("../src/audio/chunk.js");
  await removeAudioChunks(compressed.directory);
  await assert.rejects(access(compressed.directory));
});

test("removes the temporary directory when FFmpeg compression fails", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "lecture-compress-fail-test-"));
  const run = async (command: string, args: string[]) => {
    if (command === "ffmpeg" && args.includes("-version")) return { stdout: "ffmpeg", stderr: "" };
    if (command === "ffprobe" && args.includes("-version")) return { stdout: "ffprobe", stderr: "" };
    throw new Error("encoder unavailable");
  };
  await assert.rejects(createCompressedAudio("recording.wav", { commandRunner: run, tempRoot }), /Could not compress the recording.*encoder unavailable/);
  assert.deepEqual(await readdir(tempRoot), []);
});

test("compresses short files before transcription and cleans the temporary audio", async () => {
  const calls: string[] = [];
  let removed = false;
  const result = await transcribeWithChunking("recording.m4a", "m4a", "model", "Italian", "key", {
    getDuration: async () => 100,
    createCompressed: async () => ({ path: "/tmp/compressed/audio.mp3", directory: "/tmp/compressed" }),
    removeChunks: async () => { removed = true; },
    transcribe: async (filePath, format) => { calls.push(`${filePath}:${format}`); return { text: "short", model: "model", cost: 0.01 }; },
  });
  assert.deepEqual(calls, ["/tmp/compressed/audio.mp3:mp3"]);
  assert.equal(result.chunked, false);
  assert.equal(result.text, "short");
  assert.equal(removed, true);
});

test("transcribes chunks sequentially, preserves order, and aggregates cost", async () => {
  const calls: string[] = [];
  const completed: number[] = [];
  const progress: string[] = [];
  const chunks = [
    { ...chunk(1, 0, 1203), path: "/tmp/chunk-1.mp3" },
    { ...chunk(2, 1200, 2403), path: "/tmp/chunk-2.mp3" },
  ];
  let removed = false;
  const result = await transcribeWithChunking("recording.m4a", "m4a", "model", "Italian", "key", {
    getDuration: async () => 2500,
    createChunks: async () => ({ chunks, directory: "/tmp/lecture-test-job" }),
    removeChunks: async () => { removed = true; },
    transcribe: async (filePath, format) => { calls.push(`${filePath}:${format}`); return { text: filePath.includes("1") ? "uno" : "due", model: "model", cost: 0.02 }; },
    onChunkComplete: (item) => completed.push(item.index),
    onProgress: (message) => progress.push(message),
  });
  assert.deepEqual(calls, ["/tmp/chunk-1.mp3:mp3", "/tmp/chunk-2.mp3:mp3"]);
  assert.deepEqual(completed, [1, 2]);
  assert.equal(result.text, "uno\n\ndue");
  assert.equal(result.cost, 0.04);
  assert.equal(removed, true);
  assert.equal(progress.some((message) => message.includes("Sending audio segment")), false);
});

test("splits a chunk after a 413, retries the smaller chunks, and cleans up each temporary directory", async () => {
  const calls: string[] = [];
  const removed: string[] = [];
  const originalChunks = [
    { ...chunk(1, 0, 603), path: "/tmp/original-1.mp3" },
    { ...chunk(2, 600, 603), path: "/tmp/original-2.mp3" },
  ];
  const smallerChunks = [
    { ...chunk(1, 0, 302), path: "/tmp/smaller-1.mp3" },
    { ...chunk(2, 300, 603), path: "/tmp/smaller-2.mp3" },
  ];
  const result = await transcribeWithChunking("recording.m4a", "m4a", "model", "Italian", "key", {
    getDuration: async () => 603,
    createChunks: async (_filePath, _format, _duration, options) => options?.chunkDuration
      ? { chunks: smallerChunks, directory: "/tmp/lecture-smaller-job" }
      : { chunks: originalChunks, directory: "/tmp/lecture-original-job" },
    removeChunks: async (directory) => { removed.push(directory); },
    transcribe: async (filePath, format) => {
      calls.push(`${filePath}:${format}`);
      if (filePath === originalChunks[0].path) throw new OpenRouterRequestError(413, "Payload Too Large");
      return { text: filePath.includes("-1.") ? "uno" : "due", model: "model", cost: 0.01 };
    },
  });

  assert.deepEqual(calls, [originalChunks[0].path, smallerChunks[0].path, smallerChunks[1].path, originalChunks[1].path].map((filePath) => `${filePath}:mp3`));
  assert.deepEqual(removed, ["/tmp/lecture-smaller-job", "/tmp/lecture-original-job"]);
  assert.equal(result.text, "uno\n\ndue\n\ndue");
  assert.equal(result.cost, 0.03);
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
