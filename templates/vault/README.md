<!-- generated-by: lecture -->
# {{VAULT_NAME}}

This vault is my local university workspace.

## Structure

- `Notes/` contains my notes and study material.
- `_transcripts/` contains generated lecture transcripts.
- `_audio/` contains the original lecture recordings.

Each course normally appears in all three places. For example:

```text
Notes/Analisi I/
_transcripts/Analisi I/
_audio/Analisi I/
```

## Daily workflow

1. Record a lecture with Voice Memos.
2. Export the recording into `_audio/<Course>/`.
3. Run `lecture transcribe` from a terminal.
4. Lecture transcribes the recording and writes it under `_transcripts/<Course>/`.
5. Open the transcript in Obsidian and use it as reference when making notes.

Add a course once with `lecture course add "Course Name"`. This creates its three folders and a `Transcriptions.base` view at the root of `_transcripts/<Course>/`.

## Notes

`Notes/` has no required structure. Organize it by lecture, topic, chapter, theorem, exercise, or whatever remains useful. Transcripts are source material, not finished notes.

## Useful commands

```text
lecture transcribe
lecture status
lecture course add "Course Name"
lecture courses
```

Lecture uses OpenRouter for transcription and for generating a title and short summary. Its API key stays outside this vault.
