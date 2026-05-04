#!/usr/bin/env node
// PreToolUse hook (matcher: Bash).
// Blocks `git commit`, `git add`, `git push`, `gh pr create`, `gh pr merge`
// unless the latest user message contains an authorizing keyword.
//
// Block by exiting with code 2 and writing reason to stderr.
// Allow by exiting 0 (silent).

import fs from "node:fs";
import process from "node:process";

const BLOCKED_PATTERNS = [
  /\bgit\s+commit\b/,
  /\bgit\s+add\b/,
  /\bgit\s+push\b/,
  /\bgh\s+pr\s+create\b/,
  /\bgh\s+pr\s+merge\b/,
];

const AUTHORIZE_KEYWORDS = [
  /\bcommit\b/i,
  /\bpush\b/i,
  /\bmerge\b/i,
  /\bmake (a|an?) PR\b/i,
  /\bcreate (a|an?) PR\b/i,
  /\bopen (a|an?) PR\b/i,
  /\bship it\b/i,
  /\bship this\b/i,
];

function isBlockedCommand(cmd) {
  return BLOCKED_PATTERNS.some((re) => re.test(cmd));
}

function latestUserMessage(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return "";
  // Transcript is JSONL: one JSON object per line. Read backwards to find latest user msg.
  const content = fs.readFileSync(transcriptPath, "utf8");
  const lines = content.split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; }
    if (entry?.role === "user" || entry?.type === "user") {
      const msg = entry.message?.content ?? entry.content ?? "";
      if (typeof msg === "string") return msg;
      if (Array.isArray(msg)) {
        return msg.map((p) => (typeof p === "string" ? p : p.text ?? "")).join(" ");
      }
    }
  }
  return "";
}

function isAuthorized(userMsg) {
  return AUTHORIZE_KEYWORDS.some((re) => re.test(userMsg));
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;

  let event;
  try { event = JSON.parse(raw); } catch { process.exit(0); }

  const cmd = event?.tool_input?.command ?? "";
  if (!isBlockedCommand(cmd)) process.exit(0);

  const userMsg = latestUserMessage(event?.transcript_path);
  if (isAuthorized(userMsg)) process.exit(0);

  // Block.
  process.stderr.write(
    `BLOCKED: User has set no-auto-commit. The user must explicitly authorize ` +
    `this command in their most recent message using one of: commit, push, merge, ` +
    `make a PR, create a PR, open a PR, ship it.\n` +
    `Command attempted: ${cmd}\n` +
    `Ask the user: "Want me to run this? \`${cmd}\`"\n`,
  );
  process.exit(2);
}

main().catch(() => process.exit(0));
