# Config & Data domain

Static config (feature flags, brand theme, prizes), constants (z-index, legal, promo banner), seed data (australian states, professions, sample products/users/winners).

## `src/data/faqs.ts` — FAQ entries (updated 2026-06-25)

Central FAQ content source for both the `/faq` page and the Cobber support chatbot deflection layer. FAQ answers support markdown (links render via `ChatMarkdown` in the widget and on the `/faq` page).

**Current entries (as of 2026-06-25):**

| id | Question | Category |
|----|----------|----------|
| 1–9 | What is TA, draw date/mechanics, prizes, tiers, packs, mini draws, carry-forward, more entries, eligibility | SHOPPING |
| 10–13 | Payment methods, renewal date (24th), refund policy, failed payment | PAYMENTS |
| 14–15 | Rewards points, shop (coming soon) | REWARDS |
| 16–17 | Partner discounts, become a partner | PARTNERSHIPS |
| 18 | **How to cancel / stop auto-renewal** — self-service path: My Account → Settings → Subscription tab | PAYMENTS |
| 19 | **Refund policy** — non-refundable + ACL rights + escalation path | PAYMENTS |
| 20 | **Delete account / data** — contact support; cancel via Subscription tab first | PAYMENTS |
| 21 | **Unexpected/unauthorised charge** — explains 24th auto-renewal; how to turn off; escalate disputes | PAYMENTS |

Entries 18–21 are the premeditated answers for the top-volume support inbox questions (cancel, refund, delete, unexpected charge). They are also wired into `decisionTree.ts` for zero-LLM deflection — see `docs/ai-chatbot/implementation-spec.md`.

## Index

- [architecture.md](./architecture.md) — config vs constants vs data
- [frontend.md](./frontend.md) — _Read by both client + server_
- [backend.md](./backend.md) — Read by server code
- [api.md](./api.md) — _N/A_
- [rules.md](./rules.md) — when to put in DB vs code, fixture vs prod
- [patterns.md](./patterns.md) — feature flags, package config
- [gotchas.md](./gotchas.md) — fixture-as-prod-fallback risk
- [models.md](./models.md) — _N/A_
- [testing.md](./testing.md) — _TODO_
