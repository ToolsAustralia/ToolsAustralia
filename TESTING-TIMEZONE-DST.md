# Testing Timezone & DST Handling - Live Guide

This guide will help you test the timezone and DST handling for major draw creation.

## Prerequisites

1. Make sure your development server is running
2. Have admin access to the admin panel
3. Access to your database (optional, for verification)

---

## Method 1: Automated Test Script

Run the DST transition test script to verify all timezone functions:

```bash
npx tsx scripts/test-dst-transitions.ts
```

**What it tests:**

- ✅ Date creation during AEST (winter, UTC+10)
- ✅ Date creation during AEDT (summer, UTC+11)
- ✅ DST transition dates (first Sunday in October and April)
- ✅ Auto-calculated activation dates
- ✅ Auto-calculated freeze dates
- ✅ Timezone abbreviation display (AEST vs AEDT)
- ✅ 30-day rolling cycle across DST boundaries

**Expected output:**

- All tests should pass with ✅ checkmarks
- Dates should show correct UTC offsets
- Labels should show AEST in winter, AEDT in summer

---

## Method 2: Manual Testing in Admin Panel

### Step 1: Access Admin Panel

1. Log in as an admin user
2. Navigate to `/admin` or click "Admin" in the navigation
3. Go to "Current Draw" or "Major Draw" tab
4. Click "Create Major Draw" button

### Step 2: Test Default Draw Date

**What to check:**

- When the modal opens, the "Draw Date" field should auto-populate
- The default time should be **8:30 PM** (today or tomorrow if 8:30 PM has passed)
- The date should be in your local timezone display, but stored as 8:30 PM AEST/AEDT

**How to verify:**

1. Open browser DevTools (F12)
2. Check the Network tab when the modal opens
3. Look at the form data - the draw date should be a UTC ISO string
4. Convert it manually:
   - If it's currently AEST period (April-October): UTC should be 10:30 hours before
   - If it's currently AEDT period (October-April): UTC should be 9:30 hours before

### Step 3: Test Auto-Calculated Dates

**What to check:**

- When you select a draw date, two fields should auto-populate:
  1. **Activation Date**: Should be the next day at **12:00 AM** (midnight)
  2. **Freeze Entries At**: Should be the same day as draw date at **8:00 PM** (30 minutes before 8:30 PM)

**How to verify:**

1. Select a draw date (e.g., June 30, 2024 8:30 PM)
2. Check that:
   - Activation Date = July 1, 2024 12:00 AM
   - Freeze Entries At = June 30, 2024 8:00 PM
3. The time difference between freeze and draw should be exactly 30 minutes

### Step 4: Test During Different DST Periods

#### Test A: During AEST (Winter - April to October)

1. Create a draw for a date in June (e.g., June 15, 2024)
2. Set draw time to 8:30 PM
3. **Verify:**
   - Draw date shows: "Jun 15, 2024 8:30 PM **AEST**"
   - Activation date: "Jun 16, 2024 12:00 AM **AEST**"
   - UTC offset should be +10 hours (draw at 8:30 PM AEST = 10:30 AM UTC)

#### Test B: During AEDT (Summer - October to April)

1. Create a draw for a date in December (e.g., December 15, 2024)
2. Set draw time to 8:30 PM
3. **Verify:**
   - Draw date shows: "Dec 15, 2024 8:30 PM **AEDT**"
   - Activation date: "Dec 16, 2024 12:00 AM **AEDT**"
   - UTC offset should be +11 hours (draw at 8:30 PM AEDT = 9:30 AM UTC)

#### Test C: DST Transition (First Sunday in October)

1. Create a draw for October 6, 2024 (first Sunday in October - DST starts)
2. **Verify:**
   - Dates before Oct 6 should show AEST
   - Dates on/after Oct 6 should show AEDT
   - The system should handle the transition correctly

### Step 5: Test Custom Activation Date Normalization

1. Manually set an activation date with a specific time (e.g., 3:00 PM)
2. Submit the form
3. **Verify:**
   - The activation date should be normalized to 12:00 AM (midnight)
   - Check in the database or after creation - it should show midnight

### Step 6: Test 30-Day Rolling Cycle

1. Create a draw for September 15, 2024 8:30 PM (AEST period)
2. Let the system auto-create the next draw (or manually trigger it)
3. **Verify:**
   - Next draw should be October 15, 2024 8:30 PM (AEDT period - DST transition)
   - The time should remain 8:30 PM even across DST boundary
   - Activation date should be October 16, 2024 12:00 AM AEDT

---

## Method 3: Database Verification

### Check UTC Storage

1. Connect to your MongoDB database
2. Query a major draw:

```javascript
db.majordraws.findOne({ name: "Your Draw Name" });
```

3. **Verify the UTC dates:**

   - `drawDate`: Should be stored in UTC
   - `activationDate`: Should be stored in UTC at midnight equivalent
   - `freezeEntriesAt`: Should be stored in UTC, 30 minutes before drawDate

4. **Calculate expected UTC:**
   - **AEST (UTC+10)**: 8:30 PM AEST = 10:30 AM UTC next day
   - **AEDT (UTC+11)**: 8:30 PM AEDT = 9:30 AM UTC next day
   - **Midnight AEST**: 12:00 AM AEST = 2:00 PM UTC previous day (or 2:00 PM UTC same day depending on date)
   - **Midnight AEDT**: 12:00 AM AEDT = 1:00 PM UTC previous day

### Example Verification

For a draw on **June 15, 2024 8:30 PM AEST**:

- `drawDate` in DB: `2024-06-15T10:30:00.000Z` ✅ (8:30 PM AEST = 10:30 AM UTC)
- `activationDate` in DB: `2024-06-15T14:00:00.000Z` ✅ (June 16 12:00 AM AEST = June 15 2:00 PM UTC)
- `freezeEntriesAt` in DB: `2024-06-15T10:00:00.000Z` ✅ (8:00 PM AEST = 10:00 AM UTC)

For a draw on **December 15, 2024 8:30 PM AEDT**:

- `drawDate` in DB: `2024-12-15T09:30:00.000Z` ✅ (8:30 PM AEDT = 9:30 AM UTC)
- `activationDate` in DB: `2024-12-15T13:00:00.000Z` ✅ (December 16 12:00 AM AEDT = December 15 1:00 PM UTC)
- `freezeEntriesAt` in DB: `2024-12-15T09:00:00.000Z` ✅ (8:00 PM AEDT = 9:00 AM UTC)

---

## Method 4: Browser Console Testing

Open browser console and test the functions directly:

```javascript
// Import the timezone utilities (adjust path as needed)
import {
  createAESTDateAsUTC,
  formatDateReadable,
  calculateActivationDate,
  calculateFreezeTime,
} from "@/utils/common/timezone";

// Test creating a date during AEST
const winterDraw = createAESTDateAsUTC(2024, 6, 15, 20, 30);
console.log("Winter draw:", formatDateReadable(winterDraw));
console.log("UTC:", winterDraw.toISOString());
// Expected: "Jun 15, 2024 8:30 PM AEST" and UTC should be 10:30 AM

// Test creating a date during AEDT
const summerDraw = createAESTDateAsUTC(2024, 12, 15, 20, 30);
console.log("Summer draw:", formatDateReadable(summerDraw));
console.log("UTC:", summerDraw.toISOString());
// Expected: "Dec 15, 2024 8:30 PM AEDT" and UTC should be 9:30 AM

// Test activation date calculation
const activation = calculateActivationDate(winterDraw);
console.log("Activation:", formatDateReadable(activation));
// Expected: "Jun 16, 2024 12:00 AM AEST"

// Test freeze time calculation
const freeze = calculateFreezeTime(winterDraw);
console.log("Freeze:", formatDateReadable(freeze));
// Expected: "Jun 15, 2024 8:00 PM AEST" (30 minutes before draw)
```

---

## Checklist: What to Verify

### ✅ Draw Dates

- [ ] Default draw date is 8:30 PM (not 8:00 PM)
- [ ] Draw dates show correct timezone abbreviation (AEST/AEDT)
- [ ] Draw dates are stored correctly in UTC in database

### ✅ Activation Dates

- [ ] Always set to 12:00 AM (midnight)
- [ ] Always the day after draw date
- [ ] Custom activation dates are normalized to midnight
- [ ] Show correct timezone abbreviation

### ✅ Freeze Dates

- [ ] Always 30 minutes before draw date
- [ ] Always 8:00 PM on the same day as draw
- [ ] Correct timezone handling

### ✅ DST Transitions

- [ ] Dates in AEST period (April-October) show "AEST"
- [ ] Dates in AEDT period (October-April) show "AEDT"
- [ ] 30-day cycles maintain 8:30 PM time across DST boundaries
- [ ] Activation dates remain at midnight across DST boundaries

### ✅ Auto-Calculations

- [ ] Activation date auto-calculates correctly
- [ ] Freeze date auto-calculates correctly
- [ ] Time difference between freeze and draw is exactly 30 minutes

---

## Common Issues to Watch For

1. **Wrong timezone abbreviation**: Should show AEST in winter, AEDT in summer
2. **Incorrect UTC offset**: Check that UTC times match expected offsets
3. **Activation date not at midnight**: Should always be 12:00 AM
4. **Draw date not at 8:30 PM**: Should always be 8:30 PM, not 8:00 PM
5. **Freeze date wrong**: Should be 8:00 PM (30 min before 8:30 PM), not 8:30 PM

---

## Quick Test Scenarios

### Scenario 1: Create Draw Today

1. Open create major draw modal
2. Verify default date is today/tomorrow at 8:30 PM
3. Check activation is next day at 12:00 AM
4. Check freeze is same day at 8:00 PM
5. Submit and verify in database

### Scenario 2: Create Draw in Winter (AEST)

1. Create draw for June 15, 2024 8:30 PM
2. Verify it shows "AEST"
3. Check UTC is 10:30 AM (8:30 PM - 10 hours)
4. Verify activation is June 16, 12:00 AM AEST

### Scenario 3: Create Draw in Summer (AEDT)

1. Create draw for December 15, 2024 8:30 PM
2. Verify it shows "AEDT"
3. Check UTC is 9:30 AM (8:30 PM - 11 hours)
4. Verify activation is December 16, 12:00 AM AEDT

### Scenario 4: Custom Activation Date

1. Create draw with custom activation date at 3:00 PM
2. Submit the form
3. Verify it's normalized to 12:00 AM in database

---

## Need Help?

If you encounter issues:

1. Check browser console for errors
2. Check server logs for timezone-related errors
3. Verify your system timezone settings
4. Run the automated test script to isolate the issue
5. Check database to see actual stored UTC values
