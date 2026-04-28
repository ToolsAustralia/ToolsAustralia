# Referrals — Rules

## R1. Single referrer per user

A user can only be attributed to ONE referrer. First-touch wins (same as affiliate). Second referral codes seen during navigation are recorded but don't override.

## R2. No self-referral

A user can't refer themselves (matching email / device fingerprint). The handler must reject these to prevent gaming.

## R3. Idempotent ReferralEvent

Each (referrer, referee, eventType) combination gets at most one row. Webhook retries / repeat actions don't double-issue.

## R4. Bonus on settled payment, not on signup

Referral bonuses fire on the FIRST settled payment (not just signup), to align with affiliate-style anti-fraud — incomplete signups don't earn bonuses.

## R5. Member referral ≠ affiliate

Referrals = members referring members. Affiliates = registered partners with payouts. Different model, different auth, different commission model.
