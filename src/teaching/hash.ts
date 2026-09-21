import { createHash } from "node:crypto";

export function sourceHash(content: string): string {
  return `sha256:${createHash("sha256").update(content.replaceAll("\r\n", "\n").trim(), "utf8").digest("hex")}`;
}
