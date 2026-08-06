/**
 * Shared guard: every surface/ink token a UI primitive renders must carry a `dark:` pair.
 *
 * WHY THIS IS SHARED RATHER THAN INLINE (2026-08-06)
 * --------------------------------------------------
 * The first version of this lived inside `Card.test.ts` and guarded Card alone. That is a
 * one-file assertion, not a class guard — and an audit immediately found the same defect
 * sitting live in a sibling the harness was already wired for: `Badge` shipped
 * `bg-[#e0f9ff] text-[#0b7e88]` (pastel surface, deep ink — correct on white, ~3:1 on a dark
 * panel) with no dark arms at all, and `npm run test:ui-primitives` stayed green.
 *
 * The failure this catches is invisible in review, because each half looks right on its own:
 * a light-only primitive renders "fine" until a child themes itself, at which point you get
 * light-on-light or dark-on-dark and nobody notices until a customer is looking at an
 * unreadable Order Summary mid-payment.
 *
 * Three things it does that the Card-only version did not:
 * - Keys per TOKEN, not per property. `bg-white` + `dark:text-…` used to satisfy the check
 *   for `bg-`, because it only asked whether ANY `dark:bg-` existed somewhere in the markup.
 * - Matches arbitrary hex (`bg-[#e0f9ff]`) and the gray/slate/zinc scales, not just
 *   `neutral-*`. Every real defect found so far used one of those.
 * - Is driven over every variant x tone combination by the caller, so a single broken tone
 *   cannot hide behind a healthy default.
 */

/** Tokens that paint a surface or ink and therefore owe a dark counterpart. */
const THEMEABLE =
  /^(bg|text|border)-(white|black|(?:neutral|gray|slate|zinc)-\d{2,3}|\[#[0-9a-fA-F]{3,8}\])$/;

/**
 * An element that paints its OWN opaque surface — a gradient, or a saturated solid like
 * `bg-red-600` — does not owe its ink a dark arm: white text on a red button is correct in
 * both themes because the red is the button's, not the page's.
 *
 * This exemption is why the check is per-ELEMENT rather than per-document. The first version
 * scanned all classes at once and flagged `text-white` on the filled primary button — a false
 * positive, and a guard that cries wolf is a guard someone deletes.
 */
function hasOwnSurface(tokens: string[]): boolean {
  return tokens.some(
    (t) =>
      t.startsWith("bg-gradient-") ||
      /^bg-\[#[0-9a-fA-F]{3,8}\]$/.test(t) ||
      /^bg-(?!white$|black$|neutral-|gray-|slate-|zinc-)[a-z]+-\d{3}$/.test(t)
  );
}

/**
 * Assert that every themeable token in `html` has a `dark:` counterpart for the same property.
 *
 * `label` identifies the case (e.g. `Badge tone=tier-tradie`) so a failure names the exact
 * variant rather than the component.
 *
 * Returns the tokens it checked, so a caller can assert it actually inspected something —
 * a regex that stops matching would otherwise make this pass forever.
 */
export function assertThemePaired(html: string, label: string): string[] {
  const checked: string[] = [];

  // Per element: a pair only counts if it is on the SAME element as the token it answers for.
  for (const match of html.matchAll(/class="([^"]*)"/g)) {
    const tokens = match[1].split(/\s+/).filter(Boolean);
    const selfColoured = hasOwnSurface(tokens);

    for (const token of tokens) {
      if (!THEMEABLE.test(token)) continue;
      const property = token.split("-")[0];
      // On a self-coloured surface, both the ink AND the trim belong to the component rather
      // than the page — white text and a gold border on a gold gradient chip are correct in
      // either theme. Only `bg-` would still matter there, and a gradient/arbitrary fill does
      // not match THEMEABLE in the first place. See `hasOwnSurface`.
      if (selfColoured && (property === "text" || property === "border")) continue;
      checked.push(token);
      if (!tokens.some((t) => t.startsWith(`dark:${property}-`))) {
        throw new Error(
          `${label}: "${token}" has no dark: counterpart on the same element — it will ` +
            `render light-on-light (or dark-on-dark) the moment a child themes itself.`
        );
      }
    }
  }

  return checked;
}
