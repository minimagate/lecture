import YAML from "yaml";

export type Frontmatter = Record<string, unknown>;

export function parseMarkdown(content: string): { frontmatter: Frontmatter; body: string } {
  const match = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/.exec(content);
  if (!match) return { frontmatter: {}, body: content };
  const value = YAML.parse(match[1]);
  return { frontmatter: value && typeof value === "object" ? value as Frontmatter : {}, body: content.slice(match[0].length) };
}

export function stringifyFrontmatter(frontmatter: Frontmatter, body: string): string {
  return `---\n${YAML.stringify(frontmatter).trimEnd()}\n---\n\n${body.trimStart()}`;
}

export function vaultRelativePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}
