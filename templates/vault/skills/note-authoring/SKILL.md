<!-- generated-by: lecture -->
# Note Authoring

Write notes for later study, not a transcript with its filler removed. Prefer concise explanations that preserve the reasoning a student will need when returning to the material.

## Placement

Use an exact path supplied by the user. Otherwise follow a clear organization already present in `Notes/<Course>/`. If there is no clear organization, place the note directly under `Notes/<Course>/` with a descriptive filename. Do not create a new folder taxonomy for one note.

Before creating a note, inspect likely existing files and improve a relevant note when that is better than making a duplicate. Do not merge unrelated topics just to reduce the file count.

## Content

Choose the structure that fits the subject. Useful material may include definitions, assumptions, theorem statements, proof ideas, examples, worked steps, connections to earlier concepts, and unresolved questions. Use explanatory prose where it is clearer than a list. Avoid stock headings such as “Key Takeaways”, “Conclusion”, or “Why This Matters” unless they genuinely fit.

For mathematics:

- Keep logical dependencies visible.
- Distinguish definitions, theorems, examples, and proofs.
- Include hypotheses and edge cases when they affect the result.
- Use LaTeX where it makes notation clearer.
- Do not manufacture a missing proof step from a garbled transcript; mark an inference or leave the gap explicit.

For other subjects, adapt to the discipline instead of forcing mathematical sections or a lecture-by-lecture template.

## Evidence and links

Use the relevant transcript as a source and preserve uncertainty from ASR. Distinguish what the lecture says from an added explanation or correction. Link to related notes when the link will help navigation; do not add links mechanically.

Write under `Notes/<Course>/`. Never place authored notes under `_transcripts/`, edit raw transcript content, or touch `_audio/`.
