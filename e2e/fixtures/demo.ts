import fs from "node:fs";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { test as base } from "@playwright/test";
import { holdFor } from "../proof/srt";

export interface Demo {
  step: (title: string, fn: () => Promise<void>) => Promise<void>;
  /** Proof-mode human-paced scroll to an element (instant jump outside proof mode). */
  smoothScrollTo: (target: Locator) => Promise<void>;
  /**
   * Proof-mode visual spotlight: draws a bright ring + dimmed backdrop (+ optional note
   * label) around `target`'s current boundingBox so a viewer knows WHERE to look
   * (video-review.md Judge H — "ring/glow + dimmed surroundings"; also what kills
   * "no competing noise" deductions, since the site's own attention magnets dim along
   * with everything else outside the ring). No-op outside proof mode. Safe to call
   * again within the SAME beat to move the spotlight onto a later click target — see
   * implementation comment for the "highlight after scroll settles" constraint.
   */
  highlight: (target: Locator, note?: string) => Promise<void>;
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

/**
 * Draws (or replaces) a spotlight ring around `target`'s current boundingBox: a fixed
 * full-viewport-positioned `#__e2eHighlight` div with a bright outline + pulsing glow,
 * plus an optional small note label pinned to its top-left corner (or bottom-left if
 * there isn't room above). One fixed id — a second call REPLACES the ring rather than
 * stacking a new one, so a step never accidentally leaves two spotlights on screen.
 *
 * CONSTRAINT (documented, not a bug): this reads the boundingBox ONCE and does not
 * track scroll/resize afterward — there is no `scroll`/`ResizeObserver` listener
 * keeping the ring glued to a moving target. That's fine for this app's demo specs
 * because every call site scrolls (`demo.smoothScrollTo`) and lets the glide finish
 * BEFORE calling `highlight` — by the time the ring is drawn the page is static for
 * the rest of that beat. If a future spec calls `highlight` and then scrolls again
 * within the same beat, the ring will visibly drift from its subject; re-call
 * `highlight` after the new scroll settles instead of expecting it to follow.
 *
 * The same constraint bites when the TARGET ITSELF changes size mid-beat, not just when
 * the page scrolls — e.g. highlighting a modal panel and then triggering an action that
 * makes that panel grow (a wizard step transition adding content). The ring keeps its
 * original, now-too-small box. Prefer highlighting something that stays a fixed size for
 * the rest of the beat, or end the beat before the resizing action's effect lands on
 * screen (`demo.step` clears any highlight automatically at the start of the NEXT beat,
 * so a stale ring is at worst visible for the tail of the current one, never longer).
 *
 * DIMMED BACKDROP (video-review.md polish round, 2026-07-22): the ring's box-shadow
 * includes a second, huge-spread shadow (`0 0 0 9999px rgba(0,0,0,.55)`) — the standard
 * "spotlight cutout" CSS trick (same technique onboarding-tour libraries use): because
 * the ring div is sized exactly to the target's boundingBox with a transparent interior,
 * the far-spread shadow darkens the ENTIRE rest of the viewport while leaving the target
 * itself untouched. This both satisfies Judge H's "ring/glow + dimmed surroundings" and
 * removes competing noise for free — a sticky site widget sharing the frame with a
 * highlight now dims along with everything else instead of fighting the ring for
 * attention. If a beat needs to highlight a SECOND element before its own click (e.g.
 * the click target lives outside the first highlighted box), call `demo.highlight` again
 * with the new target — it replaces the single fixed-id ring/dim rather than stacking.
 */
async function showHighlight(page: Page, target: Locator, note?: string): Promise<void> {
  // Safety net, not the primary motion: smoothScrollTo already did the human-paced
  // glide; this just guards against a caller forgetting to scroll at all (which would
  // otherwise draw the ring at an off-screen boundingBox — invisible in the video).
  await target.scrollIntoViewIfNeeded().catch(() => {});
  // Some subjects (a Stripe PaymentElement iframe behind a "preparing checkout" loading
  // state, content gated behind an API round-trip) aren't attached/visible the instant a
  // step reaches for them — a single boundingBox() attempt would silently no-op. Give the
  // target a real chance to show up first; boundingBox() below still tolerates a timeout.
  await target.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  const box = await target.boundingBox().catch(() => null);
  if (!box) return; // target not visible/attached — nothing sane to draw
  await page
    .evaluate(
      ({ box, note }) => {
        if (!document.getElementById("__e2eHighlightStyle")) {
          const style = document.createElement("style");
          style.id = "__e2eHighlightStyle";
          // Cyan/blue, not this app's own brand red: nearly every CTA and active-state
          // border on this site is already red (verified live in the showcase spec's
          // first render — a red ring on a red "Enter now" button was barely visible),
          // so the spotlight needs a colour that contrasts with the app's OWN palette,
          // not just with light/dark page backgrounds.
          // Each keyframe pairs the small pulsing cyan glow with a fixed, huge-spread
          // dark shadow (the dimmed-backdrop "spotlight cutout" — see the doc comment
          // above showHighlight) so the dim never itself pulses/flickers, only the ring.
          style.textContent =
            "@keyframes __e2eHighlightPulse{" +
            "0%,100%{box-shadow:0 0 0 6px rgba(0,194,255,.35),0 0 0 9999px rgba(0,0,0,.55)}" +
            "50%{box-shadow:0 0 0 10px rgba(0,194,255,.16),0 0 0 9999px rgba(0,0,0,.55)}" +
            "}";
          document.head.appendChild(style);
        }
        let el = document.getElementById("__e2eHighlight");
        if (!el) {
          el = document.createElement("div");
          el.id = "__e2eHighlight";
          document.body.appendChild(el);
        }
        el.innerHTML = ""; // drop any previous note label before redrawing
        el.style.cssText =
          `position:fixed;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;` +
          "z-index:2147483646;pointer-events:none;border-radius:10px;box-sizing:border-box;" +
          "border:3px solid #00c2ff;animation:__e2eHighlightPulse 1.1s ease-in-out infinite;";
        if (note) {
          const label = document.createElement("div");
          label.textContent = note;
          const roomAbove = box.y > 34;
          label.style.cssText =
            `position:absolute;left:0;${roomAbove ? "top:-30px" : `top:${box.height + 6}px`};` +
            "background:#00a8e0;color:#fff;font:600 12px/1.3 system-ui,sans-serif;" +
            "padding:4px 9px;border-radius:6px;white-space:nowrap;pointer-events:none;";
          el.appendChild(label);
        }
      },
      { box, note }
    )
    .catch(() => { /* page may be navigating — highlight is best-effort, like the caption */ });
  // Guaranteed minimum dwell so the ring is actually watchable before the caller's next
  // action (a click, a fill) moves on — without this, a highlight immediately followed by
  // a fast action could be on screen for only a couple of video frames. No-op cost outside
  // proof mode: `demo.highlight` (the only caller) already short-circuits before this runs.
  await page.waitForTimeout(500);
}

async function clearHighlight(page: Page): Promise<void> {
  await page.evaluate(() => document.getElementById("__e2eHighlight")?.remove()).catch(() => {});
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
  let titleCardAtMs: number | undefined;

  // Client-facing display title: a spec can push a `demo-title` annotation
  // (test.info().annotations.push({ type: "demo-title", description: "..." })) to give the
  // opening card human copy. Without it the card falls back to testInfo.title — which is a
  // SPEC id ("payment → webhook → 15 entries exactly once"), fine for engineers, jargon for
  // the client audience proof mode exists for (video-review.md Judge N: explains, not labels).
  // MUST be resolved lazily (at first demo.step, not here): makeDemo runs during FIXTURE
  // setup, before the test body executes — an eager lookup always misses the annotation the
  // body pushes (frame-verified: the card kept the spec id on the first eager attempt).
  const displayTitle = () =>
    testInfo.annotations.find((a) => a.type === "demo-title")?.description ?? testInfo.title;

  const demo: Demo = {
    async step(title, fn) {
      if (!PROOF) return base.step(title, fn);
      if (!started) {
        started = true;
        // Timestamp BEFORE the card renders: post.ts trims the shipped mp4 to start here,
        // cutting the white page-load lead-in that Playwright's context-wide recording
        // otherwise opens with (frame-verified defect, 2026-07-22: ~2.2s of blank white
        // before the card — the author panel's cue-midpoint frame set never looked there).
        titleCardAtMs = Date.now() - t0;
        await showTitleCard(page, displayTitle());
      }
      await clearHighlight(page); // stale spotlight from the previous beat must not bleed into this one's caption
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

    async highlight(target, note) {
      if (!PROOF) return; // zero overhead outside proof mode, same contract as every other demo method
      await showHighlight(page, target, note);
    },
  };

  const flush = () => {
    if (PROOF && cues.length) {
      fs.writeFileSync(
        testInfo.outputPath("narration.json"),
        JSON.stringify(
          { testTitle: testInfo.title, displayTitle: displayTitle(), titleCardAtMs, cues, endMs: Date.now() - t0 },
          null,
          2
        )
      );
    }
  };
  return { demo, flush };
}
