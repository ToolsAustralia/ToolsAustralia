import assert from "node:assert/strict";
import { foldKlaviyoValues, type ValuesResultRow } from "../foldKlaviyoValues";

// Fixtures mirror the verified Klaviyo values-report response rows (read-only probe, 2026-06-03):
// each row = { groupings: { <idKey>, send_channel, <message_id> }, statistics: { conversion_value, conversions, ... } }.
const campaignRows: ValuesResultRow[] = [
  { groupings: { send_channel: "email", campaign_id: "C1", campaign_message_id: "C1" }, statistics: { conversion_value: 3374.97, conversion_uniques: 93, conversions: 100 } },
  { groupings: { send_channel: "sms", campaign_id: "C1", campaign_message_id: "C1b" }, statistics: { conversion_value: 100, conversions: 5 } },
  { groupings: { send_channel: "email", campaign_id: "C2", campaign_message_id: "C2" }, statistics: { conversion_value: 50, conversions: 1 } },
  { groupings: { send_channel: "email", campaign_message_id: "noid" }, statistics: { conversion_value: 999, conversions: 9 } }, // missing campaign_id → skipped
];

const flowRows: ValuesResultRow[] = [
  { groupings: { flow_id: "F1", send_channel: "email", flow_message_id: "M1" }, statistics: { conversion_value: 60, conversions: 2 } },
];

function run() {
  const camps = foldKlaviyoValues(campaignRows, "campaign_id");
  assert.equal(camps.length, 2, "two campaigns (row without campaign_id skipped)");

  // Sorted by total revenue desc → C1 first.
  assert.equal(camps[0].entityId, "C1");
  assert.equal(camps[1].entityId, "C2");

  const c1 = camps[0];
  assert.equal(c1.email.revenue, 3374.97, "C1 email revenue");
  assert.equal(c1.email.conversions, 100, "C1 email conversions");
  assert.equal(c1.sms.revenue, 100, "C1 sms revenue");
  assert.equal(c1.sms.conversions, 5, "C1 sms conversions");
  assert.ok(Math.abs(c1.total.revenue - 3474.97) < 1e-9, "C1 total = email + sms revenue");
  assert.equal(c1.total.conversions, 105, "C1 total conversions");

  const c2 = camps[1];
  assert.equal(c2.email.revenue, 50);
  assert.deepEqual(c2.sms, { revenue: 0, conversions: 0 }, "C2 has no sms");
  assert.equal(c2.total.revenue, 50);

  const flows = foldKlaviyoValues(flowRows, "flow_id");
  assert.equal(flows.length, 1);
  assert.equal(flows[0].entityId, "F1");
  assert.equal(flows[0].email.revenue, 60);
  assert.equal(flows[0].total.conversions, 2);

  // Defensive: empty / undefined.
  assert.deepEqual(foldKlaviyoValues([], "campaign_id"), []);
  assert.deepEqual(foldKlaviyoValues(undefined as unknown as ValuesResultRow[], "flow_id"), []);

  console.log("foldKlaviyoValues tests passed");
}

run();
