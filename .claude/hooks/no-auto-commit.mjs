#!/usr/bin/env node
// PreToolUse hook (matcher: Bash).
// Blocks `git commit`, `git add`, `git push`, `gh pr create`, `gh pr merge`
// unless a recent typed user message contains an authorizing keyword.
//
// "Recent" = within the last RECENT_USER_MESSAGE_LIMIT actual text messages
// from the user, walking backward through the transcript. Tool-result
// wrappers (which are also tagged role/type "user" but contain no typed text)
// are skipped so they don't shadow the user's real message after the
// assistant calls tools mid-turn. This means once the user authorizes
// commits during a session, subsequent commits in the same session continue
// to be allowed without re-authorization.
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

// How many actual typed user messages (walking backward) to scan for an
// authorization keyword before giving up. 50 covers any realistic session
// without authorizing across distinct sessions.
const RECENT_USER_MESSAGE_LIMIT = 50;

function isBlockedCommand(cmd) {
  return BLOCKED_PATTERNS.some((re) => re.test(cmd));
}

function extractTypedText(entry) {
  // Returns the typed text of a user message entry, or "" if this entry is
  // a synthetic tool-result wrapper (no typed text).
  const msg = entry.message?.content ?? entry.content ?? "";
  if (typeof msg === "string") return msg;
  if (!Array.isArray(msg)) return "";
  const textParts = msg
    .filter((p) => typeof p === "object" && p !== null && p.type === "text")
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .filter(Boolean);
  return textParts.join(" ");
}

function isAuthorizedInRecentUserMessages(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return false;
  const content = fs.readFileSync(transcriptPath, "utf8");
  const lines = content.split("\n").filter(Boolean);

  let userMessagesChecked = 0;
  for (let i = lines.length - 1; i >= 0 && userMessagesChecked < RECENT_USER_MESSAGE_LIMIT; i--) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; }
    if (entry?.role !== "user" && entry?.type !== "user") continue;

    const text = extractTypedText(entry);
    if (!text) continue; // synthetic tool-result wrapper — skip without counting

    userMessagesChecked++;
    if (AUTHORIZE_KEYWORDS.some((re) => re.test(text))) return true;
  }
  return false;
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;

  let event;
  try { event = JSON.parse(raw); } catch { process.exit(0); }

  const cmd = event?.tool_input?.command ?? "";
  if (!isBlockedCommand(cmd)) process.exit(0);

  if (isAuthorizedInRecentUserMessages(event?.transcript_path)) process.exit(0);

  // Block.
  process.stderr.write(
    `BLOCKED: User has set no-auto-commit. The user must explicitly authorize ` +
    `commits in a recent message of the current session using one of: commit, ` +
    `push, merge, make a PR, create a PR, open a PR, ship it.\n` +
    `Command attempted: ${cmd}\n` +
    `Ask the user: "Want me to run this? \`${cmd}\`"\n`,
  );
  process.exit(2);
}

main().catch(() => process.exit(0));
