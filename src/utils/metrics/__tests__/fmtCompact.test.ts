import assert from "node:assert";
import { fmtCompact } from "../formatters";

assert.equal(fmtCompact(0), "$0");
assert.equal(fmtCompact(820), "$820");
assert.equal(fmtCompact(214830), "$214.8k");
assert.equal(fmtCompact(4218600), "$4.22M");
assert.equal(fmtCompact(-1500), "-$1.5k");

console.log("fmtCompact: all assertions passed");
