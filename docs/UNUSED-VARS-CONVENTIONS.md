# Underscore Prefix Conventions for Unused Variables

This document explains where and why we use the `_` prefix for variables/parameters across the codebase. ESLint is configured to ignore names matching `^_` for `no-unused-vars`.

## Convention

- **`_variableName`** = Parameter or variable that is **intentionally unused** (required by API/signature but not referenced in the function body).
- **`void variable`** = Same intent: explicitly mark as "used" for lint purposes when the value is a placeholder for future logic.

---

## By Category

### 1. API Route Handlers – `_request`

Many Next.js API routes use `(request: NextRequest)` but don't need the request body. The param is required by the route signature.

| File | Usage |
|------|-------|
| `api/admin/promo/banner-text/active/route.ts` | `_request: NextRequest` |
| `api/admin/invoices/charge-past-due/route.ts` | `_request: NextRequest` |
| `api/payment-status/[paymentIntentId]/route.ts` | `_request: NextRequest` |
| `api/admin/klaviyo/draw-reset-execute/route.ts` | `_request: NextRequest` |
| `api/admin/klaviyo/draw-reset-progress/route.ts` | `_request: NextRequest` |
| `api/admin/promo/effective/route.ts` | `_request: NextRequest` |
| `api/subscription/benefits/route.ts` | `_request: NextRequest` |
| `api/admin/dashboard/projected-income/route.ts` | `_request: NextRequest` |
| `api/admin/promo/banner-text/route.ts` | `_request: NextRequest` |
| `api/admin/dashboard/membership-by-package/route.ts` | `_request: NextRequest` |
| `api/admin/major-draw/current-and-last/route.ts` | `_request: NextRequest` |
| `api/stripe/pay-failed-invoice/route.ts` | `_request: NextRequest` |
| `lib/rate-limiting/error-reports.ts` | `_request: NextRequest` |

### 2. pixel-purchase-tracking.ts – Params in `params` but Not Used

These fields come from the function params and are destructured with aliases to `_` because they are **never read** in that function. Other fields (e.g. `userPhone`, `userFirstName`) are used and keep their normal names.

#### trackPixelPurchase (main purchase)

| Param | Aliased To | Reason |
|-------|------------|--------|
| `userCity` | `_userCity` | Not passed to `prepareUserData()` or CAPI |
| `userZipCode` | `_userZipCode` | Not passed to `prepareUserData()` or CAPI |

#### trackPixelSubscriptionRenewal

| Param | Aliased To | Reason |
|-------|------------|--------|
| `userPhone` | `_userPhoneRenewal` | Renewal does not use user PII in CAPI payload |
| `userFirstName` | `_userFirstNameRenewal` | Same |
| `userLastName` | `_userLastNameRenewal` | Same |
| `eventSourceUrl` | `_eventSourceUrlRenewal` | Renewal uses different event source logic |
| `fbc` | `_providedFbcRenewal` | Renewal does not use fbc/fbp |
| `fbp` | `_providedFbpRenewal` | Same |
| `requestContext` | `_requestContextRenewal` | Renewal does not use request context |
| `clientIpAddress` | `_clientIpAddressRenewal` | Same |
| `clientUserAgent` | `_clientUserAgentRenewal` | Same |

Also: `const _eventTime = ...` – computed but not used in renewal payload.

### 3. Hooks & Services

| File | Variable | Reason |
|------|----------|--------|
| `usePromoQueries.ts` | `_context` | `useResolvedMultiplier(type, _context)` – param reserved for future display vs payment logic; body only uses `type` |
| `AnonymousIdService.ts` | `_request` | `getOrCreateAnonymousId(_request)` – signature requires request, implementation does not use it |

### 4. Placeholder for Future Logic

| File | Usage | Reason |
|------|-------|--------|
| `benefit-resolution.ts` | `void brand` | `canAccessPartnerDiscounts(user, brand?)` – `brand` reserved for future brand-specific filtering |

### 5. Component-Level Unused

| File | Variable | Reason |
|------|----------|--------|
| `MembershipModal.tsx` | `_userDataForPromo` | Destructured from `useUserContext()` but only `isMemberForPromo` is used |
| `MembershipModal.tsx` | `_shouldCreatePaymentIntent` | Computed for logic/commenting, not used in branch |
| `DailyMetricsView.tsx` | `_monthStart`, `_monthEnd` | Computed for filter logic, values unused (filter uses `formatInTimeZone` instead) |
| `MiniDrawTabs.tsx` | `_brandLabel` | Future use / logging |
| `MajorDrawSelector.tsx` | `_MajorDraw` | Private interface type |

---

## Important: When NOT to Use `_`

Do **not** prefix variables that are actually used:

- `userPhone`, `userFirstName`, `userLastName` in `trackPixelPurchase` → passed to `prepareUserData()`
- `clientIpAddress`, `clientUserAgent`, `eventSourceUrl` in `trackPixelPurchase` → used for CAPI and event source resolution
- `requestContext`, `providedFbc`, `providedFbp` → used for fbc/fbp resolution
- `error` or `apiError` in `catch` blocks when passed to `console.error()`
