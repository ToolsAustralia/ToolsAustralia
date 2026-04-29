# Security & CSP — Testing

## Security regression checklist

(Migrated from `docs/security-regression-checklist.md` — _TODO: read root and merge._)

Brief: a checklist of things to verify on every release that could affect security (CSP integrity, auth gates, rate-limit thresholds, dependency CVEs).

## Manual smoke

- Open browser DevTools → Network → Headers; verify CSP header present and includes nonce
- Try an inline `<script>` injection without nonce → must be blocked
- Hit a rate-limited endpoint repeatedly → must 429
- Hit `/api/stripe/webhook` simulated POST → verify no COEP blocks
- Sign in as non-admin → try `/admin/*` → must redirect via middleware
