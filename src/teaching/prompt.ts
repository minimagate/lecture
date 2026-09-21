export function teachingPrompt(course: string, date: string, title: string, transcript: string): string {
  return String.raw`You are converting a university lecture transcript into detailed study notes.

The notes must faithfully preserve essentially all meaningful academic content from the lecture while removing verbal noise, repetition, hesitation and classroom logistics. This is NOT a summary. The resulting document should be detailed enough that a student can study from it without rereading the transcript.

Write in Italian unless the source material clearly requires another language. Organize the material according to its actual conceptual structure rather than the order of individual sentences.

Preserve definitions, terminology, notation, assumptions, theorems and propositions, proof structure and reasoning, derivations, examples, counterexamples, explanations, intuitions, professor remarks, caveats, warnings, common mistakes, exercises or questions discussed, and connections to previous material. Do not turn everything into bullet points. Prefer explanatory prose, mathematical blocks and structured sections where they improve readability. Use LaTeX mathematical notation where the intended mathematics is sufficiently clear, preserving variable names, quantifiers, hypotheses and conclusions.

The generated note will be saved directly as an Obsidian Markdown file. Format the entire response as valid Obsidian-compatible Markdown.

For mathematics, use Obsidian's MathJax/LaTeX syntax:

- Inline mathematics: $a_n \to L$
- Display mathematics:

  $$
  \lim_{n\to\infty} a_n = L
  $$

Use standard LaTeX commands inside math delimiters, such as:

- \frac{1}{n}
- \sqrt{x}
- \varepsilon
- \forall
- \exists
- \mathbb{N}
- \left|a_n-L\right|
- \begin{aligned} ... \end{aligned}

Important formatting rules:

- Never put mathematical expressions inside fenced code blocks.
- Do not use latex or math fenced blocks for equations.
- Do not use Unicode approximations when clear LaTeX notation is more appropriate.
- Do not use \( ... \) or \[ ... \]; consistently use $...$ and $$...$$.
- Output actual Markdown/LaTeX, not escaped Markdown intended for JSON display.
- Preserve normal single LaTeX backslashes in the final Markdown file.
- Use normal Markdown headings with #, ##, and ###.
- Use paragraphs by separating them with blank lines.
- Use lists only when structurally appropriate.
- Do not include a surrounding Markdown code fence or YAML frontmatter; return only the note body.

Prefer readable mathematical exposition. Short expressions belong inline; important equations, definitions, derivations, theorem statements, and multi-step calculations should generally use display math.

Do not invent missing information or silently correct genuinely unclear formulas, names or technical statements. If a meaningful passage is uncertain, state that uncertainty explicitly. Do not add unrelated textbook content, generic sections such as Key Takeaways or Conclusion, mention AI, or discuss transcription. Return only the final Markdown note body.

Course: ${course}
Date: ${date}
Title: ${title}

Complete transcript:
${transcript}`;
}
