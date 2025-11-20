<!-- Detailed checklist generated on 2025-11-19 -->

# Security Regression Checklist

Use this document after every security-focused change or before a major release to make sure critical experiences still work. Each section lists the exact pages/endpoints to exercise plus the expected behaviour.

## 1. Authentication & Sessions

- Visit `/login` and submit valid email/password. Expect a `200` response, the `ta_session_token` HttpOnly cookie to be set, and redirect to the dashboard.
- Attempt three wrong passwords, then a correct one. Confirm the fourth attempt is blocked with HTTP `429` for ~60 seconds, proving the rate limiter works but unlocks after the window expires.
- Login via Google OAuth (existing account only). Make sure the flow completes without console warnings and that `session.user.role` is present.
- Exercise `/api/auth/login` via REST client:
  - Missing CSRF Origin → receive `403`.
  - Missing body fields → `400` with Zod validation errors.
  - Successful login → JSON payload with `token` plus secure cookie.
- Ensure logout flow clears the `ta_session_token` cookie and you cannot access `/my-account` afterward.

## 2. Authorization & Admin Tools

- Navigate to `/admin`. Confirm non-admin accounts are redirected to `/`.
- Call `/api/admin/*` endpoints with and without a valid session to verify the middleware enforces role checks (expect `302` to `/login` or `403` when unauthenticated).
- Trigger referral reward flows (enter a friend code during membership purchase) and verify the referrer bonus still posts once payment + email verification succeed.

## 3. Payments & Membership

- Purchase a membership plan through Stripe checkout:
  - Confirm the payment form renders (CSP not blocking `js.stripe.com`).
  - Successful payment still grants entries and sends confirmation email/SMS.
- Update a saved card in `my-account`. Ensure GraphQL/REST calls succeed with new headers.
- Verify Stripe webhook processing (can replay in dashboard) continues to mark invoices paid.

## 4. Marketing Pixels & Third Parties

- Load landing pages (`/`, `/mini-draws`, `/partner`) with devtools open. Confirm Meta Pixel, TikTok Pixel, Vercel Analytics, etc., send network calls (CSP headers allow them).
- Inspect browser console for CSP violation warnings. Whitelist any intentional domains before release.

## 5. Media & CDN Assets

- Browse hero sections, carousels, and promo cards that rely on remote images (Cloudinary, brand logos). Ensure `next/image` still optimises these hosts after the new allow-list.
- Verify video embeds or background videos still load when CSP `media-src` is restricted to `self https:`.

## 6. API & Background Jobs

- Hit `/api/health` or equivalent diagnostics to confirm general API availability with stricter headers.
- Run scheduled scripts (`scripts/test-*.ts`, rewards migrations) locally to ensure the new env variable requirements (`NEXTAUTH_SECRET` mandatory) are satisfied in tooling shells.

## 7. Browser & Network Security Headers

- Using `curl -I https://toolsaustralia.com.au`, confirm the following headers exist: `Strict-Transport-Security`, `Content-Security-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`, `Referrer-Policy`.
- Visit the site in Firefox + Safari to ensure COOP/COEP didn't break expected cross-origin resource sharing (e.g., PDF downloads or embedded widgets).
- **CSP Nonce Verification**: In production, verify that:
  - The `Content-Security-Policy` header includes `'nonce-{random}'` in `script-src` (not `'unsafe-inline'`).
  - JSON-LD structured data scripts in the HTML source include `nonce="{random}"` attributes matching the CSP nonce.
  - All JSON-LD components (`OrganizationJsonLd`, `ProductJsonLd`, `BreadcrumbJsonLd`, etc.) receive and apply the nonce prop.
    > Note for CSP: All Content-Security-Policy directives should be managed via the `buildContentSecurityPolicy()` helper in `src/utils/security/csp.ts` to ensure proper formatting and prevent `ERR_INVALID_CHAR` errors. The nonce is generated per-request in middleware and passed to server components via request headers.
- Open DevTools → Console and reload key pages to verify there are no `Refused to apply inline style because it violates the CSP` messages. Any new warning means someone reintroduced inline CSS and needs a utility-class refactor.
- If you need to change CSP directives, edit `buildContentSecurityPolicy()` in `next.config.ts` so the header remains a single line; never paste multi-line policy strings directly.

## 8. Monitoring & Alerts

- Check log pipelines (Datadog/New Relic/etc.) to verify auth debug logs stay muted in production but still appear in staging when `NEXT_PUBLIC_ENABLE_AUTH_DEBUG=true`.
- Trigger a failed login, then confirm alerting rules fire once thresholds are met.

## 9. Inline Style Remediation Tracker

- Pattern overlays (countdown banners, promos, footer, stats cards) use shared utilities such as `pattern-dots-white` and `pattern-rings-soft`. When new sections need a pattern, add a utility instead of inlining `background-image`.
- Horizontal carousels (`ProductCategories`, `ExistingPartners`, `PrizeCategories`) now rely on Tailwind utilities (`w-max`, `scroll-smooth`, `snap-start`) instead of inline width or snap attributes. Follow the same approach for future sliders.
- Progress indicators and sliders still rely on inline `style` attributes because they map live data to widths/positions. When redesigning them, prefer CSS variables populated via data attributes or convert to discrete class states to eventually drop inline styles entirely.

> Tip for new teammates: run through the entire checklist in staging before every deploy that touches authentication, payments, or security headers. Record pass/fail outcomes so regressions can be traced quickly.
