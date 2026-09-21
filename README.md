# lecture

`lecture` is a small local macOS-first CLI for sending university lecture recordings to OpenRouter and saving the returned Italian transcript as Markdown.

## Installation

Requires Node.js 20 or newer.

```bash
npm install
npm run build
npm link
```

For development, use `npm run dev -- transcribe ...`. The global command is then `lecture ...`.

## API key

```bash
export OPENROUTER_API_KEY="your-key"
```

To make it persistent in the default macOS zsh shell, add that line to `~/.zshrc`, then open a new terminal or run `source ~/.zshrc`. Never put the key in course configuration or Markdown output.

The integration uses OpenRouter's current `/api/v1/chat/completions` audio input API: audio is sent as base64 `input_audio` content. The default model is `google/gemini-2.5-flash`; change it with `--model`. Audio limits and exact format support are ultimately model/provider dependent, as documented by OpenRouter.

## Configuration

Create `~/.config/lecture/config.yaml`:

```yaml
courses:
  analisi:
    name: "Analisi I"
    path: "~/Documents/University/Analisi I"
  algebra:
    name: "Algebra"
    path: "~/Documents/University/Algebra"
```

`LECTURE_CONFIG_FILE` can override the config location, which is useful for testing or a second setup. Inspect configured courses with:

```bash
lecture courses
```

## Usage

```bash
lecture transcribe ~/Downloads/Recording.m4a \
  --course analisi \
  --title "Limiti di successioni"
```

Options include `--date YYYY-MM-DD`, `--model provider/model-name`, `--output /another/directory`, and `--language Italian`. If `--title` is omitted, the source filename becomes the title. Supported input formats are `.m4a`, `.mp3`, `.wav`, `.aac`, `.aiff`, `.ogg`, and `.flac`.

The output is saved under the configured course directory as:

```text
~/Documents/University/Analisi I/2026-09-21 - Limiti di successioni.md
```

Existing output files are never overwritten. The file is written atomically, so an API or filesystem failure does not leave a successful-looking transcript behind.

## Development

```bash
npm run typecheck
npm test
npm run build
node dist/src/index.js --help
```
