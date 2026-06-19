# Email — Rules

## R1. SendGrid for transactional, Klaviyo for marketing

Per CLAUDE.md. Don't send marketing emails through SendGrid (deliverability + sender-reputation reasons), and don't send urgent transactional through Klaviyo (latency + segmentation overhead).

## R2. Templates at root, helper in `src/lib/email/`

HTML templates and their rendering helpers must change in lockstep. If a template adds a new `{{variable}}`, the helper must populate it.

## R3. Don't persist email content

Sent emails aren't stored in our DB — SendGrid is the system of record. Don't add an `EmailLog` model unless there's a strong reason.

## R4. Unsubscribe must be respected

Klaviyo / SendGrid suppression lists are checked at send time. Don't bypass even for "important" emails.

## R5. Test emails go to a sandbox account

Use the dedicated test email address documented in `docs/SENDGRID_TESTING_GUIDE.md` for test sends. Don't send to real users from dev.

## R6. Customer-facing entry copy says "free entries"

Per spec D9 (`docs/superpowers/specs/2026-05-14-upsell-remap-and-multiplier-design.md`): every **customer-facing** entry count/reward in emails reads "free entries" regardless of source — never bare "entries"/"Entries". Applies to SendGrid templates and Klaviyo templates alike. Exceptions: CSS class names (`.entries-box`), HTML comments, merge-variable names (`{{ event.entries_gained }}`), and **internal/admin** emails showing raw draw totals (e.g. the "select a winner" notice in `src/lib/email/templates.ts`, which shows `totalEntries / minimumEntries`) — those stay "Entries".
