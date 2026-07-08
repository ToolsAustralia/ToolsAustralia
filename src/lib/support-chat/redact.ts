/**
 * support-chat/redact.ts
 *
 * Pure PII redaction helper. Called by ChatService (Task 1.7) before persisting
 * message content to MongoDB, so no raw PII is stored in ChatMessage documents.
 *
 * Conservative by design: it is better to over-redact an edge case than to
 * silently store a real email/phone/card number. Patterns are commented so
 * they can be audited independently of the runtime.
 *
 * No I/O. No side effects. Fully unit-testable.
 */

// ─── Email ───────────────────────────────────────────────────────────────────
// RFC-5321 local part: printable ASCII chars except angle-brackets and whitespace.
// Domain: alphanumeric + hyphens, 2+ label levels, 2–6 char TLD.
// Deliberately not exhaustive — catches the common cases that appear in support chat.
const EMAIL_RE =
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}/g;

// ─── Australian phone numbers ─────────────────────────────────────────────────
// Covers the two main shapes:
//   a) International prefix: +61 followed by 9 digits (with optional space/dash
//      separators between each digit or digit group). Example: +61 412 345 678.
//   b) Local prefix: a 10-digit AU number starting with (0x) or 0d, followed by
//      8 more digits with optional space/dash separators.
//      Examples: 0412 345 678, 0412345678, 02 8765 4321, (02) 8765 4321.
//
// The two alternatives are anchored separately so they don't interfere with each
// other (e.g. a +61 prefix does not accidentally require a leading "0").
const PHONE_RE =
  /(?:\+61[\s\-]?\d(?:[\s\-]?\d){8}|(?:\(\d{2}\)[\s\-]?|\b0\d)(?:[\s\-]?\d){8})/g;

// ─── Credit / debit card–like runs ───────────────────────────────────────────
// A run of 13–19 digits (Luhn-range), optionally separated by spaces or dashes
// in groups of 4. We do NOT run Luhn here — redacting a false positive is safer
// than missing a real PAN. Anchored with \b to avoid redacting innocent integers
// like order numbers unless they look like a card (4-digit groups).
//
// Two sub-patterns:
//   a) groups: 4 digits, then 3-4 more groups of 3-4 digits separated by space/dash
//   b) plain run: 13-19 consecutive digits not part of a larger number
//
// Pattern (b) will catch long phone digit runs too — that is acceptable because
// the phone RE above has already run first in `redactPII` and would have caught
// a formatted phone; an unformatted 10-digit run would also match here and get
// redacted, which is the safe outcome.
const CARD_RE =
  /\b(?:\d{4}[\s\-]\d{4}[\s\-]\d{4}[\s\-]\d{1,7}|\d{13,19})\b/g;

/**
 * Masks emails, Australian phone numbers, and credit-card-like digit runs in
 * `text`. Returns the redacted string.
 *
 * Order matters: email first (contains @), then phones (formatted), then cards
 * (long digit runs). Each category uses a distinct placeholder so downstream
 * readers can tell what was removed.
 */
export function redactPII(text: string): string {
  return text
    .replace(EMAIL_RE, "[email]")
    .replace(PHONE_RE, "[phone]")
    .replace(CARD_RE, "[card]");
}
