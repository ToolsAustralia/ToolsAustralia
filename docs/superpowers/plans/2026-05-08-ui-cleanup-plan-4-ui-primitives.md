# UI Cleanup — Plan 4: UI Primitives

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-08-ui-primitives.md](../specs/2026-05-08-ui-primitives.md)

**Predecessors:** Plans 1-3 committed.

**Goal:** Ship 4 typed primitives (`Button`, `Badge`, `Card`, `Modal`) in `src/components/ui/` with CVA variants, smoke tests, and convention docs. Zero forced migrations.

**Architecture:** Each primitive is a small focused file. `Button` uses Radix Slot for `asChild`. `Card` is a compound (`Card`, `Card.Header`, `Card.Body`, `Card.Footer`). `Modal` is a re-export of the existing `ModalContainer` for atomic-design discoverability.

**Tech:** Tailwind 3, CVA, clsx + tailwind-merge (cn()), lucide-react, `@radix-ui/react-slot` (NEW dep), tsx for tests.

**Hard requirements:**
- Each primitive ≤120 LOC
- Zero forced migrations of existing call sites
- All smoke tests pass
- `npm run lint && npm run type-check && npm run build` clean
- Single Plan 4 commit at end (user-authorized)

---

## File Structure

**Create:**
- `src/components/ui/Button.tsx`
- `src/components/ui/Badge.tsx`
- `src/components/ui/Card.tsx`
- `src/components/ui/Modal.tsx` (re-export)
- `src/components/ui/__tests__/Button.test.ts`
- `src/components/ui/__tests__/Badge.test.ts`
- `src/components/ui/__tests__/Card.test.ts`
- `src/components/ui/__tests__/asset-stubs.cjs` (copy from existing modal test pattern)

**Modify:**
- `package.json` — add `@radix-ui/react-slot` dep + 1 npm script (`test:ui-primitives`)
- `CLAUDE.md` — bump `lastVerified` for `shared-ui` (the affected domain)

---

## Pre-flight check

- [ ] **Step 0: Confirm clean working tree on `ui-improvements` branch with Plans 1-3 committed**

```bash
git status --short
git log -3 --oneline
```

Expected: Plans 1, 2, 3 commits visible. Working tree clean (or only the 2 pre-existing unrelated mods).

---

## Task 1: Install `@radix-ui/react-slot` dependency

- [ ] **Step 1: Install**

```bash
npm install @radix-ui/react-slot
```

Expected: 1 package added (~3KB). No peer warnings.

- [ ] **Step 2: Verify in package.json**

`grep "@radix-ui/react-slot" package.json` shows the entry.

- [ ] **Step 3: Type-check + build**

```bash
npm run type-check 2>&1 | tail -3 && echo "===TC EXIT $?==="
npm run build 2>&1 | tail -5 && echo "===BUILD EXIT $?==="
```
Both exit 0.

---

## Task 2: Build `src/components/ui/Button.tsx`

- [ ] **Step 1: Write the file**

Use Write tool. EXACT content:

```tsx
"use client";

import React, { type ButtonHTMLAttributes, forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

const button = cva(
  "inline-flex items-center justify-center gap-1.5 font-bold rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-600/40",
  {
    variants: {
      variant: {
        primary: "border shadow-sm hover:[&:not(:disabled)]:-translate-y-px hover:[&:not(:disabled)]:brightness-105",
        outline: "bg-white border hover:[&:not(:disabled)]:bg-neutral-50",
        ghost: "bg-transparent border border-transparent hover:[&:not(:disabled)]:bg-neutral-100",
        link: "bg-transparent border-transparent underline-offset-4 hover:[&:not(:disabled)]:underline px-0 py-0",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
      },
      tone: {
        red: "",
        "tier-tradie": "",
        "tier-foreman": "",
        "tier-boss": "",
        neutral: "",
      },
    },
    compoundVariants: [
      // Primary tones
      { variant: "primary", tone: "red", class: "bg-gradient-to-b from-red-600 to-red-800 text-white border-red-800 shadow-[0_4px_12px_rgba(238,0,0,0.25)]" },
      { variant: "primary", tone: "tier-tradie", class: "bg-gradient-to-br from-[#5ca9ec] to-[#00c2ed] text-white border-[#00c2ed] shadow-[0_4px_12px_rgba(0,194,237,0.3)]" },
      { variant: "primary", tone: "tier-foreman", class: "bg-gradient-to-br from-[#ffe066] to-[#ffd200] text-neutral-950 border-[#ffd200] shadow-[0_4px_12px_rgba(255,210,0,0.3)]" },
      { variant: "primary", tone: "tier-boss", class: "bg-gradient-to-br from-[#ff3333] to-red-600 text-white border-red-600 shadow-[0_4px_12px_rgba(238,0,0,0.3)]" },
      { variant: "primary", tone: "neutral", class: "bg-gradient-to-b from-neutral-700 to-neutral-900 text-white border-neutral-900 shadow-[0_4px_12px_rgba(0,0,0,0.2)]" },
      // Outline tones
      { variant: "outline", tone: "red", class: "text-red-700 border-red-300 hover:[&:not(:disabled)]:bg-red-50 hover:[&:not(:disabled)]:border-red-700" },
      { variant: "outline", tone: "tier-tradie", class: "text-[#0b7e88] border-[#bae6fd] hover:[&:not(:disabled)]:bg-[#e0f9ff]" },
      { variant: "outline", tone: "tier-foreman", class: "text-[#a17b00] border-[#fde68a] hover:[&:not(:disabled)]:bg-[#fffbe6]" },
      { variant: "outline", tone: "tier-boss", class: "text-red-700 border-red-300 hover:[&:not(:disabled)]:bg-red-50" },
      { variant: "outline", tone: "neutral", class: "text-neutral-700 border-neutral-300 hover:[&:not(:disabled)]:bg-neutral-50" },
      // Ghost tones
      { variant: "ghost", tone: "red", class: "text-red-700 hover:[&:not(:disabled)]:bg-red-50" },
      { variant: "ghost", tone: "tier-tradie", class: "text-[#0b7e88] hover:[&:not(:disabled)]:bg-[#e0f9ff]" },
      { variant: "ghost", tone: "tier-foreman", class: "text-[#a17b00] hover:[&:not(:disabled)]:bg-[#fffbe6]" },
      { variant: "ghost", tone: "tier-boss", class: "text-red-700 hover:[&:not(:disabled)]:bg-red-50" },
      { variant: "ghost", tone: "neutral", class: "text-neutral-700 hover:[&:not(:disabled)]:bg-neutral-100" },
      // Link tones
      { variant: "link", tone: "red", class: "text-red-700 hover:[&:not(:disabled)]:text-red-800" },
      { variant: "link", tone: "tier-tradie", class: "text-[#0b7e88] hover:[&:not(:disabled)]:text-[#075e66]" },
      { variant: "link", tone: "tier-foreman", class: "text-[#a17b00] hover:[&:not(:disabled)]:text-[#7d5e00]" },
      { variant: "link", tone: "tier-boss", class: "text-red-700 hover:[&:not(:disabled)]:text-red-800" },
      { variant: "link", tone: "neutral", class: "text-neutral-700 hover:[&:not(:disabled)]:text-neutral-900" },
    ],
    defaultVariants: { variant: "primary", size: "md", tone: "red" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  /** When true, renders as the child element via Radix Slot — pass an <a>/<Link> child to make a button-styled link. */
  asChild?: boolean;
  /** When true, shows a Loader2 spinner and disables interaction. */
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, tone, asChild = false, loading = false, disabled, children, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const isDisabled = disabled || loading;
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type ?? "button"}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={cn(button({ variant, size, tone }), className)}
        {...props}
      >
        {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
        {children}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export default Button;
export { button as buttonStyles };
```

- [ ] **Step 2: Verify**

```bash
npm run type-check 2>&1 | tail -3 && echo "===TC EXIT $?==="
npm run build 2>&1 | tail -5 && echo "===BUILD EXIT $?==="
```
Both exit 0.

---

## Task 3: Build `src/components/ui/Badge.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { type HTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

const badge = cva(
  "inline-flex items-center justify-center gap-1 font-extrabold uppercase tracking-wider rounded-full whitespace-nowrap",
  {
    variants: {
      tone: {
        red: "bg-red-100 text-red-800 border border-red-200",
        gold: "bg-gradient-to-br from-[#f4cf6b] to-premium-gold text-neutral-950 border border-[#d4af37]",
        "tier-tradie": "bg-[#e0f9ff] text-[#0b7e88] border border-[#bae6fd]",
        "tier-foreman": "bg-[#fffbe6] text-[#a17b00] border border-[#fde68a]",
        "tier-boss": "bg-red-100 text-red-800 border border-red-200",
        neutral: "bg-neutral-100 text-neutral-700 border border-neutral-200",
        success: "bg-green-100 text-green-800 border border-green-200",
        warning: "bg-amber-100 text-amber-800 border border-amber-200",
        info: "bg-blue-100 text-blue-800 border border-blue-200",
      },
      size: {
        sm: "text-3xs px-1.5 py-0.5 leading-tight",
        md: "text-2xs px-2 py-0.5 leading-tight",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  }
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badge> {}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(({ className, tone, size, children, ...props }, ref) => {
  return (
    <span ref={ref} className={cn(badge({ tone, size }), className)} {...props}>
      {children}
    </span>
  );
});
Badge.displayName = "Badge";

export default Badge;
export { badge as badgeStyles };
```

- [ ] **Step 2: Verify**

```bash
npm run type-check 2>&1 | tail -3 && echo "===TC EXIT $?==="
npm run build 2>&1 | tail -5 && echo "===BUILD EXIT $?==="
```

---

## Task 4: Build `src/components/ui/Card.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { type HTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

const card = cva(
  "bg-white rounded-xl border border-neutral-200 shadow-sm",
  {
    variants: {
      padding: {
        none: "",
        sm: "p-3",
        md: "p-4",
        lg: "p-6",
      },
    },
    defaultVariants: { padding: "md" },
  }
);

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof card> {}

interface CardComponent
  extends React.ForwardRefExoticComponent<CardProps & React.RefAttributes<HTMLDivElement>> {
  Header: React.FC<HTMLAttributes<HTMLDivElement>>;
  Body: React.FC<HTMLAttributes<HTMLDivElement>>;
  Footer: React.FC<HTMLAttributes<HTMLDivElement>>;
}

const CardBase = forwardRef<HTMLDivElement, CardProps>(({ className, padding, children, ...props }, ref) => {
  return (
    <div ref={ref} className={cn(card({ padding }), className)} {...props}>
      {children}
    </div>
  );
}) as CardComponent;
CardBase.displayName = "Card";

const CardHeader: React.FC<HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div className={cn("border-b border-neutral-200 pb-3 mb-3 last:mb-0 last:border-b-0 last:pb-0", className)} {...props}>
    {children}
  </div>
);
CardHeader.displayName = "Card.Header";

const CardBody: React.FC<HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div className={cn("text-sm text-neutral-700", className)} {...props}>
    {children}
  </div>
);
CardBody.displayName = "Card.Body";

const CardFooter: React.FC<HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div className={cn("border-t border-neutral-200 pt-3 mt-3 first:mt-0 first:border-t-0 first:pt-0", className)} {...props}>
    {children}
  </div>
);
CardFooter.displayName = "Card.Footer";

CardBase.Header = CardHeader;
CardBase.Body = CardBody;
CardBase.Footer = CardFooter;

export default CardBase;
export { card as cardStyles };
```

- [ ] **Step 2: Verify**

```bash
npm run type-check 2>&1 | tail -3 && echo "===TC EXIT $?==="
npm run build 2>&1 | tail -5 && echo "===BUILD EXIT $?==="
```

---

## Task 5: Build `src/components/ui/Modal.tsx`

- [ ] **Step 1: Write the file** (thin re-export — no behavioral change)

```tsx
/**
 * Modal — atomic-design alias for ModalContainer.
 *
 * The actual implementation lives at @/components/modals/ui/ModalContainer.
 * This re-export provides the canonical atomic-design import path
 * `@/components/ui/Modal` for new code. Existing call sites can migrate
 * opportunistically.
 *
 * For a custom z-index outside the Z_INDEX scale (e.g. micro-stacks above
 * a parent modal), pass `zIndex={N}` — added in Plan 2 Task 1.
 */
export { default } from "@/components/modals/ui/ModalContainer";
```

- [ ] **Step 2: Verify**

```bash
npm run type-check 2>&1 | tail -3 && echo "===TC EXIT $?==="
npm run build 2>&1 | tail -5 && echo "===BUILD EXIT $?==="
```

---

## Task 6: Smoke tests for Button + Badge + Card

- [ ] **Step 1: Create directory + asset stubs**

```bash
mkdir -p src/components/ui/__tests__
cp src/components/modals/RenewalFailedModal/__tests__/asset-stubs.cjs src/components/ui/__tests__/asset-stubs.cjs
```

- [ ] **Step 2: Write `Button.test.ts`**

```ts
/**
 * Smoke test for Button. Renders all 4 variants × 3 sizes × 5 tones plus
 * loading + asChild combos via react-dom/server's renderToString.
 */
/* eslint-disable react/no-children-prop */

import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import Button from "../Button";

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

console.log("\nButton smoke test");

const variants = ["primary", "outline", "ghost", "link"] as const;
const sizes = ["sm", "md", "lg"] as const;
const tones = ["red", "tier-tradie", "tier-foreman", "tier-boss", "neutral"] as const;

for (const variant of variants) {
  for (const size of sizes) {
    for (const tone of tones) {
      test(`${variant} / ${size} / ${tone}`, () => {
        const el = React.createElement(Button, { variant, size, tone, children: "Click me" });
        const html = renderToString(el);
        assert.ok(html.length > 0, "should produce non-empty markup");
        assert.ok(html.includes("Click me"), "should render children");
      });
    }
  }
}

test("loading state renders spinner + sets aria-busy", () => {
  const el = React.createElement(Button, { loading: true, children: "Saving" });
  const html = renderToString(el);
  assert.ok(html.includes("animate-spin"), "should include spinner");
  assert.ok(html.includes('aria-busy="true"'), "should set aria-busy");
});

test("disabled state renders without crashing", () => {
  const el = React.createElement(Button, { disabled: true, children: "Disabled" });
  const html = renderToString(el);
  assert.ok(html.includes("disabled"), "should render disabled attr");
});

test("asChild renders the child element instead of <button>", () => {
  const el = React.createElement(Button, { asChild: true, children: React.createElement("a", { href: "/foo" }, "Link button") });
  const html = renderToString(el);
  assert.ok(html.startsWith("<a"), "should render as <a>");
  assert.ok(!html.includes("<button"), "should not render <button>");
});

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
```

- [ ] **Step 3: Write `Badge.test.ts`**

```ts
/* eslint-disable react/no-children-prop */
import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import Badge from "../Badge";

let testsRun = 0;
let testsFailed = 0;
function test(name: string, fn: () => void): void {
  testsRun++;
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (err) { testsFailed++; console.error(`  ✗ ${name}`); console.error(err instanceof Error ? err.message : String(err)); }
}

console.log("\nBadge smoke test");

const tones = ["red", "gold", "tier-tradie", "tier-foreman", "tier-boss", "neutral", "success", "warning", "info"] as const;
const sizes = ["sm", "md"] as const;

for (const tone of tones) {
  for (const size of sizes) {
    test(`${tone} / ${size}`, () => {
      const el = React.createElement(Badge, { tone, size, children: "NEW" });
      const html = renderToString(el);
      assert.ok(html.length > 0);
      assert.ok(html.includes("NEW"));
    });
  }
}

test("accepts and forwards className override", () => {
  const el = React.createElement(Badge, { className: "test-override", children: "X" });
  const html = renderToString(el);
  assert.ok(html.includes("test-override"));
});

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
```

- [ ] **Step 4: Write `Card.test.ts`**

```ts
/* eslint-disable react/no-children-prop */
import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import Card from "../Card";

let testsRun = 0;
let testsFailed = 0;
function test(name: string, fn: () => void): void {
  testsRun++;
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (err) { testsFailed++; console.error(`  ✗ ${name}`); console.error(err instanceof Error ? err.message : String(err)); }
}

console.log("\nCard smoke test");

const paddings = ["none", "sm", "md", "lg"] as const;

for (const padding of paddings) {
  test(`padding=${padding}`, () => {
    const el = React.createElement(Card, { padding, children: "body" });
    const html = renderToString(el);
    assert.ok(html.length > 0);
    assert.ok(html.includes("body"));
  });
}

test("compound: Card + Card.Header + Card.Body + Card.Footer", () => {
  const el = React.createElement(
    Card,
    { padding: "md" },
    React.createElement(Card.Header, null, React.createElement("h3", null, "Title")),
    React.createElement(Card.Body, null, React.createElement("p", null, "Body content")),
    React.createElement(Card.Footer, null, React.createElement("button", null, "OK"))
  );
  const html = renderToString(el);
  assert.ok(html.includes("Title"));
  assert.ok(html.includes("Body content"));
  assert.ok(html.includes("OK"));
});

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
```

- [ ] **Step 5: Add umbrella npm script**

Edit `package.json`. Add to `"scripts"`:
```json
"test:ui-primitives": "tsx --require ./src/components/ui/__tests__/asset-stubs.cjs src/components/ui/__tests__/Button.test.ts && tsx --require ./src/components/ui/__tests__/asset-stubs.cjs src/components/ui/__tests__/Badge.test.ts && tsx --require ./src/components/ui/__tests__/asset-stubs.cjs src/components/ui/__tests__/Card.test.ts",
```

- [ ] **Step 6: Run all 3 tests**

```bash
npm run test:ui-primitives 2>&1 | tail -20 && echo "===EXIT $?==="
```

Expected: All tests pass. Total ~75 tests (Button: 60 + 3 special, Badge: 18 + 1, Card: 4 + 1).

---

## Task 7: Write convention doc + manifest update

- [ ] **Step 1: Write `docs/shared-ui/ui-primitives.md`**

```markdown
# UI Primitives

Atomic-design layer (`src/components/ui/`). Each primitive is a focused, typed, reusable component.

## What's here

| Primitive | Variant axes | Use for |
|---|---|---|
| `Button` | variant × size × tone (+ loading, asChild) | Any button or button-styled link |
| `Badge` | tone × size | Status pills, labels, counters |
| `Card` (compound: Card.Header/Body/Footer) | padding | Content containers, panels |
| `Modal` | re-export of ModalContainer (zIndex prop) | Any modal — adopt this path going forward |

## Adoption

**No forced migrations.** New code uses these. Existing components migrate opportunistically (when touched for unrelated reasons or during Plan 5 debt cleanup).

Imports:
```tsx
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
```

## Design principles

- Each primitive accepts `className` and resolves with `cn()` so user classes win
- Variants encoded via `class-variance-authority` (typed, no string-template gymnastics)
- `Button` uses `@radix-ui/react-slot` for the `asChild` pattern (lets a `<Link>` or `<a>` adopt button styling)
- All tier colors flow from `brand-tier-{tradie,foreman,boss}` tokens added in Plan 1

## Smoke tests

Run `npm run test:ui-primitives` — 75+ combo tests across the 3 variant-bearing primitives.

## See also

- [tailwind-conventions.md](./tailwind-conventions.md) — tokens, no-arbitrary rule
- [component-decomposition-criteria.md](./component-decomposition-criteria.md) — when to split
- [frontend-architecture-principles.md](./frontend-architecture-principles.md) — atomic design tier system
```

- [ ] **Step 2: Manifest bump**

Edit `CLAUDE.md`. In the `shared-ui` domain, set `"lastVerified": "2026-05-08"`. Validate JSON.

- [ ] **Step 3: Final verification gate**

```bash
npm run lint 2>&1 | tail -5
npm run type-check 2>&1 | tail -3
npm run build 2>&1 | tail -8
npm run test:ui-primitives 2>&1 | tail -5
```
All exit 0 (lint may show pre-existing scripts/ errors).

---

## Plan 4 done

Codebase has 4 typed primitives in `src/components/ui/`. Zero forced migrations. Plan 6 (modal design uplift) can now compose against these.
