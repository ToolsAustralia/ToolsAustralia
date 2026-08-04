/**
 * packageCardSurface — regression test.
 *
 * Guards the derivation that four package-card surfaces now share
 * (MembershipSection's ElectricPackageCard, PackageSelectionModal's PlanCard,
 * SpecialPackagesModal's PackagesGrid, MembershipModal's PlanSummaryCard).
 *
 * The three cross-tier light-theme background remaps are the reason this module
 * exists: they are invisible to anyone reading only a colour scheme, so a
 * hand-rolled vivid card silently disagrees with the section on those tiers.
 *
 * Run: npm run test:package-card-surface
 */

import assert from "node:assert/strict";
import { getPackageCardSurface } from "../packageCardSurface";
import { getMembershipSectionColorScheme } from "../packageColorScheme";
import { getElectricPackageColorScheme } from "../electricPackageScheme";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

console.log("\npackageCardSurface\n");

// ---------------------------------------------------------------------------
// Cross-tier light-theme background remaps
// ---------------------------------------------------------------------------

test("membership Tradie borrows the one-time Foreman body", () => {
  const surface = getPackageCardSurface("tradie", { isMembershipTab: true });
  assert.equal(surface.body, getElectricPackageColorScheme("foreman-pack").bgGradient);
  // ...and NOT its own scheme's gradient — that is the whole point of the remap.
  assert.notEqual(surface.body, getMembershipSectionColorScheme("tradie", true).bgGradient);
});

test("one-time Boss borrows the membership Foreman body", () => {
  const surface = getPackageCardSurface("boss-pack", { isMembershipTab: false });
  assert.equal(surface.body, getMembershipSectionColorScheme("foreman-subscription", true).bgGradient);
});

test("membership Boss borrows the one-time Power body", () => {
  const surface = getPackageCardSurface("boss", { isMembershipTab: true });
  assert.equal(surface.body, getElectricPackageColorScheme("power-pack").bgGradient);
});

test("a tier with no remap renders its own scheme gradient", () => {
  const surface = getPackageCardSurface("apprentice-pack", { isMembershipTab: false });
  assert.equal(surface.body, getElectricPackageColorScheme("apprentice-pack").bgGradient);
});

test("remaps are keyed off the tab, not the id alone", () => {
  // "tradie" on the one-time tab must NOT take the membership-Tradie remap.
  const oneTimeTradie = getPackageCardSurface("tradie-pack", { isMembershipTab: false });
  assert.equal(oneTimeTradie.body, getElectricPackageColorScheme("tradie-pack").bgGradient);
});

test("remaps apply only in the light theme", () => {
  const dark = getPackageCardSurface("tradie", { isMembershipTab: true, theme: "dark" });
  assert.ok(dark.body.includes("linear-gradient(180deg, #0b0c0f 0%, #060607 100%)"));
});

// ---------------------------------------------------------------------------
// Ink polarity — lime / amber bodies are too bright for white text
// ---------------------------------------------------------------------------

test("ink follows the scheme's black-text flag", () => {
  const schemes = [
    { planId: "tradie", isMembershipTab: true },
    { planId: "foreman", isMembershipTab: true },
    { planId: "boss", isMembershipTab: true },
    { planId: "apprentice-pack", isMembershipTab: false },
    { planId: "power-pack", isMembershipTab: false },
  ];
  for (const s of schemes) {
    const surface = getPackageCardSurface(s.planId, { isMembershipTab: s.isMembershipTab });
    assert.equal(
      surface.ink,
      surface.blackText ? "#0A0A0A" : "#FFFFFF",
      `${s.planId} ink should track blackText`
    );
    // Muted/faint inks must share the ink's polarity or they vanish on the body.
    const expectedChannel = surface.blackText ? "rgba(0,0,0," : "rgba(255,255,255,";
    assert.ok(surface.inkMuted.startsWith(expectedChannel), `${s.planId} inkMuted polarity`);
    assert.ok(surface.inkFaint.startsWith(expectedChannel), `${s.planId} inkFaint polarity`);
  }
});

test("dark theme always uses white ink regardless of tier", () => {
  const surface = getPackageCardSurface("tradie", { isMembershipTab: true, theme: "dark" });
  assert.equal(surface.ink, "#FFFFFF");
  assert.equal(surface.inkMuted, "rgba(255,255,255,0.65)");
});

// ---------------------------------------------------------------------------
// Selection state — the reason the old yellow ring was replaced
// ---------------------------------------------------------------------------

test("selected bloom carries the ink-contrast ring plus the tier accent", () => {
  const surface = getPackageCardSurface("foreman", { isMembershipTab: true });
  assert.ok(surface.bloomSelected.includes(surface.ring), "ring must be in the selected bloom");
  assert.ok(surface.bloomSelected.includes(surface.accentHex), "accent must be in the selected bloom");
  assert.notEqual(surface.bloom, surface.bloomSelected);
});

test("ring contrasts against the body ink", () => {
  for (const planId of ["tradie", "foreman", "boss"]) {
    const surface = getPackageCardSurface(planId, { isMembershipTab: true });
    const ringIsDark = surface.ring.startsWith("rgba(0,0,0");
    assert.equal(ringIsDark, surface.blackText, `${planId}: ring must oppose the body, not match it`);
  }
});

test("border is constant across selection (no layout shift)", () => {
  // The surface exposes exactly one border; selection only swaps the bloom. If a
  // theme-dependent border ever creeps in, consumers would shift on select again.
  const surface = getPackageCardSurface("power-pack", { isMembershipTab: false });
  assert.match(surface.border, /^2px solid #/);
});

// ---------------------------------------------------------------------------
// VIP premium path
// ---------------------------------------------------------------------------

test("VIP is the premium tier and keeps its gradient title", () => {
  const vip = getPackageCardSurface("vip-pack", { isMembershipTab: false });
  assert.equal(vip.isPremium, true, "vip should resolve to the gradient-title scheme");
  assert.ok(
    "backgroundImage" in vip.title || "background" in vip.title,
    "VIP title should keep its gradient, not a flat colour"
  );
});

test("non-premium light title is flat tier ink", () => {
  const surface = getPackageCardSurface("apprentice-pack", { isMembershipTab: false });
  assert.equal(surface.isPremium, false);
  assert.deepEqual(surface.title, { color: surface.ink });
});

// ---------------------------------------------------------------------------
// Shared chrome that must stay identical across themes
// ---------------------------------------------------------------------------

test("price panel and CTA are theme-independent", () => {
  const light = getPackageCardSurface("foreman", { isMembershipTab: true, theme: "light" });
  const dark = getPackageCardSurface("foreman", { isMembershipTab: true, theme: "dark" });
  assert.deepEqual(light.pricePanel, dark.pricePanel);
  assert.deepEqual(light.cta, dark.cta);
});

test("CTA exposes the --ta-cta-accent custom property", () => {
  const surface = getPackageCardSurface("foreman", { isMembershipTab: true });
  const cta = surface.cta as Record<string, unknown>;
  assert.equal(cta["--ta-cta-accent"], surface.accentHex);
});

test("an explicit colorScheme override wins over id resolution", () => {
  const override = getElectricPackageColorScheme("power-pack");
  const surface = getPackageCardSurface("apprentice-pack", {
    isMembershipTab: false,
    colorScheme: override,
  });
  assert.equal(surface.accentHex, override.accentHex);
});

test("unknown plan ids still produce a complete surface", () => {
  const surface = getPackageCardSurface("not-a-real-package", { isMembershipTab: false });
  for (const key of ["body", "border", "sheen", "inset", "bloom", "bloomSelected", "ring", "ink"] as const) {
    assert.ok(surface[key], `${key} should be populated for an unknown id`);
  }
});

console.log(`\n${passed} passed\n`);
if (process.exitCode) {
  console.error("packageCardSurface: FAILED\n");
}
