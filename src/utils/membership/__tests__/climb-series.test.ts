import { buildClimbSeries } from "../climb-series";

function assert(name: string, cond: boolean) {
  if (!cond) {
    console.error("FAIL", name);
    process.exitCode = 1;
  } else {
    console.log("PASS", name);
  }
}

// Boss base 100, no promo, 6 months → 100,200,300,400,500,600
assert(
  "boss no-promo",
  JSON.stringify(buildClimbSeries(100, 1, 6)) === JSON.stringify([100, 200, 300, 400, 500, 600]),
);
// Foreman base 40, 2x promo, 6 months → 80,120,160,200,240,280 (month1=80, +40 each)
assert(
  "foreman 2x",
  JSON.stringify(buildClimbSeries(40, 2, 6)) === JSON.stringify([80, 120, 160, 200, 240, 280]),
);
// guards
assert("zero months", buildClimbSeries(100, 1, 0).length === 0);
assert("negative months", buildClimbSeries(100, 1, -3).length === 0);
