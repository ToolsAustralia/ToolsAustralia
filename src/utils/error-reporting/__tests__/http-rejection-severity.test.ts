import assert from "node:assert";
import { classifyHttpRejection } from "../http-rejection-severity";

// < 400 (incl. 3xx) → not captured (code irrelevant)
for (const s of [200, 204, 301, 302, 304, 399]) {
  assert.equal(classifyHttpRejection(s, { hasBusinessCode: true }).capture, false, `status ${s} should NOT be captured`);
}

// Routine gate statuses → never captured, even WITH a business code
for (const s of [401, 403, 404, 429]) {
  assert.equal(classifyHttpRejection(s, { hasBusinessCode: true }).capture, false, `gate status ${s} should NOT be captured`);
}

// Other 4xx WITH a business code → captured "medium"
for (const s of [400, 402, 409, 422, 499]) {
  const r = classifyHttpRejection(s, { hasBusinessCode: true });
  assert.equal(r.capture, true, `coded ${s} should be captured`);
  assert.equal(r.severity, "medium", `coded ${s} should be medium`);
}

// Other 4xx WITHOUT a code → not captured (with or without opts)
for (const s of [400, 409, 422]) {
  assert.equal(classifyHttpRejection(s, { hasBusinessCode: false }).capture, false, `codeless ${s} should NOT be captured`);
  assert.equal(classifyHttpRejection(s).capture, false, `codeless ${s} (no opts) should NOT be captured`);
}

// 5xx → captured as "high" regardless of code
for (const s of [500, 502, 503, 599]) {
  for (const opts of [{ hasBusinessCode: true }, { hasBusinessCode: false }, undefined]) {
    const r = classifyHttpRejection(s, opts);
    assert.equal(r.capture, true, `status ${s} should be captured`);
    assert.equal(r.severity, "high", `status ${s} should be high`);
  }
}

// invalid input → not captured
for (const s of [Number.NaN, 0, -1]) {
  assert.equal(classifyHttpRejection(s, { hasBusinessCode: true }).capture, false, `invalid status ${s} should NOT be captured`);
}

console.log("✅ classifyHttpRejection: all assertions passed");
