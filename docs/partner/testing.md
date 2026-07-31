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
