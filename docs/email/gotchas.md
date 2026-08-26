# Email — Gotchas

## Email copy is customer-facing — same free-entry / no-gambling rule (2026-07-08)

Email templates (Klaviyo + SendGrid) count as customer-facing copy and must follow **CLAUDE.md §11** (no "odds/chance/lottery/gambling"; entries are a free inclusion, never sold). The Klaviyo `draw-reminder-email-template.html` used the forbidden "better odds" (+ "shot at the prize") — and since it was **never deployed to Klaviyo** (no snapshot in `email-templates/klaviyo-exports/`, marked NOT WIRED), it was **removed entirely** (2026-07-08) along with its `/email-preview` tab (`DrawReminderPreview`, the `EmailPreviewLayout` wiring, and its `designSamples.generated.ts` entry). **Reminder:** editing a live template's repo `.html` fixes the SOURCE only — the copy must also be updated **in Klaviyo** (paste the corrected HTML). Check `email-templates/klaviyo-exports/` for a deployed snapshot to gauge whether a template is actually live before assuming a fix took effect.

## Templates live under `email-templates/`, not `src/`

Two subfolders: `email-templates/klaviyo/` = the **paste-ready Klaviyo** custom-HTML templates (invoice, subscription-renewal, renewal-failed, subscription-payment-failed, draw-reminder); `email-templates/klaviyo-exports/` = **read-only export snapshots** (reference only). Easy to miss when scanning `src/`. There are **no SendGrid HTML files** — every SendGrid email (incl. staff-invite, migrated to code June 2026) is code-as-source in `src/lib/email/templates.ts` + `components.ts`. Nothing is runtime-loaded from disk anymore, so there's no `process.cwd()` / file-tracing footgun.

## One support line, in the footer only

`support@toolsaustralia.com.au` belongs in the **footer** (rendered by `components.ts` for SendGrid, duplicated in each Klaviyo file's footer). Do **not** add a secondary "Need a hand? / Questions about this order? / just keeping you in the loop" support line in the email **body** — it duplicates the footer. Those body lines were removed from the invoice, renewal, renewal-failed, and signup-payment-failed templates June 2026.

## Preview ≠ production render

The preview app runs in the browser; production renders on the server. They use the same template files but different rendering paths. Differences in how variables interpolate or how images load can hide bugs that only appear in production.

## Klaviyo ↔ SendGrid suppression sync

If a user unsubscribes via Klaviyo, the SendGrid suppression list might not auto-update. _TODO: verify the sync mechanism — likely a webhook or scheduled sync._ Until then, bouncing between providers can re-mail unsubscribed users.

## Migrated from `docs/EMAIL_MODULE.md`

> _TODO: read root file and merge full content._

## Preview SAMPLE DATA is customer copy too — it drifts, and nothing catches it (2026-08-24)

`WinnerEmailPreview` passed the literal `"Milwaukee M18 Combo + $5,000 Cash"` as its sample prize
into `createWinnerEmailTemplate()`. Draw 10 removed the $5,000 combo cash bonus, which made that
string assert a prize Tools Australia no longer gives. It is now
`"Milwaukee M18 Combo + PACKOUT Storage"`.

**Why this is worth a gotcha rather than a one-line diff:**

- **Nothing guards it.** `/email-preview` is dev-only (404 in prod), so this was never customer-
  visible — but it is also invisible to every test, to `tsc`, and to the doc-sync hook. It survived
  a repo-wide prize change purely because a grep for `$5,000` happened to reach it.
- **It is the reference staff look at.** The preview is what someone opens to check what a winner
  email says. Stale sample data there quietly teaches the wrong prize to whoever is drafting the
  real one.
- **The same trap sits in every preview.** Any `*Preview.tsx` under
  [src/components/email-preview/](../../src/components/email-preview/) hardcodes plausible-looking
  arguments — prize names, tiers, amounts, dates. Those are **claims**, and they age exactly like
  the templates in this doc's §11 section.

**Rule:** when a prize, price, tier or policy changes, grep
`src/components/email-preview/` alongside `src/lib/email/` and `email-templates/`. Prefer sample
values that describe *structure* (a kit + its storage) over ones that quote *amounts*, so the
preview survives the next repricing without an edit.
