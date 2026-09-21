import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export type CommandRunner = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

export const defaultCommandRunner: CommandRunner = (command, args) => execFile(command, args);

export async function getAudioDuration(filePath: string, run: CommandRunner = defaultCommandRunner): Promise<number> {
  let result: { stdout: string; stderr: string };
  try {
    result = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", filePath]);
  } catch {
    throw new Error(`Could not read the recording duration with ffprobe. Make sure FFmpeg is installed (brew install ffmpeg).`);
  }

  try {
    const duration = Number((JSON.parse(result.stdout) as { format?: { duration?: string } }).format?.duration);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error();
    return duration;
  } catch {
    throw new Error(`Could not determine the duration of "${filePath}".`);
  }
}

export async function ensureFfmpeg(run: CommandRunner = defaultCommandRunner): Promise<void> {
  try {
    await Promise.all([run("ffmpeg", ["-version"]), run("ffprobe", ["-version"])]);
  } catch {
    throw new Error("This recording needs to be split before transcription, but FFmpeg is not installed.\n\nInstall it on macOS with:\n\nbrew install ffmpeg");
  }
}
