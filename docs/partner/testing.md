# Partner — Testing

> _TODO: enumerate test files._

## Manual smoke

- Subscribe → check queue `start` row
- Renew → check `renew` row
- Cancel immediately → check `end` row immediately
- Cancel at period end → wait until period; check `end` triggers

## Automated

| Command | Covers |
|---|---|
| `npm run test:partner-consent` | **Anti-drift guard (2026-07-31).** Signs an SSO token with every optional claim populated, reads the claim set back off the JWT, and asserts the consent sheet's disclosed key set matches it **exactly** — under-disclosure *and* over-disclosure both fail. Also pins the fail-closed consent gate. `tsc` cannot catch this class of bug; see [rules R4](rules.md). |
| `npm run test:sso-access` | The access gate + `PARTNER_SSO_ERRORS` copy bar (no HTTP status names, no raw codes, rule-11 vocabulary, full sentences naming the portal). The entry-count assertion is deliberate — bump it when adding a failure path. |
| `npm run test:member-level` | Tier resolution for `member_level`. |
| `npm run test:partner-discount-queue` | Queue stacking / expiry. |
| `npm run test:portal-return` | Rewards-return parser + banner view matrix. |
| `npm run test:partner-catalog-drift` | CSV ↔ committed generated catalogue files. |

## Manual smoke — portal hand-off (2026-07-31)

Needs `PARTNER_DISCOUNT_SSO_ENABLED=true` (automatic in local dev) and a member with live
partner access.

- **First click (no consent yet)** → consent sheet, NOT the takeover. Confirm the rows match
  what `sso-flow.ts` actually sends: Name, Email, Account reference — and **no tier row**
  while `PARTNER_SSO_SENDS_MEMBER_LEVEL` is `false`.
- **"Agree & continue" before ticking** → inert. Confirm no `/consent` and no `/sso` request
  fires (network tab), not merely that the button looks disabled.
- **After agreeing** → takeover shows "Consent recorded" as its first step.
- **Second click, later** → straight to the takeover, no sheet.
- **Cancel mid-flight** → returns to the page unchanged and **no late redirect** fires.
- **Force a 502** (bad `IGODIRECT_DOMAIN_URL`) → error mark + "Try again" / "Back to Rewards",
  never a stuck spinner.
- **Both themes, both widths**, plus `prefers-reduced-motion: reduce` — progress must still
  read from the step list and tape with all motion collapsed.
- **Screen reader** — the active step is announced; focus is trapped on Cancel; `Esc` cancels.

## partner-catalog-drift now guards three generated views (2026-07-31)

`npm run test:partner-catalog-drift` covers the CSV, the server-only offers map, the
client-safe aggregates **and** the browse catalogue, plus the member-facing copy built from
them:

- browse rows are the same multiset of `(name, category, pct)` as the offers map
- filtering browse rows by `pct <= tier` reproduces `PARTNER_CATALOG_TIER_COUNTS`
- `getPartnerCatalogUnlockedCount()` resolves every ladder percent, returns `null` off-ladder
  (0% is the real case — guest / past-due with no pack) and ignores inherited keys
- `resolveCoveringTier()` picks the cheapest covering tier; `buildTierUpgradeCopy()` states
  the delta; `buildVendorLockedOfferCopy()` keeps the UTM; and every generated string is
  checked against the rule-11 banned list, the word "entr(y|ies)", and US "catalog"

A catalogue regeneration that changes counts fails here **before** it can tell a member an
offer is open when it is not.

## Artwork: two sources, two failure modes (2026-08-03)

Offer artwork comes from **two** committed maps, because the vendor keys it two ways:

| script | command | covers | keyed by |
|---|---|---|---|
| `probe-partner-catalog-images.ts` | `npm run probe:partner-catalog-images` | 948 offers | the **offer** id |
| `harvest-partner-instore-artwork.ts` | `npm run harvest:partner-instore-artwork` | 856 in-store | the vendor's internal **merchant/media** id |

After either, re-emit the generated files with `npm run build:partner-catalog` — it prints the
combined coverage (`artwork: 1804/1833 rows (98%) — 856 harvested, 948 probed`), which is the
quickest check that both maps were picked up.

**The probe reporting ~52% is CORRECT, not a failure.** It can only find artwork keyed by the
offer id, and one whole category ("In-Store Offer", 877 rows) is keyed differently. Do not
"fix" that number.

The harvest needs a live portal session, so it can never run in CI:

```bash
PARTNER_HARVEST_EMAIL=... PARTNER_HARVEST_PASSWORD=... npm run harvest:partner-instore-artwork -- --dry-run
```

`--dry-run` crawls and reports without writing. It exits **2** if coverage lands below 80% of
the CSV's in-store rows — i.e. the crawl "succeeded" but found far less than exists, which is
the silent-failure shape that produced two earlier wrong coverage numbers.

### What the drift test now catches

`npm run test:partner-catalog-drift` gained three assertions here:

- **Aggregate floor** (>80%) — a wrong media path degrades silently to letter tiles.
- **Per-category floor** (>50% for any category of 25+ rows) — this is the one that matters.
  The aggregate alone passed at 52% for two days while one entire category sat at **0%**; an
  average hid the hole. If this fails, do **not** lower the floor — open one of that category's
  offers in the portal with a live session and read the `<img>` src.
- **`buildPartnerPortalOfferImageUrl` handles both wire forms** — a bare extension resolves
  against the offer id; an explicit `"<m|p>:<mediaId>.<ext>"` must use the media id and ignore
  the offer id entirely. Conflating the two is the original bug in miniature.

## `npm run test:discount-catalogue` (2026-08-05)

[`src/utils/partner-discounts/__tests__/discount-catalogue.test.ts`](../../src/utils/partner-discounts/__tests__/discount-catalogue.test.ts)
— 40 checks over the pure layer behind `/discount`. The page's argument is a claim about
numbers, so a wrong figure is a promise we do not keep rather than a visual bug.

What it pins, and why each one matters:

- **Each access-level chip returns exactly the count it advertises** (2026-08-06) — for every
  rung, chip count ≡ filtered row count, and every returned row is `pct === rung`. The chip is
  the only control on the page that *states a figure before you click it*, so drift between the
  promise and the result is the exact failure this page cannot afford.
- **The top rung is a real filter, not an alias for "Any"** — this is the regression that made
  the filter exact rather than cumulative in the first place, so it is pinned directly.
- **Per-rung counts partition the catalogue** (they sum to 1,833) and **5…50 unions to
  `offersAtLevel(50)`** — the bridge between the per-rung chip numbers and the cumulative tier
  counts the band headers quote. If the ladder or the snapshot changes, this is what catches
  the two views disagreeing.
- **Level selection composes with "only what I can use"** rather than overriding it: a 50%
  member selecting the 100% rung gets an empty list, not a list they cannot redeem.

- **The wall lands on the FIRST unreachable band and appears exactly once** — signed out (band
  one), mid-ladder (the first level above the member), and at 100% (no wall at all). Drawing
  the member's limit in the wrong place is the one failure that would invert the page's meaning.
- **Both routes resolve at every one of the 11 levels**, and **the membership is cheaper than
  the covering pack at every level**. The fixed "Cheapest way in" / "No subscription" labels are
  only honest while that holds — a pricing change breaks it silently otherwise.
- **Off-ladder percents fail closed** (`offersAtLevel(60) === null`, `resolveDiscountRoutes(60)`
  is empty) rather than guessing a tier.
- **A signed-out viewer can redeem nothing**, whatever percent is passed in.
- **A direct partner's placeholder `"#"` link never becomes an href**, and one with no site
  offers no dead CTA.
- **Rule 11 copy** — every gate, band and route string is swept for gambling vocabulary and for
  per-entry pricing. This is the cheapest place to catch a legal-line regression, since the
  strings are all generated from one module.

Companion to `npm run test:partner-catalog-drift` (which guards the generated data) and
`npm run test:unlock-packages` (which guards the resolver this delegates to).
