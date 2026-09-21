export function teachingPrompt(course: string, date: string, title: string, transcript: string): string {
  return `You are converting a university lecture transcript into detailed study notes.

The notes must faithfully preserve essentially all meaningful academic content from the lecture while removing verbal noise, repetition, hesitation and classroom logistics. This is NOT a summary. The resulting document should be detailed enough that a student can study from it without rereading the transcript.

Write in Italian unless the source material clearly requires another language. Organize the material according to its actual conceptual structure rather than the order of individual sentences.

Preserve definitions, terminology, notation, assumptions, theorems and propositions, proof structure and reasoning, derivations, examples, counterexamples, explanations, intuitions, professor remarks, caveats, warnings, common mistakes, exercises or questions discussed, and connections to previous material. Do not turn everything into bullet points. Prefer explanatory prose, mathematical blocks and structured sections where they improve readability. Use LaTeX mathematical notation where the intended mathematics is sufficiently clear, preserving variable names, quantifiers, hypotheses and conclusions.

Do not invent missing information or silently correct genuinely unclear formulas, names or technical statements. If a meaningful passage is uncertain, state that uncertainty explicitly. Do not add unrelated textbook content, generic sections such as Key Takeaways or Conclusion, mention AI, or discuss transcription. Return only the final Markdown note body.

Course: ${course}
Date: ${date}
Title: ${title}

Complete transcript:
${transcript}`;
}
