import assert from "node:assert/strict";
import {
  rewriteHexArbitraries,
  rewriteArbitrarySizes,
  rewriteExactArbitrary,
} from "../lib/replace-classname";

const SNAP_MAP: Record<string, string> = {
  "#ee0000": "red-600",
  "#cc0000": "red-700",
  "#ff4444": "red-400",
  "#ec0000": "red-500",
  "#e60000": "red-650",
  "#b91c1c": "red-800",
  "#991b1b": "red-900",
  "#7f1d1d": "red-950",
  "#fef2f2": "red-50",
  "#fee2e2": "red-100",
  "#fecaca": "red-200",
};

let testsRun = 0;
let testsFailed = 0;

function test(name: string, fn: () => void): void {
  testsRun++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    testsFailed++;
    console.error(`  ✗ ${name}`);
    console.error(err instanceof Error ? err.message : String(err));
  }
}

function suite(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

// ---------------------------------------------------------------- rewriteHexArbitraries

suite("rewriteHexArbitraries — basic", () => {
  test("replaces simple bg-[#ee0000]", () => {
    const unmapped = new Set<string>();
    const { content, replacements } = rewriteHexArbitraries(
      `<div className="bg-[#ee0000]" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="bg-red-600" />`);
    assert.equal(replacements.length, 1);
    assert.equal(unmapped.size, 0);
  });

  test("replaces text-[#cc0000]", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<span className="text-[#cc0000]">x</span>`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<span className="text-red-700">x</span>`);
  });

  test("preserves uppercase hex by snapping case-insensitively", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<div className="bg-[#EE0000]" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="bg-red-600" />`);
  });
});

suite("rewriteHexArbitraries — with prefixes", () => {
  test("preserves single variant prefix (hover:)", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<button className="hover:bg-[#ee0000]" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<button className="hover:bg-red-600" />`);
  });

  test("preserves chained variant prefixes (group-hover:dark:)", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<div className="group-hover:dark:from-[#cc0000]" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="group-hover:dark:from-red-700" />`);
  });

  test("handles focus-within:", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<input className="focus-within:ring-[#ee0000]" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<input className="focus-within:ring-red-600" />`);
  });
});

suite("rewriteHexArbitraries — with opacity modifier", () => {
  test("preserves /50 opacity", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<div className="bg-[#ee0000]/50" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="bg-red-600/50" />`);
  });

  test("preserves /80 with prefix", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<div className="hover:bg-[#cc0000]/80" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="hover:bg-red-700/80" />`);
  });

  test("preserves decimal opacity /12.5", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<div className="ring-[#ee0000]/12.5" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="ring-red-600/12.5" />`);
  });
});

suite("rewriteHexArbitraries — gradient utilities", () => {
  test("replaces from-[#ee0000]", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<div className="from-[#ee0000]" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="from-red-600" />`);
  });

  test("replaces via-[#ff4444] and to-[#cc0000] in same string", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<div className="from-[#ee0000] via-[#ff4444] to-[#cc0000]" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="from-red-600 via-red-400 to-red-700" />`);
  });
});

suite("rewriteHexArbitraries — multiple replacements", () => {
  test("handles multiple matches across one className", () => {
    const unmapped = new Set<string>();
    const { content, replacements } = rewriteHexArbitraries(
      `<div className="bg-[#ee0000] hover:bg-[#cc0000] text-[#fef2f2]" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="bg-red-600 hover:bg-red-700 text-red-50" />`);
    assert.equal(replacements.length, 3);
  });

  test("tracks unmapped hexes without replacing", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<div className="bg-[#deadbe] text-[#ee0000]" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="bg-[#deadbe] text-red-600" />`);
    assert.equal(unmapped.size, 1);
    assert.ok(unmapped.has("#deadbe"));
  });
});

suite("rewriteHexArbitraries — edge cases that must NOT match", () => {
  test("ignores hex inside CSS gradient string (different syntax)", () => {
    // bg-[linear-gradient(...)] is valid Tailwind arbitrary CSS but the hex is
    // INSIDE the value, not at the [#hex] position. Our regex looks for `-[#...]`
    // immediately, so it won't match `[linear-gradient(180deg,#ee0000)]`.
    const unmapped = new Set<string>();
    const before = `<div className="bg-[linear-gradient(180deg,#ee0000,#cc0000)]" />`;
    const { content, replacements } = rewriteHexArbitraries(before, SNAP_MAP, unmapped);
    assert.equal(content, before, "gradient string must be untouched");
    assert.equal(replacements.length, 0);
  });

  test("ignores hex inside style={{ ... }}", () => {
    // The regex pattern doesn't match identifiers without a leading lowercase
    // utility-style name + `-[`. `style={{ color: "#ee0000" }}` has no
    // `<utility>-[#hex]` shape.
    const unmapped = new Set<string>();
    const before = `<div style={{ color: "#ee0000" }} />`;
    const { content } = rewriteHexArbitraries(before, SNAP_MAP, unmapped);
    assert.equal(content, before);
  });

  test("ignores template-literal classNames (regex sees the literal `${...}`)", () => {
    const unmapped = new Set<string>();
    const before = "<div className={`bg-[${color}]`} />";
    const { content } = rewriteHexArbitraries(before, SNAP_MAP, unmapped);
    // No #hex inside square brackets — regex doesn't match
    assert.equal(content, before);
  });
});

// ---------------------------------------------------------------- rewriteArbitrarySizes

suite("rewriteArbitrarySizes — text sizes", () => {
  const TEXT_MAP = { utility: "text", values: { "10px": "2xs", "8px": "3xs" } };

  test("replaces text-[10px]", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteArbitrarySizes(
      `<span className="text-[10px]" />`,
      TEXT_MAP,
      unmapped,
    );
    assert.equal(content, `<span className="text-2xs" />`);
  });

  test("replaces text-[8px]", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteArbitrarySizes(
      `<span className="text-[8px]" />`,
      TEXT_MAP,
      unmapped,
    );
    assert.equal(content, `<span className="text-3xs" />`);
  });

  test("preserves prefix on text-[10px]", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteArbitrarySizes(
      `<span className="hover:text-[10px]" />`,
      TEXT_MAP,
      unmapped,
    );
    assert.equal(content, `<span className="hover:text-2xs" />`);
  });

  test("does not match utilities other than `text`", () => {
    const unmapped = new Set<string>();
    const before = `<div className="w-[10px]" />`;
    const { content } = rewriteArbitrarySizes(before, TEXT_MAP, unmapped);
    assert.equal(content, before);
  });

  test("tracks unmapped sizes without replacing", () => {
    const unmapped = new Set<string>();
    const before = `<span className="text-[13px]" />`;
    const { content } = rewriteArbitrarySizes(before, TEXT_MAP, unmapped);
    assert.equal(content, before);
    assert.ok(unmapped.has("13px"));
  });
});

// ---------------------------------------------------------------- rewriteExactArbitrary

suite("rewriteExactArbitrary — header offsets", () => {
  test("replaces pt-[86px] with pt-[var(--app-header-h)]", () => {
    const { content, replacements } = rewriteExactArbitrary(
      `<main className="pt-[86px]" />`,
      "pt",
      "86px",
      "var(--app-header-h)",
    );
    assert.equal(content, `<main className="pt-[var(--app-header-h)]" />`);
    assert.equal(replacements.length, 1);
  });

  test("replaces pt-[106px] with pt-[var(--app-header-h-lg)]", () => {
    const { content } = rewriteExactArbitrary(
      `<main className="lg:pt-[106px]" />`,
      "pt",
      "106px",
      "var(--app-header-h-lg)",
    );
    assert.equal(content, `<main className="lg:pt-[var(--app-header-h-lg)]" />`);
  });

  test("does not match similar-but-different values", () => {
    const before = `<main className="pt-[88px]" />`;
    const { content } = rewriteExactArbitrary(before, "pt", "86px", "var(--app-header-h)");
    assert.equal(content, before);
  });
});

// ---------------------------------------------------------------- run

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
