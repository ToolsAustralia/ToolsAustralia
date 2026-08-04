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
