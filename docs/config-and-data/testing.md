# Config & Data — Testing

## Automated tests

### `src/config/__tests__/prize-summaries.test.ts` — `npm run test:prize-summaries`

Drift guard for the prize catalog split (see [architecture.md](./architecture.md) "Prize catalog split"). Imports BOTH `@/config/prize-summaries` and the heavy `@/config/prizes` (fine server-side under tsx) and asserts:

- Slug lists match exactly — same entries, same ORDER (consumers rely on catalog order).
- Every shared field (`label`, `heroHeading`, `heroSubheading`, `summary`, `prizeValueLabel`, `gallery`, `highlights`, `cardBackgroundImage`) is deep-equal between the summary and the full catalog entry per slug.
- No deep field (`specSections`, `detailedDescription`) and no unknown key leaks into a summary.
- `DEFAULT_PRIZE_SLUG` agrees across modules; `getPrizeSummaryBySlug` / `listPrizeSummaries` (defensive copy) / `getPrizeLabel` behave.
- `prize-summaries.ts` source stays **≤ 40 KB** (fs assertion) and contains no import of `./prizes` / `@/config/prizes` (comments stripped before the check).

### `src/data/__tests__/faqs.test.ts` — `npm run test:chat-faqs`

Regression suite for the **chatbot FAQ corpus** `src/data/supportChatFaqs.ts` (repointed 2026-07-07 when the corpus was split out of `faqs.ts`; the `/faq` page's `faqs.ts` is a separate generic owner-controlled set). Added 2026-06-24 when the FAQ content was rewritten from stale e-commerce boilerplate (PayPal, international shipping, 3-5 business day shipping) to the real membership/giveaway domain. Now also asserts NO stale "Settings → Subscription" tab reference (removed in the 2026-07 dashboard revamp).

Asserts:
- `getFaqEntries()` returns a non-empty array of well-formed entries with valid `id`, `question`, `answer`, and `category` fields.
- The combined FAQ text **contains** canonical facts: draw date ("27th"), Tradie tier price ("$20"), non-refundable policy, and the certified draw service ("randomdraws.com.au").
- The combined FAQ text **does not contain** stale phrases: "paypal", "international shipping", "3-5 business day", "3-5 business days".

### `src/data/__tests__/miniDrawPackages.test.ts` — (no npm script yet — run directly)

Validates the mini-draw pack ladder shapes and the guest vs member viewer split.

## Manual smoke

- Add a package to `membershipPackages.ts` → verify UI shows it AND Stripe + Mongo also have matching record
- Change a z-index constant → verify all consumers update (search for the old value)
- Change legal copy → verify it appears on relevant pages
