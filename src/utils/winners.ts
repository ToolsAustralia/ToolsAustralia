import type { WinnerSummary } from "@/types/winner";

const BLOCK_TAG_BREAKS = /<\/(p|div|li|blockquote|ul|ol|h[1-6])>|<br\s*\/?>/gi;
const STRIP_TAGS = /<[^>]+>/g;
const SCRIPT_STYLE_BLOCKS = /<(script|style)[^>]*>[\s\S]*?<\/\1>/gi;

function decodeBasicHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function stripRichTextHtml(html?: string | null) {
  if (!html) return "";

  return decodeBasicHtmlEntities(
    html
      .replace(SCRIPT_STYLE_BLOCKS, " ")
      .replace(BLOCK_TAG_BREAKS, "\n")
      .replace(STRIP_TAGS, " ")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function hasWinnerTestimony(winner: Pick<WinnerSummary, "testimony">) {
  return stripRichTextHtml(winner.testimony).length > 0;
}

export function getWinnerTestimonyExcerpt(testimony?: string | null, maxLength = 220) {
  const plainText = stripRichTextHtml(testimony);

  if (plainText.length <= maxLength) {
    return plainText;
  }

  const truncated = plainText.slice(0, maxLength);
  const safeBreakpoint = truncated.lastIndexOf(" ");

  return `${(safeBreakpoint > 120 ? truncated.slice(0, safeBreakpoint) : truncated).trim()}...`;
}

export function getWinnerDisplayDate(winner: Pick<WinnerSummary, "selectedDate" | "wonOnDate">) {
  const date = new Date(winner.wonOnDate ?? winner.selectedDate);

  return date.toLocaleDateString("en-AU", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function getWinnerSearchableContent(winner: WinnerSummary) {
  return [
    winner.drawName,
    winner.prize.name,
    winner.prize.description,
    winner.selectedPrize,
    winner.winnerFirstName,
    winner.winnerLastName,
    winner.winnerState,
    stripRichTextHtml(winner.testimony),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
