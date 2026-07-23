import type { Page } from "@playwright/test";

/** UI-expert battery (spec §10): overflow, broken images. Returns problems (empty = pass). */
export async function uiAudit(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1) {
      problems.push(`horizontal overflow: scrollWidth ${doc.scrollWidth} > viewport ${doc.clientWidth}`);
    }
    for (const img of Array.from(document.querySelectorAll("img"))) {
      if (img.complete && img.naturalWidth === 0 && img.src && !img.src.startsWith("data:")) {
        problems.push(`broken image: ${img.src.slice(0, 120)}`);
      }
    }
    return problems;
  });
}
