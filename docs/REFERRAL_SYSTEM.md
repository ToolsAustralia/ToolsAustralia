# Referral System Implementation

## Overview

The referral system allows users to refer new members and receive bonus entries in the major draw. Both the referrer and the invitee receive 100 bonus entries when a first-time user makes their first purchase using a referral code.

**Key Features:**
- Referral codes are automatically generated for all users (format: `TA` + 6 random characters)
- Only first-time users (no previous purchases) can use referral codes
- Both referrer and invitee receive 100 bonus entries
- Entries are added directly to the active major draw
- Referral processing happens automatically via Stripe webhooks after successful payment
- Idempotent validation allows re-validation without errors

## User Flow

### 1. Referral Code Generation
- When a user accesses their referral code (via `/api/referrals/code`), the system automatically generates a unique code if one doesn't exist
- Format: `TA` + 6 characters from alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
- Example: `TA3K7M2P`

### 2. Applying Referral Code
- User enters referral code in the membership modal before purchase
- Frontend calls `/api/referrals/validate` to validate the code
- Validation checks:
  - Code exists and is valid
  - User is not trying to use their own code
  - User is a first-time purchaser (`processedPayments.length === 0`)
  - No other referral is already in progress for this user

### 3. Purchase with Referral Code
- Referral code is passed in Stripe metadata when creating subscription or payment intent
- For subscriptions: `subscription.metadata.referralCode`
- For one-time purchases: `paymentIntent.metadata.referralCode`

### 4. Webhook Processing
- After payment succeeds and benefits are granted, the webhook checks:
  - If `processedPayments.length === 1` (first purchase)
  - If referral code exists in metadata
  - If both conditions are met, calls `recordReferralPurchase()`

### 5. Entry Granting
- Entries are granted immediately (no email verification required)
- Both referrer and invitee receive 100 entries
- Entries are added directly to the active major draw (not to user's `accumulatedEntries`)
- Transaction ensures atomicity (all-or-nothing)

## Data Flow

```
┌─────────────────┐
│  User enters    │
│  referral code  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ /api/referrals/validate │
│ - Check code exists     │
│ - Check first-time user │
│ - Check no conflicts    │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Create Subscription/   │
│  Payment Intent         │
│  (with referralCode     │
│   in metadata)          │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Stripe Webhook         │
│  (payment succeeded)    │
│  1. Grant benefits      │
│  2. Update              │
│     processedPayments   │
│  3. Check if            │
│     processedPayments   │
│     .length === 1       │
│  4. Process referral    │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ recordReferralPurchase  │
│ - Create ReferralEvent  │
│ - Call                  │
│   completeReferral       │
│   Conversion            │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ completeReferral        │
│ Conversion              │
│ (in transaction)        │
│ 1. Update ReferralEvent │
│    status to "converted"│
│ 2. Update referrer stats│
│ 3. Add entries to       │
│    MajorDraw for both   │
└─────────────────────────┘
```

## Database Models

### User Model (`src/models/User.ts`)

**Referral Fields:**
```typescript
referral?: {
  code: string;                    // Unique referral code (e.g., "TA3K7M2P")
  successfulConversions: number;    // Count of successful referrals
  totalEntriesAwarded: number;      // Total entries awarded from referrals
}
```

**Key Field for Validation:**
```typescript
processedPayments?: string[];      // Array of payment IDs that have been processed
                                    // Used to determine if user is first-time
```

**Index:**
- `{ "referral.code": 1 }` - Unique, sparse index for fast code lookup

### ReferralEvent Model (`src/models/ReferralEvent.ts`)

Tracks individual referral events and conversions.

**Fields:**
```typescript
{
  referrerId: ObjectId;             // User who owns the referral code
  referralCode: string;              // The referral code used
  inviteeUserId?: ObjectId;          // User who used the code
  inviteeEmail?: string;             // Email of invitee (for tracking)
  inviteeName?: string;              // Name of invitee
  status: "pending" | "converted";   // Current status
  qualifyingOrderId?: string;        // Stripe payment/subscription ID
  qualifyingOrderType?: "membership" | "one-time";
  conversionDate?: Date;              // When referral was converted
  referrerEntriesAwarded: number;    // Entries awarded to referrer (100)
  referreeEntriesAwarded: number;     // Entries awarded to invitee (100)
  createdAt: Date;
  updatedAt: Date;
}
```

**Indexes:**
- `{ referrerId: 1, status: 1 }` - For querying referrer's referrals
- `{ referralCode: 1 }` - For code lookup
- `{ referralCode: 1, inviteeUserId: 1 }` - Unique, sparse (prevents duplicate conversions)
- `{ referralCode: 1, inviteeEmail: 1 }` - Unique, sparse (prevents duplicate by email)
- `{ inviteeUserId: 1, status: 1 }` - For checking user's referral status

### MajorDraw Model

Entries are stored in the `entries` array:

```typescript
entries: [{
  userId: ObjectId;
  totalEntries: number;
  entriesBySource: {
    membership: number;
    "one-time-package": number;
    upsell: number;
    "mini-draw": number;
    referral: number;              // Referral entries tracked here
  };
  firstAddedDate: Date;
  lastUpdatedDate: Date;
}]
```

## API Endpoints

### GET `/api/referrals/code`
Returns the current user's referral code. Automatically generates one if it doesn't exist.

**Response:**
```json
{
  "code": "TA3K7M2P",
  "successfulConversions": 5,
  "totalEntriesAwarded": 500
}
```

### POST `/api/referrals/validate`
Validates a referral code for a user before purchase.

**Request Body:**
```json
{
  "referralCode": "TA3K7M2P",
  "inviteeUserId": "optional-user-id",
  "inviteeEmail": "optional@email.com"
}
```

**Success Response:**
```json
{
  "success": true,
  "data": {
    "referrerId": "user-id",
    "referralCode": "TA3K7M2P",
    "referrerName": "John Doe"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message",
  "errorCode": "REFERRAL_VALIDATION_FAILED",
  "timestamp": "2026-01-16T10:00:00.000Z"
}
```

**Validation Rules:**
1. Code must exist
2. User cannot use their own code
3. User must be first-time (`processedPayments.length === 0`)
4. No other referral already in progress for this user
5. If referral already converted for same code, returns success (idempotent)

## Core Functions

### `getOrCreateReferralProfile(userId: string)`
Generates or retrieves a user's referral code and stats.

**Location:** `src/lib/referral.ts`

**Returns:**
```typescript
{
  code: string;
  successfulConversions: number;
  totalEntriesAwarded: number;
}
```

### `validateReferralCodeForUser({ referralCode, inviteeUserId, inviteeEmail })`
Validates a referral code can be used by a specific user.

**Location:** `src/lib/referral.ts`

**Key Logic:**
1. Sanitizes and looks up referral code
2. Checks if user is trying to use their own code
3. Checks for existing referral events (idempotent handling)
4. Validates user is first-time (`processedPayments.length === 0`)

**Returns:**
```typescript
{
  referrerId: string;
  referralCode: string;
  referrerName: string;
}
```

### `recordReferralPurchase({ referralCode, inviteeUserId, inviteeEmail, inviteeName, qualifyingOrderId, qualifyingOrderType })`
Records a referral purchase and immediately completes the conversion.

**Location:** `src/lib/referral.ts`

**Process:**
1. Validates referrer exists
2. Creates or updates `ReferralEvent` with status "pending"
3. Immediately calls `completeReferralConversion()`
4. Returns status ("converted" or "pending")

**Note:** Conversion happens immediately (no email verification required).

### `completeReferralConversion(inviteeUserId: string)`
Completes referral conversion in a transaction, awarding entries to both parties.

**Location:** `src/lib/referral.ts`

**Process (within transaction):**
1. Finds all pending referral events for the user
2. For each event:
   - Updates `ReferralEvent` status to "converted"
   - Sets `conversionDate` and entry counts
   - Updates referrer's `User.referral` stats
   - Adds 100 entries to major draw for referrer
   - Adds 100 entries to major draw for invitee
3. All operations are atomic (transaction)

**Returns:**
```typescript
{
  completed: number;  // Number of referrals converted
}
```

### `addReferralEntriesToMajorDrawInTransaction(userId, entriesToAdd, session)`
Adds referral entries directly to the active major draw within a transaction.

**Location:** `src/lib/referral.ts` (private function)

**Process:**
1. Finds active major draw
2. If user entry exists:
   - Uses `MajorDraw.updateOne()` with `$inc` to increment entries
   - Uses positional operator `$` to update nested array
3. If user entry doesn't exist:
   - Uses `MajorDraw.updateOne()` with `$push` to create new entry
4. Reloads document and recalculates `totalEntries`

**Important:** Uses MongoDB operators (`$inc`, `$push`, `$set`) for atomic updates within transaction, not Mongoose document modification.

## Webhook Integration

### Subscription Creation (`handleInvoicePaymentSucceeded`)

**Location:** `src/app/api/stripe/webhook/route.ts`

**Trigger:** `invoice.payment_succeeded` with `billing_reason === "subscription_create"`

**Process:**
1. Payment benefits are granted first
2. `processedPayments` is updated
3. Checks if `processedPayments.length === 1` (first purchase)
4. Extracts `referralCode` from invoice or subscription metadata
5. If conditions met, calls `recordReferralPurchase()`

**Code Location:** Lines ~3276-3299

### One-Time Purchase (`handlePaymentSuccess`)

**Location:** `src/app/api/stripe/webhook/route.ts`

**Trigger:** `payment_intent.succeeded`

**Process:**
1. Payment benefits are granted first
2. `processedPayments` is updated
3. Checks if `processedPayments.length === 1` (first purchase)
4. Extracts `referralCode` from payment intent metadata
5. If conditions met, calls `recordReferralPurchase()`

**Code Location:** Lines ~987-1007

### Important Notes
- Referral processing happens **after** benefits are granted
- Only processes if `processedPayments.length === 1` (ensures first-time user)
- Upsell purchases do NOT count as disqualifying purchases (they're not in `processedPayments`)
- Referral processing errors are logged but don't break the webhook

## Entry Granting Logic

### Constants
- **Reward Entries:** 100 entries per referral (for both referrer and invitee)
- **Code Length:** 8 characters (format: `TA` + 6 random chars)

### Entry Destination
Entries go **directly to the MajorDraw collection**, not to the user's `accumulatedEntries` field.

### Update Method
Uses MongoDB atomic operators within a transaction:
- **Existing entry:** `MajorDraw.updateOne()` with `$inc` and positional operator `$`
- **New entry:** `MajorDraw.updateOne()` with `$push`
- **Total recalculation:** Reloads document and recalculates `totalEntries`

### Why This Approach?
1. **Atomicity:** Ensures all-or-nothing updates within transaction
2. **Reliability:** MongoDB operators are more reliable than Mongoose document modification for nested arrays
3. **Performance:** Direct database updates are faster
4. **Consistency:** Ensures `totalEntries` is always accurate

## Validation Logic

### First-Time User Detection

**Method:** Check `User.processedPayments.length === 0`

**Why `processedPayments`?**
- Updated by webhook after successful payment
- Only includes actual purchases (not upsells)
- More reliable than checking subscription status or other fields
- Directly reflects whether user has made a purchase

### Idempotent Validation

The validation endpoint is idempotent:
- If referral already converted for the same code → returns success
- If referral pending for the same code → returns success
- Allows frontend to re-validate without errors

### Validation Checks (in order)

1. **Code exists:** Lookup referral code in User collection
2. **Self-referral:** User cannot use their own code
3. **Existing referral:** Check for pending/converted events
   - If converted for same code → return success (idempotent)
   - If pending for same code → return success (allow re-validation)
   - If converted for different code → reject
4. **First-time user:** Check `processedPayments.length === 0`

## Important Notes

### 1. Timing of Referral Processing
- Referral processing happens in the webhook **after** payment benefits are granted
- This ensures the user has actually completed a purchase
- `processedPayments` is updated before referral check

### 2. Upsell Purchases
- Upsell purchases do NOT disqualify users from using referral codes
- Upsells are not added to `processedPayments`
- Only actual membership or one-time package purchases count

### 3. Email Verification
- **Removed:** Email verification is no longer required for referral conversion
- Entries are granted immediately upon purchase completion

### 4. Transaction Safety
- All referral conversions happen within MongoDB transactions
- If any part fails, entire operation rolls back
- Ensures data consistency

### 5. Entry Tracking
- Entries are tracked in `MajorDraw.entries[].entriesBySource.referral`
- Referrer stats are tracked in `User.referral.totalEntriesAwarded`
- Both are updated atomically

### 6. Error Handling
- Referral processing errors in webhook are logged but don't break payment processing
- Validation errors return structured error responses with error codes
- All errors are logged with full context for debugging

### 7. Code Format
- Format: `TA` + 6 characters
- Alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (excludes confusing characters like 0, O, I, 1)
- Uniqueness: Enforced by database index

### 8. Multiple Referrals
- A user can only have one successful referral conversion
- If a user already has a converted referral, they cannot use another code
- Validation prevents multiple referral conversions per user

## Testing Checklist

- [ ] User can generate/get their referral code
- [ ] User cannot use their own referral code
- [ ] First-time user can validate referral code
- [ ] User with purchases cannot use referral code
- [ ] Referral code is passed in Stripe metadata
- [ ] Webhook processes referral after first purchase
- [ ] Both referrer and invitee receive 100 entries
- [ ] Entries appear in major draw correctly
- [ ] Referral stats are updated correctly
- [ ] Re-validation of same code returns success (idempotent)
- [ ] Transaction rollback works if entry granting fails

## Troubleshooting

### Entries Not Appearing in Major Draw
1. Check if referral was converted: `ReferralEvent.status === "converted"`
2. Check if active major draw exists: `MajorDraw.findOne({ isActive: true })`
3. Check transaction logs for errors
4. Verify `addReferralEntriesToMajorDrawInTransaction` was called

### User Rejected Despite Being First-Time
1. Check `User.processedPayments.length` - should be 0
2. Check if user has existing referral events
3. Verify validation logic in `validateReferralCodeForUser`

### Referral Not Processed in Webhook
1. Check if `processedPayments.length === 1` after purchase
2. Check if referral code exists in Stripe metadata
3. Check webhook logs for referral processing errors
4. Verify `recordReferralPurchase` was called

## Related Files

- `src/lib/referral.ts` - Core referral logic
- `src/app/api/referrals/validate/route.ts` - Validation endpoint
- `src/app/api/referrals/code/route.ts` - Get referral code endpoint
- `src/app/api/stripe/webhook/route.ts` - Webhook integration
- `src/models/ReferralEvent.ts` - Referral event model
- `src/models/User.ts` - User model (referral fields)
- `src/models/MajorDraw.ts` - Major draw model (entry storage)
