# Contact — Rules

## R1. Validate input strictly

Free-form fields must be length-limited and stripped of suspicious content. Use Zod helpers in `src/lib/zod/`.

## R2. Rate-limit submissions

Public endpoint; rate-limit per IP to prevent spam floods. _TODO: confirm rate limit is in place._

## R3. No PII in URL

POST body only — never put name/email in query params.
