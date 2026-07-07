import assert from "node:assert";
import { getDashboardStateTheme } from "../dashboard-state-theme";

// active member with a light tier (foreman gold) → dark ink
const foreman = getDashboardStateTheme("active", "#ffd200");
assert.ok(foreman.gradient.includes("157deg"), "active gradient uses 157deg");
assert.strictEqual(foreman.ink, "#0a0a0a", "gold tier → dark ink");
assert.strictEqual(foreman.accent, "#ffd200");

// active member with a dark tier (boss red) → white ink
const boss = getDashboardStateTheme("active", "#ee0000");
assert.strictEqual(boss.ink, "#ffffff", "red tier → white ink");

// active with no tier hex falls back to red (white ink)
assert.strictEqual(getDashboardStateTheme("active").ink, "#ffffff", "active fallback → white ink");

// non-member states are fixed palettes, white ink
for (const s of ["onetime", "pastdue", "none"] as const) {
  const t = getDashboardStateTheme(s);
  assert.ok(t.gradient.startsWith("linear-gradient"), `${s} has a gradient`);
  assert.strictEqual(t.ink, "#ffffff", `${s} → white ink`);
}
assert.strictEqual(getDashboardStateTheme("onetime").accent, "#0ea5a5", "onetime accent = teal");
assert.strictEqual(getDashboardStateTheme("pastdue").accent, "#d97706", "pastdue accent = amber");

console.log("dashboard-state-theme: PASS");
