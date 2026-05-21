import assert from "node:assert/strict";
import { CsvImportService } from "../CsvImportService";
import { generateUniqueCode, getMonthKey } from "../CampaignService";

function testCsvParsing() {
  const input = `
  66f0f8f1b8624b8dc6e7f100
  "66f0f8f1b8624b8dc6e7f101"
  66f0f8f1b8624b8dc6e7f100
  `;

  const result = CsvImportService.parseUserIdentifiers(input);
  assert.equal(result.userIds.length, 2, "CSV parser should deduplicate identifiers");
  assert.equal(result.invalidRows.length, 0, "CSV parser should not mark valid rows invalid");
}

function testMonthKey() {
  const date = new Date("2026-03-13T00:00:00.000Z");
  assert.equal(getMonthKey(date), "2026-03", "Month key should be in YYYY-MM format");
}

function testUniqueCode() {
  const code = generateUniqueCode("2026-03");
  assert.match(code, /^TA-202603-[A-Z0-9]{6}$/, "Generated code should match expected pattern");
}

function run() {
  testCsvParsing();
  testMonthKey();
  testUniqueCode();
  console.log("Redeemables tests passed");
}

run();
