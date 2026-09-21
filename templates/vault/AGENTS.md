<!-- generated-by: lecture -->
# University Workspace

## Purpose

This is a university study workspace managed partly by the `lecture` CLI. Help the user understand course material, answer questions, work from existing course context, and create useful study notes. The filesystem is the source of truth for the workspace.

## Workspace map

### `Notes/`

- User-authored and agent-assisted study material.
- Writable.
- Intentionally flexible: there is no required taxonomy.
- Preserve the organization already present; do not reorganize broadly unless asked.

### `_transcripts/`

- Generated lecture corpus, primarily read-only.
- Each Markdown file represents one processed lecture.
- YAML frontmatter stores `type`, `course`, `date`, `title`, `summary`, `source_audio`, `duration_seconds`, `transcription_model`, `metadata_model`, `metadata_status`, and `transcribed_at`.
- The body contains the raw ASR result under `## Transcript`.
- Read freely, but do not rewrite transcript text or metadata as part of unrelated work. Never silently correct it.

### `_audio/`

- Original lecture recordings and immutable source material.
- Never rename, delete, move, edit, replace, or create files here.

### `*.base`

- Obsidian Bases views: a presentation and query layer, not authoritative data.
- Do not duplicate transcript metadata into them.
- Do not edit a Base unless the user explicitly asks.

## Course correspondence

A course named `Analisi I` normally maps to:

```text
Notes/Analisi I/
_transcripts/Analisi I/
_audio/Analisi I/
```

Use this correspondence when gathering context. Course names are directory names; preserve their spelling.

## Context gathering

For a question about a course:

1. Identify the course.
2. Inspect `Notes/<Course>/` first for authored knowledge.
3. List transcript filenames, dates, titles, and summaries under `_transcripts/<Course>/`.
4. Select only likely relevant transcripts.
5. Read full transcript bodies when they are needed.
6. Prefer existing notes over recreating the same material.

Do not scan every transcript in every course when a smaller set answers the question.

## Writing notes

- Write study material under `Notes/<Course>/`.
- Follow the current organization. If none is clear, put the note directly in the course folder instead of inventing a hierarchy.
- Use normal Markdown and Obsidian links when they genuinely help.
- Prefer one useful note over many tiny files.
- Do not put authored notes under `_transcripts/` and never modify `_audio/`.

## Source fidelity

`_transcripts/` is source material; `Notes/` is curated understanding. ASR can misrecognize names, formulas, and symbols. Distinguish transcript wording from your explanation, use surrounding context to resolve small errors, and state uncertainty when it matters. Never alter the stored transcript because you inferred the intended wording.

When asked what the professor said, prioritize transcript evidence. For a conceptual explanation, you may go beyond the lecture, but distinguish outside explanation from lecture content when relevant.

## Skills

Additional procedures live in `.agents/skills/`. Read the relevant skill for the task instead of loading every skill every time. `vault-structure` explains files and metadata, `course-context` explains efficient research, and `note-authoring` explains how to write study material.

## Explicit intent required

Ask before deleting notes, reorganizing a course, renaming many files, modifying Bases, touching generated transcripts, or changing `.agents/` or `AGENTS.md`. `_audio/` is never to be modified.
