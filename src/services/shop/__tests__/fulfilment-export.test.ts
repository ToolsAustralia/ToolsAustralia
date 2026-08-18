import { strict as assert } from "node:assert";
import { toCsv, type FulfilmentRow } from "@/services/shop/fulfilmentExport";

/**
 * CSV shape for the print provider's bulk upload.
 *
 * `toCsv` is pure, so this needs no database. It is worth its own test because a
 * malformed row here does not throw — it ships a garment to the wrong address, or
 * silently shifts every column right by one for the rest of the file.
 */

function row(over: Partial<FulfilmentRow> = {}): FulfilmentRow {
  return {
    orderNumber: "SHOP-20260818-ABC123",
    productId: "9312345678907",
    sku: "TEE-BLK-L",
    productName: "Staple Tee",
    size: "L",
    colour: "Black",
    quantity: 1,
    firstName: "Jo",
    lastName: "Smith",
    email: "jo@example.com",
    phone: "0400000000",
    addressLine1: "6A Aylesbury Crescent",
    addressLine2: "",
    city: "Gladstone Park",
    state: "VIC",
    postalCode: "3043",
    country: "Australia",
    deliveryInstructions: "",
    ...over,
  };
}

let failures = 0;
const check = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failures++;
    console.error(`✗ ${name}\n   ${err instanceof Error ? err.message : String(err)}`);
  }
};

const lines = (csv: string) => csv.trimEnd().split("\r\n");

check("header row is emitted once, with a stable column order", () => {
  const csv = toCsv([row()]);
  const head = lines(csv)[0];
  assert.ok(head.startsWith('"order_number","product_id"'), `unexpected header: ${head}`);
  assert.equal(lines(csv).length, 2, "one header + one data row");
});

check("an empty export still emits the header", () => {
  // The provider's upload screen needs the header row to offer field mapping at all;
  // a zero-byte file gives the admin nothing to map.
  const csv = toCsv([]);
  assert.equal(lines(csv).length, 1);
  assert.ok(lines(csv)[0].includes("product_id"));
});

check("a comma in an address does not create a new column", () => {
  // The failure this guards: unquoted "Unit 2, 14 Smith St" shifts every later column
  // by one for that row, so postcode lands in state and the parcel is misrouted.
  const csv = toCsv([row({ addressLine1: "Unit 2, 14 Smith St" })]);
  const data = lines(csv)[1];
  assert.ok(data.includes('"Unit 2, 14 Smith St"'), "comma field must be quoted intact");
  assert.equal(
    data.split('","').length,
    lines(csv)[0].split('","').length,
    "row must have the same column count as the header"
  );
});

check("a double quote is escaped by doubling, per RFC 4180", () => {
  const csv = toCsv([row({ deliveryInstructions: 'Leave at the "back" gate' })]);
  assert.ok(lines(csv)[1].includes('"Leave at the ""back"" gate"'));
});

check("a newline inside a field stays inside its quoted cell", () => {
  const csv = toCsv([row({ deliveryInstructions: "Gate code 1234\nRing twice" })]);
  // The record spans two physical lines, but the file must still hold exactly one
  // data record — splitting on newline is precisely how this breaks.
  assert.ok(csv.includes('"Gate code 1234\nRing twice"'));
  assert.equal(csv.trimEnd().split("\r\n").length, 2, "still one header + one record");
});

check("a missing GTIN exports as an empty cell, not the string undefined", () => {
  // Exporting "undefined" would be accepted by their mapper as a real product id.
  const csv = toCsv([row({ productId: "" })]);
  assert.ok(lines(csv)[1].includes('"SHOP-20260818-ABC123","",'));
  assert.ok(!csv.includes("undefined"));
});

check("quantity is written as a number, not a padded or localised string", () => {
  const csv = toCsv([row({ quantity: 3 })]);
  assert.ok(lines(csv)[1].includes('"3"'));
});

check("one row per item — three items are three records", () => {
  const csv = toCsv([row(), row({ sku: "TEE-BLK-M", size: "M" }), row({ sku: "JKT-BLK-L" })]);
  assert.equal(lines(csv).length, 4, "header + 3");
});

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll fulfilment-export CSV guards passed");
