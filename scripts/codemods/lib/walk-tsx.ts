import { promises as fs } from "node:fs";
import * as path from "node:path";

/**
 * Recursively walk a directory and yield every file matching one of `extensions`.
 * Skips `node_modules`, `.next`, `.git`, `dist`, `build`, hidden dirs, and any
 * path matching `excludeGlobs` (substring match — keep them simple).
 */
export async function* walk(
  root: string,
  extensions: readonly string[],
  excludeGlobs: readonly string[] = []
): AsyncGenerator<string> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    // Skip directories we never want to walk into
    if (entry.isDirectory()) {
      if (
        entry.name.startsWith(".") ||
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === "build"
      ) {
        continue;
      }
      yield* walk(fullPath, extensions, excludeGlobs);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!extensions.includes(ext)) continue;
    // Substring-match exclude (cross-platform: normalize separators)
    const normalized = fullPath.replace(/\\/g, "/");
    if (excludeGlobs.some((g) => normalized.includes(g))) continue;
    yield fullPath;
  }
}
