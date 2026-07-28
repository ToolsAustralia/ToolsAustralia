import { test, expect } from "../../fixtures/test";
import { MEMBER_STATE } from "../../lib/paths";

/**
 * Narrated proof-mode walkthrough of the rewards-return funnel (Phase 1):
 * a member bounced off a locked partner-portal offer lands on /membership with a
 * personalised unlock banner, sees the cheapest package that unlocks their offer,
 * and (when already covered) is pointed straight back to the portal.
 *
 * @demo only — the assertion-focused @smoke coverage for this surface is tracked
 * separately (panel review F-023). Seeded member = active Tradie (50% access).
 *
 * SAFETY: never click "Open partner portal" here — the SSO route POSTs to the REAL
 * iGoDirect production tenant and auto-creates a permanent MyRewards record for the
 * seeded fake member. Highlight only.
 *
 * Selector provenance (adding-a-spec.md refinement rule): all text targets were
 * verified against the live DOM in the 2026-07-24 panel-review captures
 * (banner headline/CTA/meta line, "Open partner portal", dashboard chip) —
 * offer 1064993 = Amazon.com.au eGift Card (100%), offer 1066574 = Witchery
 * eGift Card (40%), both from src/generated/partnerCatalogOffers.ts.
 */
test.describe("rewards-return portal journey", () => {
  // EXTERNAL mode has no seeded member storage state — see runExternal in e2e/run.ts.
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");

  test.use({ storageState: MEMBER_STATE });

  // Same cold-Turbopack characteristic as portal-return-banner.spec.ts (see its header
  // for the measurements). This spec had the identical dependency but a TIGHTER 30s
  // budget and no warm-up (panel F-042) — and a timeout here is worse than a flake,
  // because a proof-mode run is recording: it burns the take mid-narration.
  test.describe.configure({ timeout: 150_000 });

  test.beforeAll(async ({ browser }) => {
    const warm = await browser.newPage();
    try {
      await warm.goto("/membership?utm_campaign=rewards-return&offer_id=1064993", {
        waitUntil: "networkidle",
        timeout: 120_000,
      });
      await warm
        .locator("section", { hasText: "Partner catalogue" })
        .first()
        .and(warm.locator(':not([aria-busy="true"])'))
        .waitFor({ state: "visible", timeout: 120_000 });
    } catch {
      // Best-effort: a warm-up failure must never mask a real assertion below.
    } finally {
      await warm.close();
    }
  });

  test("locked offer to unlocked — the rewards-return banner @demo", async ({ page, demo }) => {
    test.info().annotations.push({
      type: "demo-title",
      description: "Partner portal — from locked offer to unlocked",
    });

    // ── Beat 1: land from the portal with the blocked (100%) offer ────────────
    // Warm the route BEFORE the first beat (proof-mode rule: never caption over a
    // loader): the banner mounts only after the dashboard-state queries resolve,
    // so wait for the offer headline itself.
    await page.goto("/membership?utm_campaign=rewards-return&offer_id=1064993");
    const blockedHeadline = page.getByText(/Amazon\.com\.au eGift Card needs 100%/);
    await expect(blockedHeadline).toBeVisible({ timeout: 60_000 });

    await demo.step(
      "A member taps a locked offer in the partner portal — and lands right here, with that offer front and centre",
      async () => {
        await demo.highlight(blockedHeadline, "Their offer, named");
      }
    );

    await demo.step(
      "The banner shows where their access sits today, and exactly what this offer needs",
      async () => {
        await expect(page.getByText(/You're at 50%/)).toBeVisible();
      }
    );

    const unlockCta = page.getByRole("button", { name: /Unlock with the Boss/i });
    await demo.step(
      "One tap recommends the cheapest way to unlock it — here, the Boss membership",
      async () => {
        await expect(unlockCta).toBeVisible();
        await demo.highlight(unlockCta, "Cheapest package that unlocks it");
      }
    );

    // ── Beat 2: the package ladder below ──────────────────────────────────────
    const tierGrid = page.locator("#membership");
    await demo.step(
      "Every membership and one-time pack sits just below — each one shows how much of the partner catalogue it unlocks",
      async () => {
        await demo.smoothScrollTo(tierGrid);
        await demo.highlight(tierGrid.getByText("100%").first(), "Boss unlocks the full catalogue");
      }
    );

    // ── Beat 3: the covered state (Witchery eGift = 40%, member = 50%) ────────
    await page.goto("/membership?utm_campaign=rewards-return&offer_id=1066574");
    const coveredHeadline = page.getByText(/your 50% access covers Witchery eGift Card/);
    await expect(coveredHeadline).toBeVisible({ timeout: 60_000 });

    await demo.step(
      "Already covered? Then the banner says so — and points the member straight back to the portal to redeem",
      async () => {
        // Highlight only — clicking would hit the real vendor tenant (see header).
        await demo.highlight(
          page.getByRole("button", { name: "Open partner portal" }),
          "Back to the portal"
        );
      }
    );

    // ── Beat 4: the portal stays reachable from the dashboard ─────────────────
    await page.goto("/my-account");
    // Same loader rule as my-account.spec.ts: wait for the entries wallet before captioning.
    await expect(
      page.locator("section").filter({ hasText: "Entries ·" }).first()
    ).toBeVisible({ timeout: 60_000 });

    await demo.step(
      "And the partner portal stays one tap away, right from the member's dashboard",
      async () => {
        await demo.highlight(
          page.getByRole("button", { name: /Partner portal/i }),
          "Always one tap away"
        );
      }
    );
  });
});
