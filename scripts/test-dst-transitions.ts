/**
 * DST TRANSITION TEST SCRIPT
 *
 * Tests timezone handling and DST transitions for major draw creation.
 * Verifies that:
 * - createAESTDateAsUTC produces correct UTC values
 * - formatDateReadable shows correct AEST/AEDT labels
 * - Auto-calculated dates (activation, freeze) are correct across DST boundaries
 * - Dates during AEST (winter, UTC+10) are handled correctly
 * - Dates during AEDT (summer, UTC+11) are handled correctly
 * - DST transition dates (first Sunday in October and first Sunday in April) work correctly
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import {
  createAESTDateAsUTC,
  formatDateReadable,
  convertUTCToAEST,
  calculateActivationDate,
  calculateFreezeTime,
  calculateNextDrawDate,
} from "@/utils/common/timezone";

/**
 * Helper function to get the first Sunday of a given month
 */
function getFirstSunday(year: number, month: number): Date {
  // month is 1-12 (not 0-11)
  const firstDay = new Date(year, month - 1, 1);
  const dayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const daysToAdd = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  return new Date(year, month - 1, 1 + daysToAdd);
}

/**
 * Test createAESTDateAsUTC function
 */
function testCreateAESTDateAsUTC() {
  console.log("\n🧪 TEST 1: createAESTDateAsUTC\n");
  console.log("Testing date creation during different DST periods...\n");

  // Test during AEST (winter) - April 15, 2024, 8:30 PM
  const aprilDate = createAESTDateAsUTC(2024, 4, 15, 20, 30);
  console.log("April 15, 2024 8:30 PM AEST (should be UTC+10):");
  console.log(`  UTC: ${aprilDate.toISOString()}`);
  console.log(`  Formatted: ${formatDateReadable(aprilDate)}`);
  console.log(`  Expected UTC offset: 10 hours (should be around ${new Date("2024-04-15T10:30:00Z").toISOString()})`);
  console.log("");

  // Test during AEDT (summer) - December 15, 2024, 8:30 PM
  const decemberDate = createAESTDateAsUTC(2024, 12, 15, 20, 30);
  console.log("December 15, 2024 8:30 PM AEDT (should be UTC+11):");
  console.log(`  UTC: ${decemberDate.toISOString()}`);
  console.log(`  Formatted: ${formatDateReadable(decemberDate)}`);
  console.log(`  Expected UTC offset: 11 hours (should be around ${new Date("2024-12-15T09:30:00Z").toISOString()})`);
  console.log("");

  // Test DST transition - First Sunday in October 2024 (DST starts)
  const octoberFirstSunday = getFirstSunday(2024, 10);
  const octoberTransition = createAESTDateAsUTC(
    octoberFirstSunday.getFullYear(),
    octoberFirstSunday.getMonth() + 1,
    octoberFirstSunday.getDate(),
    2,
    0
  );
  console.log(`First Sunday in October 2024 (DST starts) - ${octoberFirstSunday.toLocaleDateString()} 2:00 AM:`);
  console.log(`  UTC: ${octoberTransition.toISOString()}`);
  console.log(`  Formatted: ${formatDateReadable(octoberTransition)}`);
  console.log("");

  // Test DST transition - First Sunday in April 2025 (DST ends)
  const aprilFirstSunday = getFirstSunday(2025, 4);
  const aprilTransition = createAESTDateAsUTC(
    aprilFirstSunday.getFullYear(),
    aprilFirstSunday.getMonth() + 1,
    aprilFirstSunday.getDate(),
    2,
    0
  );
  console.log(`First Sunday in April 2025 (DST ends) - ${aprilFirstSunday.toLocaleDateString()} 2:00 AM:`);
  console.log(`  UTC: ${aprilTransition.toISOString()}`);
  console.log(`  Formatted: ${formatDateReadable(aprilTransition)}`);
  console.log("");
}

/**
 * Test formatDateReadable function to verify correct AEST/AEDT labels
 */
function testFormatDateReadable() {
  console.log("\n🧪 TEST 2: formatDateReadable (AEST/AEDT labels)\n");

  // Test during AEST (winter) - Should show AEST
  const winterDate = createAESTDateAsUTC(2024, 6, 15, 20, 30); // June (winter)
  console.log("June 15, 2024 8:30 PM (should show AEST):");
  console.log(`  ${formatDateReadable(winterDate)}`);
  const hasAEST = formatDateReadable(winterDate).includes("AEST");
  console.log(`  ✓ Correct label: ${hasAEST ? "✅ AEST" : "❌ Missing AEST"}`);
  console.log("");

  // Test during AEDT (summer) - Should show AEDT
  const summerDate = createAESTDateAsUTC(2024, 12, 15, 20, 30); // December (summer)
  console.log("December 15, 2024 8:30 PM (should show AEDT):");
  console.log(`  ${formatDateReadable(summerDate)}`);
  const hasAEDT = formatDateReadable(summerDate).includes("AEDT");
  console.log(`  ✓ Correct label: ${hasAEDT ? "✅ AEDT" : "❌ Missing AEDT"}`);
  console.log("");

  // Test at DST boundary - October (should show AEDT)
  const octoberFirstSunday = getFirstSunday(2024, 10);
  const octoberDate = createAESTDateAsUTC(
    octoberFirstSunday.getFullYear(),
    octoberFirstSunday.getMonth() + 1,
    octoberFirstSunday.getDate() + 1, // Day after DST starts
    20,
    0
  );
  console.log(`Day after DST starts (October) - should show AEDT:`);
  console.log(`  ${formatDateReadable(octoberDate)}`);
  const hasAEDTAfter = formatDateReadable(octoberDate).includes("AEDT");
  console.log(`  ✓ Correct label: ${hasAEDTAfter ? "✅ AEDT" : "❌ Missing AEDT"}`);
  console.log("");

  // Test at DST boundary - April (should show AEST)
  const aprilFirstSunday = getFirstSunday(2025, 4);
  const aprilDate = createAESTDateAsUTC(
    aprilFirstSunday.getFullYear(),
    aprilFirstSunday.getMonth() + 1,
    aprilFirstSunday.getDate() + 1, // Day after DST ends
    20,
    0
  );
  console.log(`Day after DST ends (April) - should show AEST:`);
  console.log(`  ${formatDateReadable(aprilDate)}`);
  const hasAESTAfter = formatDateReadable(aprilDate).includes("AEST");
  console.log(`  ✓ Correct label: ${hasAESTAfter ? "✅ AEST" : "❌ Missing AEST"}`);
  console.log("");
}

/**
 * Test auto-calculated dates across DST boundaries
 */
function testAutoCalculatedDates() {
  console.log("\n🧪 TEST 3: Auto-calculated dates across DST boundaries\n");

  // Test activation date calculation during AEST
  const winterDrawDate = createAESTDateAsUTC(2024, 6, 30, 20, 30); // June 30, 8:30 PM AEST
  const winterActivation = calculateActivationDate(winterDrawDate);
  console.log("Winter draw (AEST):");
  console.log(`  Draw date: ${formatDateReadable(winterDrawDate)}`);
  console.log(`  Activation: ${formatDateReadable(winterActivation)}`);
  console.log(`  Expected: July 1, 2024 12:00 AM AEST`);
  const winterActivationAEST = convertUTCToAEST(winterActivation);
  const isCorrectWinter =
    winterActivationAEST.getMonth() === 6 && // July (0-indexed = 6)
    winterActivationAEST.getDate() === 1 &&
    winterActivationAEST.getHours() === 0;
  console.log(`  ✓ Correct: ${isCorrectWinter ? "✅" : "❌"}`);
  console.log("");

  // Test activation date calculation during AEDT
  const summerDrawDate = createAESTDateAsUTC(2024, 12, 30, 20, 30); // December 30, 8:30 PM AEDT
  const summerActivation = calculateActivationDate(summerDrawDate);
  console.log("Summer draw (AEDT):");
  console.log(`  Draw date: ${formatDateReadable(summerDrawDate)}`);
  console.log(`  Activation: ${formatDateReadable(summerActivation)}`);
  console.log(`  Expected: December 31, 2024 12:00 AM AEDT`);
  const summerActivationAEST = convertUTCToAEST(summerActivation);
  const isCorrectSummer =
    summerActivationAEST.getMonth() === 11 && // December (0-indexed = 11)
    summerActivationAEST.getDate() === 31 &&
    summerActivationAEST.getHours() === 0;
  console.log(`  ✓ Correct: ${isCorrectSummer ? "✅" : "❌"}`);
  console.log("");

  // Test freeze time calculation (should always be 30 minutes before)
  const testDrawDate = createAESTDateAsUTC(2024, 10, 15, 20, 30); // October 15, 8:30 PM
  const freezeTime = calculateFreezeTime(testDrawDate);
  console.log("Freeze time calculation:");
  console.log(`  Draw date: ${formatDateReadable(testDrawDate)}`);
  console.log(`  Freeze time: ${formatDateReadable(freezeTime)}`);
  const timeDiff = testDrawDate.getTime() - freezeTime.getTime();
  const is30Minutes = Math.abs(timeDiff - 30 * 60 * 1000) < 1000; // Allow 1 second tolerance
  console.log(`  Time difference: ${timeDiff / (60 * 1000)} minutes`);
  console.log(`  ✓ 30 minutes before: ${is30Minutes ? "✅" : "❌"}`);
  console.log("");

  // Test next draw date calculation across DST boundary
  const drawBeforeDST = createAESTDateAsUTC(2024, 9, 30, 20, 30); // September 30 (AEST)
  const nextDrawAfterDST = calculateNextDrawDate(drawBeforeDST); // Should be October 30 (AEDT)
  console.log("Next draw date across DST boundary:");
  console.log(`  Current draw: ${formatDateReadable(drawBeforeDST)}`);
  console.log(`  Next draw (30 days later): ${formatDateReadable(nextDrawAfterDST)}`);
  const nextDrawAEST = convertUTCToAEST(nextDrawAfterDST);
  const isCorrectNextDraw =
    nextDrawAEST.getMonth() === 9 && // October (0-indexed = 9)
    nextDrawAEST.getDate() === 30 &&
    nextDrawAEST.getHours() === 20 &&
    nextDrawAEST.getMinutes() === 30;
  console.log(`  Expected: October 30, 2024 8:30 PM AEDT`);
  console.log(`  ✓ Correct: ${isCorrectNextDraw ? "✅" : "❌"}`);
  console.log("");
}

/**
 * Test DST transition edge cases
 */
function testDSTEdgeCases() {
  console.log("\n🧪 TEST 4: DST transition edge cases\n");

  // Test creating a draw exactly at DST start (first Sunday in October, 2:00 AM)
  const octoberFirstSunday = getFirstSunday(2024, 10);
  const dstStartDate = createAESTDateAsUTC(
    octoberFirstSunday.getFullYear(),
    octoberFirstSunday.getMonth() + 1,
    octoberFirstSunday.getDate(),
    2,
    0
  );
  console.log("DST Start (First Sunday in October, 2:00 AM):");
  console.log(`  Date: ${formatDateReadable(dstStartDate)}`);
  console.log(`  UTC: ${dstStartDate.toISOString()}`);
  console.log("");

  // Test creating a draw exactly at DST end (first Sunday in April, 3:00 AM AEDT becomes 2:00 AM AEST)
  const aprilFirstSunday = getFirstSunday(2025, 4);
  const dstEndDate = createAESTDateAsUTC(
    aprilFirstSunday.getFullYear(),
    aprilFirstSunday.getMonth() + 1,
    aprilFirstSunday.getDate(),
    2,
    0
  );
  console.log("DST End (First Sunday in April, 2:00 AM):");
  console.log(`  Date: ${formatDateReadable(dstEndDate)}`);
  console.log(`  UTC: ${dstEndDate.toISOString()}`);
  console.log("");

  // Test 30-day cycle that spans DST transition
  const septDraw = createAESTDateAsUTC(2024, 9, 15, 20, 30); // September 15 (AEST)
  const octDraw = calculateNextDrawDate(septDraw); // October 15 (should be AEDT)
  console.log("30-day cycle spanning DST transition:");
  console.log(`  September 15 (AEST): ${formatDateReadable(septDraw)}`);
  console.log(`  October 15 (AEDT): ${formatDateReadable(octDraw)}`);
  const septAEST = convertUTCToAEST(septDraw);
  const octAEST = convertUTCToAEST(octDraw);
  const timeDiff = octAEST.getTime() - septAEST.getTime();
  const daysDiff = timeDiff / (24 * 60 * 60 * 1000);
  console.log(`  Days difference: ${daysDiff.toFixed(2)} (should be ~30 days)`);
  console.log(`  ✓ Correct: ${Math.abs(daysDiff - 30) < 0.1 ? "✅" : "❌"}`);
  console.log("");
}

/**
 * Main test runner
 */
async function runDSTTests() {
  console.log("=".repeat(60));
  console.log("DST TRANSITION TEST SUITE");
  console.log("=".repeat(60));
  console.log("\nTesting timezone handling and DST transitions...\n");

  try {
    testCreateAESTDateAsUTC();
    testFormatDateReadable();
    testAutoCalculatedDates();
    testDSTEdgeCases();

    console.log("=".repeat(60));
    console.log("✅ ALL TESTS COMPLETED");
    console.log("=".repeat(60));
    console.log("\nSummary:");
    console.log("  - createAESTDateAsUTC: Tests date creation during AEST/AEDT");
    console.log("  - formatDateReadable: Tests correct AEST/AEDT label display");
    console.log("  - Auto-calculated dates: Tests activation, freeze, and next draw calculations");
    console.log("  - DST edge cases: Tests DST transition boundaries");
    console.log("\nReview the output above to verify all tests pass correctly.");
  } catch (error) {
    console.error("\n❌ Error running tests:", error);
    process.exit(1);
  }
}

// Run the tests
runDSTTests();
