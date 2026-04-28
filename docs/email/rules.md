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
