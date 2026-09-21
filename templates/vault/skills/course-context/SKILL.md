<!-- generated-by: lecture -->
# Course Context

Use progressive context gathering. Start with the smallest useful set of files and expand only when the question requires it.

## Default procedure

1. Identify the course and inspect `Notes/<Course>/`.
2. List files under `_transcripts/<Course>/` with their dates, titles, summaries, and `metadata_status`.
3. Use titles and summaries to select candidate lectures.
4. Read the smallest relevant set of full transcript bodies.
5. Expand to neighboring or earlier lectures only if context is missing.

Do not read an entire semester by default. Existing notes are usually the best guide to what the user already understands and how the course is organized.

## Match the question

For a specific lecture, use its date, title, course directory, and, when useful, `source_audio` to identify the transcript. Read that transcript and nearby notes rather than searching every course.

For a theorem or topic spanning lectures, search titles and summaries first, then read the selected lectures in date order. Connect them to existing notes without flattening the user's organization.

For a progress summary, inspect the course's notes and the ordered list of transcript metadata. Read full bodies only where summaries leave an important gap. Say which material was available and which was not.

For “what did the professor say about X?”, prioritize direct transcript evidence. Quote or paraphrase carefully and identify the lecture. Do not present a general textbook explanation as something the professor said.

If a note conflicts with a transcript, preserve the distinction: notes may be a later correction or interpretation, while the transcript is evidence of what was said. Explain the conflict and ask when it cannot be resolved from context.

## ASR uncertainty

Transcripts are automatic speech recognition, not polished lecture notes. Names, technical terms, formulas, and symbols are especially error-prone. Use surrounding sentences, neighboring lectures, and existing notes to test an interpretation. Do not invent an exact formula or quotation when the transcript does not support it. Mark an inference as an inference.

When explaining beyond the lecture, label the added explanation when the difference could matter. Keep the raw transcript unchanged.
