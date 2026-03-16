# Redeemables Feature Documentation

This document describes the complete redeemables system, including campaign rewards, milestone rewards, redemption flow, admin tools, APIs, data model, and operational notes.

## Scope

The feature now supports two reward sources:
- **Campaign rewards** (monthly coupon campaigns, now with multi-campaign per month support)
- **Milestone rewards** (auto-issued accomplishments based on spend, entries gained, and loyalty days)

Both sources are unified in user claimable surfaces (wallet and floating widget).

---

## Architecture and Separation of Concerns

The implementation follows clear separation:
- **Models** (`src/models/*`): persistence schema + indexes + model-level validation
- **Services** (`src/services/redeemables/*`, `src/services/milestones/*`): business rules and issuance logic
- **API routes** (`src/app/api/**`): request validation + auth + service orchestration
- **UI components** (`src/components/**`): display + user interactions only
- **Query hooks** (`src/hooks/queries/*`): API fetching + cache invalidation

---

## Data Models

## `MonthlyEntryCampaign`
**File:** `src/models/MonthlyEntryCampaign.ts`

Key fields:
- `monthKey`
- `name`, `displayLabel`
- `entriesAmount`
- `campaignMode`, `targetingMode`
- `startsAt`, `endsAt`, `neverExpires`
- `code` (unique)
- `requiresPurchase`, `isActive`

Important behavior:
- `monthKey` is a grouping field (not unique)
- `neverExpires` allows campaigns without end date
- stale legacy `monthKey_1` unique index is dropped by service guard logic

## `RedeemableIssuance`
**File:** `src/models/RedeemableIssuance.ts`

Tracks per-user campaign issuance and redemption status.

## `MilestoneReward`
**File:** `src/models/MilestoneReward.ts`

Defines milestone reward rules:
- `milestoneType`: `spend-amount | entries-gained | loyalty-days`
- `threshold`, `entriesAmount`
- `code` (unique)
- `neverExpires`, `isRecurring`, `isActive`

## `MilestoneIssuance`
**File:** `src/models/MilestoneIssuance.ts`

Tracks auto-issued milestone rewards per user:
- `milestoneRewardId`, `userId`
- `milestoneType`, `thresholdReached`
- `achievementCycle` (for recurring milestones)
- `entriesAmount`, `status`, `issuedAt`, `redeemedAt`, `expiresAt`

## `SegmentSnapshot`
**File:** `src/models/SegmentSnapshot.ts`

Stores issuance targeting audit snapshots for campaign runs.

---

## Services

## Campaign services (`src/services/redeemables/*`)

`CampaignService`:
- `ensureLegacyMonthKeyIndexDropped()`
- `createCampaign()`
- `updateCampaign()`
- `deleteCampaign()` (hard delete if no issuance, soft-deactivate if issuance exists)
- `toggleCampaignActive()`
- `listCampaigns()`
- `getActiveCampaign()`, `getActiveCampaigns()`
- `issueCampaignToUsers()`

`RedemptionService`:
- Unified redemption for:
  - campaign issuance
  - milestone issuance
- Supports redemption by `issuanceId` or `code`

`RedeemablesWalletService`:
- Unified wallet data for campaign + milestone rewards
- Pagination and status filtering (`claimable`, `past`)

`RedemptionAnalyticsService`:
- Per-campaign redeemed-user analytics

## Milestone services (`src/services/milestones/*`)

`MilestoneEvaluator`:
- Computes per-user metrics:
  - total spend
  - accumulated entries
  - loyalty days (active subscription duration)

`MilestoneService`:
- CRUD for milestone rewards
- `checkAndIssueMilestones(userId)` for auto issuance
- `evaluateAllUsersAndIssueMilestones()` for cron execution

---

## API Contracts

### Campaign Admin APIs

- `GET /api/admin/monthly-coupon/campaign`
- `POST /api/admin/monthly-coupon/campaign`
- `PUT /api/admin/monthly-coupon/campaign/[id]`
- `DELETE /api/admin/monthly-coupon/campaign/[id]`
- `PATCH /api/admin/monthly-coupon/campaign/[id]/toggle`
- `POST /api/admin/monthly-coupon/issue`
- `GET /api/admin/monthly-coupon/campaign/[id]/redemptions`

### Milestone Admin APIs

- `GET /api/admin/milestone-rewards`
- `POST /api/admin/milestone-rewards`
- `PUT /api/admin/milestone-rewards/[id]`
- `PATCH /api/admin/milestone-rewards/[id]`
- `DELETE /api/admin/milestone-rewards/[id]`

### User APIs

- `GET /api/redeemables?page=&limit=&status=`
- `GET /api/redeemables/status`
- `POST /api/redeemables/redeem`

### Cron APIs

- `POST /api/cron/monthly-redeemables-issuance`
  - includes milestone auto-evaluation in run output
- `POST /api/cron/milestone-rewards-issuance`
  - dedicated milestone evaluation + issuance

---

## Frontend Surfaces

## Admin

`MonthlyRedeemablesCampaignPanel`:
- mobile cards + desktop table
- create/edit/delete
- activate/deactivate
- issue action
- redeemed analytics modal
- no-expiry badge and display

`AdminMonthlyRedeemablesModal`:
- create/edit mode
- code normalization
- `neverExpires` toggle (disables end date)
- `requiresPurchase` toggle

`MilestoneRewardsPanel`:
- list/create/edit/delete
- activate/deactivate
- status and window visibility

`AdminMilestoneRewardModal`:
- milestone type configuration
- threshold + entries reward
- recurring + never-expire options

## User

`RedeemablesWallet` and `RewardsFloatingWidget` now:
- display both campaign and milestone rewards
- show source labels
- support no-expiry display
- preserve purchase-gated unlock behavior

---

## Admin Creation Flows

### Campaign reward creation flow

1. Admin opens **Promo Management** and clicks **Create Campaign**.
2. `AdminMonthlyRedeemablesModal` collects:
   - campaign identity (`name`, `displayLabel`, `code`)
   - targeting (`targetingMode`, optional segment rules)
   - reward configuration (`entriesAmount`, `requiresPurchase`)
   - scheduling (`startsAt`, `endsAt` or `neverExpires`)
3. Modal normalizes `code` and submits to:
   - `POST /api/admin/monthly-coupon/campaign`
4. API validates payload, converts dates, and calls `CampaignService.createCampaign`.
5. Campaign is persisted in `MonthlyEntryCampaign`.
6. Admin triggers issuance from campaign row:
   - `POST /api/admin/monthly-coupon/issue`
7. `CampaignService.issueCampaignToUsers` creates `RedeemableIssuance` records and writes `SegmentSnapshot`.
8. User sees claimable campaign reward in wallet/floating widget.

### Campaign edit / disable / delete flow

1. Admin clicks **Edit**, **Disable/Activate**, or **Delete** in `MonthlyRedeemablesCampaignPanel`.
2. Actions map to:
   - `PUT /api/admin/monthly-coupon/campaign/[id]`
   - `PATCH /api/admin/monthly-coupon/campaign/[id]/toggle`
   - `DELETE /api/admin/monthly-coupon/campaign/[id]`
3. Service behavior:
   - delete is **hard** only when no issuances exist
   - otherwise delete becomes **soft deactivate**
4. Panel reloads and shows updated status.

### Milestone reward creation flow

1. Admin opens **Milestone Rewards** and clicks **Create Reward**.
2. `AdminMilestoneRewardModal` collects:
   - `milestoneType` (`spend-amount`, `entries-gained`, `loyalty-days`)
   - `threshold`, `entriesAmount`
   - `code`, labels, active/recurring flags
   - schedule (`startsAt`, optional `endsAt`, `neverExpires`)
3. Modal submits to:
   - `POST /api/admin/milestone-rewards`
4. API validates and calls `MilestoneService.createReward`.
5. Reward is stored in `MilestoneReward`.
6. Performance metrics for issued/redeemed counts are shown in `MilestoneRewardsPanel`.

---

## User Flow

### Claimable rewards discovery

1. User opens either:
   - dashboard floating widget (`RewardsFloatingWidget`), or
   - full wallet view (`RedeemablesWallet`)
2. UI fetches:
   - `GET /api/redeemables?page=&limit=&status=`
3. Response contains **both** campaign and milestone items with source metadata.
4. User can switch between:
   - `claimable`
   - `past`

### Reward redemption flow

1. User clicks **Redeem** on an item (or submits a code).
2. UI sends:
   - `POST /api/redeemables/redeem` with `issuanceId` or `code`
3. `RedemptionService` resolves source:
   - campaign issuance
   - milestone issuance
4. Service validates:
   - ownership, active status, expiry, concurrency
   - purchase-gated campaign eligibility (`requiresPurchase`)
5. On success:
   - issuance status changes to `redeemed`
   - user `accumulatedEntries` increments
   - redemption history appends
   - entries granted into active major draw
6. Query hooks invalidate wallet/status/stats caches; UI refreshes immediately.

### Purchase-gated path

1. If campaign has `requiresPurchase` and user is ineligible, UI presents **Unlock** CTA.
2. Clicking Unlock dispatches `openMembershipModal`.
3. After successful purchase/subscription, user can return and redeem.

### Auto milestone issuance path

Milestone rewards are issued automatically when user metrics cross thresholds:
- after payment benefit processing
- after entry grants
- during cron evaluation runs

Issued milestones appear in claimable wallet automatically.

---

## Auto-Issuance Integration Points

Milestone issuance is triggered in:
- **entry grant flow** (after campaign redemption entries are granted)
- **payment benefits flow** (post purchase/subscription processing)
- **cron flow** (monthly issuance route and dedicated milestone cron route)

---

## Validation and Error Handling

Common validations:
- code format and uniqueness
- threshold/entries minimums
- valid date windows unless `neverExpires`
- redemption requires valid issuance or code

Common failure reasons:
- `invalid_code`
- `campaign_not_active`
- `already_redeemed`
- `expired`
- `ineligible`
- `concurrency_conflict`

---

## Operational Notes

- Legacy index issue:
  - old unique index `monthKey_1` can cause duplicate key errors
  - service guard attempts automatic drop when detected
- Existing DB data should be reviewed before production rollout for:
  - code uniqueness
  - old index state
- For no-expiry campaign issuances, expiry is handled as non-expiring in campaign logic and represented as non-expiring in UI.

---

## QA Checklist

- Campaign create/edit/delete/toggle paths.
- No-expiry campaign creation and redemption.
- Milestone reward CRUD paths.
- Auto issuance checks:
  - spend milestone
  - entries milestone
  - loyalty-days milestone
- User wallet and floating widget:
  - campaign + milestone items visible
  - claimable/past filters
  - purchase-gated unlock path
