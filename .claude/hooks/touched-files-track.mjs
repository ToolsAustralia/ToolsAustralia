#!/usr/bin/env node
// PostToolUse hook (matcher: Edit|Write|MultiEdit|NotebookEdit).
// Appends each edited absolute path to .claude/.touched-files.
// Stays silent unless something is broken.
//
// Hook input format (stdin JSON):
//   { "hook_event_name": "PostToolUse", "tool_name": "Edit",
//     "tool_input": { "file_path": "/abs/path/to/file.ts", ... }, ... }

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const TRACKER_PATH = ".claude/.touched-files";

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    // Malformed input — fail silently, do not block.
    process.exit(0);
  }

  const filePath = event?.tool_input?.file_path;
  if (!filePath) process.exit(0);

  // Only track files inside the repo. Filter absolute paths to relative.
  const cwd = process.cwd();
  let relPath = filePath;
  if (path.isAbsolute(filePath)) {
    const r = path.relative(cwd, filePath);
    // If the file is outside the repo, don't track it.
    if (r.startsWith("..")) process.exit(0);
    relPath = r;
  }
  relPath = relPath.replace(/\\/g, "/");

  // Append. Deduplication happens in the Stop hook (read-side).
  fs.mkdirSync(path.dirname(TRACKER_PATH), { recursive: true });
  fs.appendFileSync(TRACKER_PATH, relPath + "\n");

  process.exit(0);
}

main().catch(() => process.exit(0));
