/**
 * Adds Tailwind dark-mode text colors after gray body text utilities when missing.
 * Skips packageColorScheme.ts (textOnLight / featureOnLight for literal light surfaces).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "src");
const SKIP_FILES = new Set(["packageColorScheme.ts"]);

/** Optional opacity / arbitrary opacity */
const OP = "(?:/(?:\\[[^\\]]+\\]|\\d+))?";

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".next") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(tsx|ts)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

function patch(s) {
  const patterns = [
    { re: new RegExp(`hover:text-gray-700${OP}`, "g"), add: " dark:hover:text-neutral-200", check: /^\s+dark:hover:text-/ },
    { re: new RegExp(`hover:text-gray-800${OP}`, "g"), add: " dark:hover:text-neutral-100", check: /^\s+dark:hover:text-/ },
    { re: new RegExp(`hover:text-gray-600${OP}`, "g"), add: " dark:hover:text-neutral-300", check: /^\s+dark:hover:text-/ },
  ];

  for (const { re, add, check } of patterns) {
    s = s.replace(re, (full, offset, str) => {
      const tail = str.slice(offset + full.length, offset + full.length + 32);
      if (check.test(tail)) return full;
      return full + add;
    });
  }

  const textPatterns = [
    { re: new RegExp(`(?<![\\w-])text-gray-700${OP}`, "g"), add: " dark:text-neutral-200" },
    { re: new RegExp(`(?<![\\w-])text-gray-800${OP}`, "g"), add: " dark:text-neutral-100" },
    { re: new RegExp(`(?<![\\w-])text-gray-600${OP}`, "g"), add: " dark:text-neutral-400" },
  ];

  for (const { re, add } of textPatterns) {
    s = s.replace(re, (full, offset, str) => {
      const tail = str.slice(offset + full.length, offset + full.length + 36);
      if (/^\s+dark:text-/.test(tail)) return full;
      return full + add;
    });
  }

  return s;
}

let changedFiles = 0;

for (const file of walk(ROOT)) {
  if (SKIP_FILES.has(path.basename(file))) continue;
  const orig = fs.readFileSync(file, "utf8");
  if (!orig.includes("text-gray-")) continue;
  const next = patch(orig);
  if (next !== orig) {
    fs.writeFileSync(file, next, "utf8");
    changedFiles++;
  }
}

console.log(`Patched ${changedFiles} file(s) under src/.`);
