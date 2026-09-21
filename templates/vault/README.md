<!-- generated-by: lecture -->
# {{VAULT_NAME}}

This vault is my local university workspace.

## Structure

- `Notes/` contains my notes and study material; `Notes/<Course>/Lectures/` is reserved for generated structured lecture notes.
- `_transcripts/` contains machine transcriptions and is the source corpus.
- `_audio/` contains the original lecture recordings and is immutable.

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
5. Run `lecture teach` to create detailed study notes, then study them in Obsidian.

Add a course once with `lecture course add "Course Name"`. This creates its three folders and a `Transcriptions.base` view at the root of `_transcripts/<Course>/`.

## Notes

`Notes/` has no required structure for user-authored material. Lecture-generated notes live in `Notes/<Course>/Lectures/`, may later contain manual edits, and should not be overwritten casually. Transcripts remain source material.

## Useful commands

```text
lecture transcribe
lecture teach
lecture status
lecture course add "Course Name"
lecture courses
```

Lecture uses OpenRouter for transcription, metadata, and detailed teaching notes. Its API key stays outside this vault.
