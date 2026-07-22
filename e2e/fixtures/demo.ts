import fs from "node:fs";
import type { Page, TestInfo } from "@playwright/test";
import { test as base } from "@playwright/test";
import { holdFor } from "../proof/srt";

export interface Demo {
  step: (title: string, fn: () => Promise<void>) => Promise<void>;
  /** Proof-mode human-paced scroll to an element (instant jump outside proof mode). */
  smoothScrollTo: (target: import("@playwright/test").Locator) => Promise<void>;
}

const PROOF = process.env.E2E_PROOF === "1";

async function showCaption(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    let el = document.getElementById("__e2eCaption");
    if (!el) {
      el = document.createElement("div");
      el.id = "__e2eCaption";
      // Top-center, below the site header: the bottom of the viewport is where this
      // app parks its own sticky promo/countdown bars — a bottom-anchored caption
      // stacked on those read as "two banners" in DJ's review of the first video.
      el.style.cssText =
        "position:fixed;left:50%;top:96px;transform:translateX(-50%);z-index:2147483647;" +
        "background:rgba(0,0,0,.82);color:#fff;padding:10px 22px;border-radius:10px;" +
        "font:600 18px/1.4 system-ui,sans-serif;max-width:80vw;text-align:center;pointer-events:none;" +
        "box-shadow:0 4px 18px rgba(0,0,0,.35);";
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text).catch(() => { /* page may be navigating — caption is best-effort */ });
}

async function showTitleCard(page: Page, title: string): Promise<void> {
  await page.evaluate((t) => {
    const el = document.createElement("div");
    el.id = "__e2eTitleCard";
    el.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;background:#0b0b0e;color:#fff;display:flex;" +
      "align-items:center;justify-content:center;font:700 34px/1.3 system-ui,sans-serif;" +
      "text-align:center;padding:8vw;pointer-events:none;";
    el.textContent = t;
    document.body.appendChild(el);
  }, title).catch(() => {});
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.getElementById("__e2eTitleCard")?.remove()).catch(() => {});
}

export function makeDemo(page: Page, testInfo: TestInfo): { demo: Demo; flush: () => void } {
  const cues: { title: string; startMs: number }[] = [];
  const t0 = Date.now();
  let started = false;

  const demo: Demo = {
    async step(title, fn) {
      if (!PROOF) return base.step(title, fn);
      if (!started) { started = true; await showTitleCard(page, testInfo.title); }
      cues.push({ title, startMs: Date.now() - t0 });
      await showCaption(page, title);
      await page.waitForTimeout(holdFor(title));
      await base.step(title, fn);
      await page
        .screenshot({ path: testInfo.outputPath(`step-${cues.length}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}.png`) })
        .catch(() => {});
    },

    async smoothScrollTo(target) {
      if (!PROOF) { await target.scrollIntoViewIfNeeded(); return; }
      // Human-paced scroll: glide in ~350px increments so the video shows the page
      // flowing past, instead of an instant jump that skips whole sections.
      const targetY = await target.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      await page.evaluate(async (y) => {
        const dest = Math.max(0, y - Math.round(window.innerHeight * 0.35));
        while (Math.abs(window.scrollY - dest) > 40) {
          const dir = dest > window.scrollY ? 1 : -1;
          window.scrollBy({ top: dir * Math.min(350, Math.abs(dest - window.scrollY)), behavior: "smooth" });
          await new Promise((r) => setTimeout(r, 260));
        }
      }, targetY);
      await page.waitForTimeout(400);
    },
  };

  const flush = () => {
    if (PROOF && cues.length) {
      fs.writeFileSync(
        testInfo.outputPath("narration.json"),
        JSON.stringify({ testTitle: testInfo.title, cues, endMs: Date.now() - t0 }, null, 2)
      );
    }
  };
  return { demo, flush };
}
