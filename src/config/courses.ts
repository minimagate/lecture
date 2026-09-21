import path from "node:path";
import { readdir } from "node:fs/promises";

export function validateCourseName(name: string): string {
  const value = name.trim();
  if (!value || value === "." || value === ".." || value.includes("/") || value.includes("\\") || /[\u0000-\u001f<>:"|?*]/.test(value)) throw new Error("Invalid course name. Use a normal folder name without path separators or reserved characters.");
  if (process.platform === "win32" && /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(value)) throw new Error("Invalid course name: Windows reserves that name.");
  return value;
}

export async function listCourses(vaultRoot: string): Promise<string[]> {
  const entries = await readdir(path.join(vaultRoot, "Notes"), { withFileTypes: true }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  });
  return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
}
