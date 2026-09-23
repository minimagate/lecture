# Lecture

Lecture is a local-first CLI for turning Voice Memos recordings into an Obsidian university study workspace. The filesystem is the source of truth: original audio lives in `_audio`, machine transcripts in `_transcripts`, generated lecture notes in `Notes/<Course>/Lectures`, and other notes in `Notes` remain yours.

## Install

Requires Node.js 20 or newer.

```bash
npm install
npm run build
npm link
```

Install FFmpeg and ffprobe; transcription uses them to inspect duration and create temporary, speech-optimized audio:

```bash
brew install ffmpeg
```

Set the OpenRouter key in your shell environment, or create a `.env` file in the project root (it is ignored by git and loaded by the CLI, including when invoked outside the project directory):

```bash
export OPENROUTER_API_KEY="..."
# Alternatively, put OPENROUTER_API_KEY=... in .env
```

On macOS, add that line to `~/.zshrc` if it should be available in new terminals.

## First setup

```bash
lecture setup
lecture course add "Analisi I"
lecture course add "Algebra"
```

The default vault is `~/Documents/University`. A different vault can be selected with `lecture setup --path /path/to/University`. Open the resulting `University` folder directly in Obsidian.

Setup creates `Notes/`, `_transcripts/`, `_audio/`, `.obsidian/`, `.agents/`, and `AGENTS.md` without overwriting existing user files. It also enables the core Bases plugin and hides agent support files from normal Obsidian file views using the vault's standard settings. Adding a course places its `Transcriptions.base` view at the root of `_transcripts/<Course>/`.

## Daily workflow

1. Record a lecture with Apple Voice Memos.
2. Export it into `_audio/<Course>/`.
3. Run:

```bash
lecture transcribe
```

Lecture discovers pending audio, converts it to temporary mono 16 kHz MP3 audio at 32 kbps for transcription, splits long recordings into compressed chunks, generates one Italian title and summary call, and writes a Markdown transcript under `_transcripts/<Course>/`. Original recordings are left unchanged, and temporary audio is removed after transcription.

Then run `lecture teach` to turn completed transcripts into detailed structured study notes under `Notes/<Course>/Lectures/`. It never modifies the source transcript or audio.

Example:

```text
_audio/Analisi I/Recording 127.m4a
-> _transcripts/Analisi I/2026-09-21 - Limiti di successioni.md
```

The transcript contains YAML frontmatter including `source_audio`, `date`, `title`, `summary`, `duration_seconds`, `transcription_model`, `metadata_model`, and `metadata_status`. The complete raw ASR output remains under `## Transcript`.

If metadata generation fails, the transcript is still saved with a deterministic filename and `metadata_status: pending`. The next `lecture` run retries only metadata and never retranscribes that audio.

## Commands

```bash
lecture transcribe              # process pending metadata and audio
lecture teach                   # create detailed notes from completed transcripts
lecture teach --dry-run         # show pending teaching work without API calls
lecture transcribe --dry-run    # show work without API calls or file changes
lecture setup
lecture course add "Geometria"
lecture courses
lecture status
lecture --help
```

For an advanced one-off transcription, use `lecture transcribe <audio-file>`. The normal workflow is to place audio under `_audio/<Course>/` and run `lecture transcribe`.

## Models

The defaults are:

```text
Transcription: openai/whisper-large-v3-turbo
Metadata:      openai/gpt-5.6-luna
Teaching:      anthropic/claude-opus-5.5
Language:      it
```

They are stored in the global application configuration, not in the vault and never include API keys. The global config is stored at the platform-appropriate application configuration path, for example `~/Library/Application Support/lecture/config.json` on macOS.

## Agent workspace

The vault includes a concise `AGENTS.md` and three skills under `.agents/skills/`. They explain the immutable audio rule, flexible Notes structure, generated transcript metadata, and how an agent should gather course context without reorganizing the vault.
