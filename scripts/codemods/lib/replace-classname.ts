/**
 * Map a hex color literal (lowercase, with `#`) to a Tailwind token name.
 * Returns null if the hex is not in the snap map — caller decides what to do.
 */
export type HexSnapMap = Readonly<Record<string, string>>;

/**
 * Replace all matches of `[#hex]` arbitrary values in className strings.
 *
 * Matches:
 *   - bg-[#ee0000], text-[#cc0000], border-[#FF4444], from-[#ee0000]
 *   - With prefixes: hover:bg-[#ee0000], dark:text-[#ee0000], group-hover:from-[#cc0000]
 *   - With opacity modifiers: bg-[#ee0000]/50, text-[#ee0000]/80
 *   - Any leading variant chain: focus-within:dark:hover:bg-[#ee0000]/30
 *
 * Does NOT match:
 *   - Hex inside CSS gradient strings: `bg-[linear-gradient(180deg,#ee0000,#cc0000)]`
 *     (these are arbitrary CSS, not arbitrary color tokens; safelist covers them)
 *   - Hex inside template literals: `` `bg-[${color}]` `` (regex doesn't see them either way)
 *   - Hex in `style={{}}` JSX inline styles
 *
 * Returns the rewritten content and a list of replacements made.
 */
export interface Replacement {
  before: string;
  after: string;
  line: number;
}

export function rewriteHexArbitraries(
  content: string,
  snapMap: HexSnapMap,
  unmappedHexes: Set<string>
): { content: string; replacements: Replacement[] } {
  const replacements: Replacement[] = [];

  // Match: optional variant prefix chain (`a-b:`), utility name, `[#hex]`, optional `/opacity`
  // Utility name char class: lowercase + digits + hyphen (e.g. "bg", "text", "from", "to", "via",
  // "border", "ring", "shadow", "fill", "stroke", "outline", "decoration", "accent", "caret",
  // "divide", "placeholder", "selection")
  const re = /((?:[a-z][\w-]*:)*)([a-z][a-z0-9-]*)-\[(#[0-9a-fA-F]{3,8})\](\/[\d.]+)?/g;

  const newContent = content.replace(re, (match, prefixes: string, util: string, hex: string, opacity: string | undefined) => {
    const lowerHex = hex.toLowerCase();
    const token = snapMap[lowerHex];
    if (!token) {
      unmappedHexes.add(lowerHex);
      return match; // leave untouched
    }
    // The util prefix stays the same: bg-[#ee0000] → bg-red-600, from-[#ee0000] → from-red-600
    const out = `${prefixes}${util}-${token}${opacity ?? ""}`;
    // Track the replacement (line lookup happens below)
    replacements.push({ before: match, after: out, line: 0 });
    return out;
  });

  // Backfill line numbers — cheap to do once
  if (replacements.length > 0) {
    const lines = content.split("\n");
    let cursor = 0;
    for (const r of replacements) {
      cursor = content.indexOf(r.before, cursor);
      if (cursor === -1) continue;
      let lineNum = 1;
      let charCount = 0;
      for (const ln of lines) {
        if (charCount + ln.length + 1 > cursor) break;
        charCount += ln.length + 1;
        lineNum++;
      }
      r.line = lineNum;
      cursor += r.before.length;
    }
  }

  return { content: newContent, replacements };
}

/**
 * Replace all matches of `text-[Npx]` (or any single-utility size literal) in className.
 * Matches: text-[10px], hover:text-[10px], dark:text-[8px]/80
 * Generic enough to be reused for any utility/value pair.
 */
export interface SizeMap {
  utility: string;          // e.g. "text"
  values: Record<string, string>; // e.g. { "10px": "2xs", "8px": "3xs" }
}

export function rewriteArbitrarySizes(
  content: string,
  map: SizeMap,
  unmappedValues: Set<string>
): { content: string; replacements: Replacement[] } {
  const replacements: Replacement[] = [];
  const re = new RegExp(
    `((?:[a-z][\\w-]*:)*)(${map.utility})-\\[([^\\]]+)\\](\\/[\\d.]+)?`,
    "g"
  );
  const newContent = content.replace(re, (match, prefixes: string, util: string, value: string, opacity: string | undefined) => {
    const token = map.values[value];
    if (!token) {
      unmappedValues.add(value);
      return match;
    }
    const out = `${prefixes}${util}-${token}${opacity ?? ""}`;
    replacements.push({ before: match, after: out, line: 0 });
    return out;
  });
  return { content: newContent, replacements };
}

/**
 * Replace exact arbitrary values (no opacity modifier) for layout utilities.
 * Used by sweep-header-offsets: `pt-[86px]` → `pt-[var(--app-header-h)]`.
 */
export function rewriteExactArbitrary(
  content: string,
  utility: string,
  fromValue: string,
  toValue: string
): { content: string; replacements: Replacement[] } {
  const replacements: Replacement[] = [];
  // Escape regex metachars in fromValue
  const escaped = fromValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `((?:[a-z][\\w-]*:)*)(${utility})-\\[${escaped}\\]`,
    "g"
  );
  const newContent = content.replace(re, (match, prefixes: string, util: string) => {
    const out = `${prefixes}${util}-[${toValue}]`;
    replacements.push({ before: match, after: out, line: 0 });
    return out;
  });
  return { content: newContent, replacements };
}
