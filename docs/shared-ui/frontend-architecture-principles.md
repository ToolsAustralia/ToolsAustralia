# Frontend Architecture Principles

This is the strategic guide for how frontend components are organized, named, composed, and evolved. Companion to:
- [tailwind-conventions.md](./tailwind-conventions.md) — *how* to style
- [component-decomposition-criteria.md](./component-decomposition-criteria.md) — *when* to split

Read this when:
- Adding a new component or page
- Reviewing a PR that touches `src/components/` or `src/features/`
- Deciding where a piece of UI should live
- Onboarding to the codebase

This doc is **prescriptive** for new work and **aspirational** for existing code. The codebase doesn't follow every rule today — that's known. Future Plans (4, 5, 6+) progressively close the gap.

---

## Table of contents

1. [Component classification (Atomic Design adapted)](#1-component-classification-atomic-design-adapted)
2. [Single Responsibility Principle for components](#2-single-responsibility-principle-for-components)
3. [Smart vs. Dumb (orchestrator vs. presentational)](#3-smart-vs-dumb-orchestrator-vs-presentational)
4. [Composition patterns](#4-composition-patterns)
5. [Props discipline](#5-props-discipline)
6. [Custom hooks vs. sub-components](#6-custom-hooks-vs-sub-components)
7. [Folder convention](#7-folder-convention)
8. [Accessibility-driven decomposition](#8-accessibility-driven-decomposition)
9. [Re-render boundaries and performance](#9-re-render-boundaries-and-performance)
10. [Testing strategy](#10-testing-strategy)
11. [Component API stability and breaking changes](#11-component-api-stability-and-breaking-changes)
12. [Anti-patterns](#12-anti-patterns)
13. [References](#13-references)

---

## 1. Component classification (Atomic Design adapted)

We adopt a hybrid of Brad Frost's Atomic Design with concessions to React/Next.js + the existing codebase shape.

| Tier | What it is | Lives in | Examples |
|---|---|---|---|
| **Atom** | A primitive: button, input, badge, icon wrapper. No domain knowledge. Composable via `children` and props. Always reusable. | `src/components/ui/` | `<Button>`, `<Badge>`, `<Input>`, `<Card>`, `<Modal>` |
| **Molecule** | A small assembly of atoms with a single concern. Still reusable across domains. | `src/components/ui/` (small ones) or `src/components/<category>/` | `<SearchBar>` (input + button), `<DateRangePicker>`, a `<TierBadge>` |
| **Organism** | A larger composition tied to a feature/domain. Often stateful. Less reusable across the codebase but reusable within its domain. | `src/components/<domain>/` (e.g. `modals/`, `cards/`, `sections/`) | `<CancellationUpsellModal>`, `<MajorDrawHero>`, `<SubscriptionManagementModal>` |
| **Template / Page-shell** | A layout that arranges organisms with placeholders for page content. | `src/app/.../layout.tsx` | `(site)/layout.tsx`, `admin/layout.tsx` |
| **Page** | The route entry. Composes organisms into a complete view. Owns route-level state, server-fetched data. | `src/app/.../page.tsx` | `app/(site)/major-draw/page.tsx` |
| **Feature** | A self-contained slice of business logic crossing layers (state + UI + API + types). Used when a feature is large enough to deserve its own folder. | `src/features/<feature>/` | `src/features/admin/users/` |

**The rule of thumb:** *the higher the tier, the less reusable.* Atoms are reusable everywhere; pages are unique. As you climb the tiers you're allowed more domain-specific knowledge.

**Where it lives = how it can be used.** A component in `src/components/ui/` cannot import from `src/features/` (atoms can't depend on features). A component in `src/features/admin/users/` can import from `src/components/ui/` and `src/components/cards/` (features compose lower tiers).

### What our codebase has today

- `src/components/ui/` — currently contains a mix: badges (atomic), `MetallicButton` (atomic), `RichTextEditor` (organism — too big to be an atom). Some cleanup needed in Plan 4 to enforce the tier boundary.
- `src/components/modals/ui/` — modal-specific atoms (`Button`, `Input`, `ModalContainer`, etc.). Should probably merge into `src/components/ui/` long-term.
- `src/components/cards/`, `cta/`, `layout/`, `loading/`, `modals/`, `sections/` — domain organisms. Reasonable today.
- `src/features/admin/users/` — feature folder pattern. Good — replicate this for other large feature surfaces.

---

## 2. Single Responsibility Principle for components

**A component should be describable in one sentence.** If you can't, it's doing too much.

| Component | One-sentence description | SRP-clean? |
|---|---|---|
| `<Button>` | Renders a clickable button with variants and sizes. | ✅ |
| `<CancellationUpsellModal>` (post-Plan-2) | Orchestrates the cancel-flow upsell prompt: shows what the user loses, offers stay/resolve, optionally suggests a downgrade. | ✅ |
| `<SubscriptionManagementModal>` | Manages the user's subscription: shows plan, payment method, cancel/upgrade/downgrade flows, past payments, and embeds 3 child modals. | ⚠️ Multiple concerns — Plan 5 candidate. |
| `<UserDetailModal>` (admin) | Edits user data, displays subscription details, runs admin actions, manages payment methods, audits events, and sends Klaviyo. | ❌ "and" appears 4 times → decompose. |

**Test:** if the description requires "and" more than once, the component has more than one responsibility.

A corollary: **the file's import block should not span two pages.** If you're importing 30 things, you're coupling to too many systems.

---

## 3. Smart vs. Dumb (orchestrator vs. presentational)

Modern React with hooks blurs the old "container vs. presentational" split, but the principle still holds. Inside a decomposed folder:

- **Orchestrator** (`index.tsx`) — owns hooks, effects, API calls, callbacks, derived state. Knows about the world. Composes sub-components.
- **Sub-component** (`Hero.tsx`, `LoseGrid.tsx`, etc.) — pure-ish: takes flat props, renders JSX. Doesn't fetch, doesn't subscribe, doesn't mutate. May own trivial UI state (e.g. local hover, focus).

The boundary keeps the orchestrator focused on coordination and the sub-components focused on presentation. Sub-components are easier to test and reason about in isolation.

**Example (post-Plan-2):**
```
CancellationUpsellModal/
  index.tsx              ← useSession, useQueryClient, useLoading, useToast,
                            handleRedeem (async fetch + cache update + toast),
                            handleDecline, handleSwitchPlan, useEffect (scroll lock),
                            useEffect (entry animation), useEffect (query invalidation)
  Hero.tsx               ← takes (entriesCopy, accumulatedEntries) — renders JSX. No hooks.
  ActionRow.tsx          ← takes (isPastDue, isProcessing, onDecline, onRedeem, onResolve)
                            — renders 2 buttons. No hooks.
  …
```

**Counter-rule:** if a sub-component needs 8+ props from the orchestrator, you've drawn the boundary wrong. Either:
- Combine sub-components, OR
- Move some state ownership down into the sub-component (it's no longer purely presentational, but that's fine if scope is small)

---

## 4. Composition patterns

When a component's flexibility grows, prefer composition over configuration.

### `children` for slot content
```tsx
// ❌ Configuration: too many opt-in props
<Card title="Hello" subtitle="World" footer="OK" actions={[...]} />

// ✅ Composition: caller provides shape
<Card>
  <Card.Header>
    <h3>Hello</h3>
    <p>World</p>
  </Card.Header>
  <Card.Body>...</Card.Body>
  <Card.Footer><Button>OK</Button></Card.Footer>
</Card>
```

### Compound components
Group related sub-components under a namespace:
```tsx
// Card.tsx
function Card({ children, className }: { children: React.ReactNode; className?: string }) { ... }
function CardHeader({ children }: { children: React.ReactNode }) { ... }
function CardBody({ children }: { children: React.ReactNode }) { ... }
function CardFooter({ children }: { children: React.ReactNode }) { ... }

Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

export default Card;
```

Used widely by Radix UI, Reach UI, and the shadcn pattern.

### Render props (sparingly)
```tsx
<Tooltip render={({ open, close }) => <button onClick={open}>...</button>}>
  <p>Tooltip content</p>
</Tooltip>
```
Useful when the parent must orchestrate child state. Avoid when a custom hook would do.

### Slot pattern (Radix-style)
For when a child should "become" the parent's clickable area:
```tsx
<Button asChild>
  <Link href="/foo">Click me</Link>
</Button>
// Renders <a href="/foo" {...buttonProps}>Click me</a>
```
Implemented via `@radix-ui/react-slot`. Useful for headless behaviour over arbitrary markup.

---

## 5. Props discipline

### Narrow interfaces
Every prop should have a clear purpose. If a prop is "for future use" or "in case", it's noise. Delete.

### Discriminated unions for variants
Make invalid states unrepresentable:
```tsx
// ❌ Loose — caller can pass progress without isLoading
type ButtonProps = {
  isLoading?: boolean;
  progress?: number;
  children: React.ReactNode;
};

// ✅ Discriminated — progress only exists when loading
type ButtonProps = ({ state: 'idle' } | { state: 'loading'; progress: number })
  & { children: React.ReactNode };
```

### No boolean traps
```tsx
// ❌ Caller has to remember which boolean means what
<Modal isOpen={true} isCloseable={false} hasOverlay={true} isFullscreen={false} />

// ✅ Single discriminator + sensible defaults
<Modal mode="modal-fullscreen" />  // OR
<Modal>{...}</Modal>               // sensible defaults; opt-out via prop
```
Boolean prop count >2 is a smell. Refactor to enum/literal union.

### Props count threshold
**>7 props on a single component = configuration soup smell.** Either:
- Compose via children/slots
- Group related props into one sub-object (`{ avatar: { src, alt, size } }`)
- Split the component (it's doing too much)

### Don't pass styling — pass intent
```tsx
// ❌ Caller specifies styles
<Badge color="red" backgroundColor="rgba(238,0,0,0.1)" borderColor="red" textWeight="bold" />

// ✅ Caller specifies intent; component owns the look
<Badge tone="danger" />
```

### `className` for escape hatches only
Public components should accept `className` for outer-element overrides, but the component owns its internal styling.
```tsx
function Card({ className, children }: CardProps) {
  return <div className={cn("bg-white rounded-lg p-4 shadow", className)}>{children}</div>;
}
```
`tailwind-merge` (via our `cn()` helper) ensures user overrides win.

---

## 6. Custom hooks vs. sub-components

When a component grows, you have two extraction tools:
- **Custom hook** — extracts *logic* (state, effects, derived values).
- **Sub-component** — extracts *markup + its tightly-bound logic*.

| Situation | Use |
|---|---|
| State logic is reused across components | Custom hook |
| State logic is complex but specific to one component | Custom hook (still — declutters the component file) |
| Markup is reused | Sub-component |
| Markup is unique but a clearly distinct visual section | Sub-component |
| Both: complex state + unique markup, but the markup is small | Custom hook + inline JSX |
| Both: complex state + unique markup, both substantial | Sub-component that owns its own state |

**Example:** the cancellation modal's `featuredPrize` random-selection logic is complex enough to consider extracting to `useFeaturedPrize()` — but it's only used in one component and trivial enough (~8 lines), so leaving it inline is fine. If three modals needed this random-prize logic, extract.

**Anti-pattern:** extracting logic into a hook just to hide line count. If the hook is called from one place, lives in the same file's directory, and has no abstraction value, it's just file-shuffling.

---

## 7. Folder convention

Where a component lives encodes who can use it and how broadly.

```
src/
  components/
    ui/                     ← atoms + small molecules. Importable from anywhere.
                              No domain knowledge. No data fetching.
                              Examples: Button, Badge, Card, Modal, Input
    cards/                  ← domain organisms (cards specifically).
                              May know about prizes, products, packages.
    cta/                    ← CTA-shaped organisms.
    layout/                 ← page-shell organisms (header, footer, sidebar).
    loading/                ← loading-state organisms (spinners, success screens, skeletons).
    modals/                 ← modal organisms (one per business flow).
      ui/                   ← modal-internal atoms (ModalContainer, ModalHeader, etc.).
                              Long-term: merge into components/ui/.
    sections/               ← landing-page sections.
    seo/                    ← SEO components.
    system/                 ← root system components (theme, providers).
    features/<feature>/     ← see below
    auth/                   ← auth-flow organisms.
    admin/                  ← admin-only organisms.
    payment/                ← payment-flow organisms.
    error/                  ← error-state organisms.

  features/
    admin/users/            ← a feature slice: UI + state + queries + types together.
      components/           ← organisms specific to this feature.
      hooks/                ← feature-specific hooks.
      server/               ← server-side data access.
      types/                ← feature-specific types.

  app/
    (site)/                 ← public site routes.
    admin/                  ← admin routes.
    api/                    ← route handlers (thin — delegate to services).
```

### Rules

- **Atoms (`src/components/ui/`) cannot import from features or domain folders.** They're foundation; foundation depends on nothing above it.
- **Domain organisms (`src/components/<domain>/`) can import from atoms.** They CAN import from each other if domains genuinely cross.
- **Features (`src/features/<X>/`) can import from atoms and domain organisms.** They cannot import from `src/app/` (routes).
- **Pages (`src/app/.../page.tsx`) can import from anywhere below.** They're the leaf.

### When to add a new folder

Add a new domain folder under `src/components/` when you have **3+ organisms** that share a domain concept and don't fit any existing folder. Don't pre-create empty folders — wait for the third sibling.

Add a new feature folder under `src/features/` when you have a self-contained slice that crosses layers (UI + state + queries + types) AND has 5+ files. Smaller features can live in `src/components/<domain>/` until they grow.

---

## 8. Accessibility-driven decomposition

A11y is a real driver for splits, especially around:

- **Focus management** — modals, popovers, menus need focus traps, return-focus, etc. Often forces extracting a `useFocusTrap()` hook + a wrapper component.
- **ARIA roles and relationships** — combobox, listbox, tabs, accordion all have specific role chains. Components like `<Tabs.Root>`, `<Tabs.List>`, `<Tabs.Trigger>`, `<Tabs.Content>` exist precisely because the ARIA spec requires them.
- **Keyboard navigation** — arrow keys, Home/End, Escape. Each interaction pattern often deserves a hook (`useArrowNavigation()`, `useEscapeKey()`).
- **Live regions** — `aria-live="polite"` for toasts, alerts. Often a portal + dedicated component.

**Rule:** if your component owns focus management, keyboard handling, AND visual rendering — it's three responsibilities. Extract.

**Recommended primitives to adopt for accessible behaviour:**
- [Radix UI](https://www.radix-ui.com/) — unstyled, accessible primitives. Pairs perfectly with Tailwind + CVA.
- [Headless UI](https://headlessui.com/) — Tailwind Labs' equivalent.
- The native `<dialog>` element where possible (modern browsers support it well).

For our codebase: Plan 4 (UI primitives) should evaluate adopting Radix for `Modal`, `Tooltip`, `Popover`, `Menu`, `Tabs`. We currently roll our own (`ModalContainer`) — works, but a11y could be tighter.

---

## 9. Re-render boundaries and performance

Decomposition isn't just for readability — it sets re-render scope.

A 1000-line component re-renders entirely when any state in it changes. After decomposition, only the sub-component receiving changed props re-renders.

```tsx
function Parent() {
  const [count, setCount] = useState(0);
  return (
    <>
      <ExpensiveSubtree />        {/* doesn't re-render if it doesn't depend on count */}
      <span>{count}</span>
    </>
  );
}
```

**With `React.memo`** on `ExpensiveSubtree`, this is automatic. Without memo, React still re-runs the component but reconciliation is cheap if nothing changes.

### When to reach for `React.memo`
- Sub-component renders are expensive (large lists, charts, complex children).
- Sub-component receives stable props (no inline objects/functions from parent).
- Profiling shows the sub-component as a hotspot.

**Don't pre-memo everything.** Memo has a cost (the equality check on every render). Default is no memo; add when profiling justifies.

### Stable references
For memo to work, the parent must pass stable references. Use `useCallback` for callbacks and `useMemo` for derived objects passed as props:
```tsx
const handleClick = useCallback(() => doSomething(id), [id]);
const config = useMemo(() => ({ a, b, c }), [a, b, c]);
return <ExpensiveChild onClick={handleClick} config={config} />;
```

### Lists and `key`
Always use stable, unique `key` props on list items. Index keys are an anti-pattern unless the list is truly static.

### React Query / TanStack Query for data
Data lives in queries, not local state. The query cache is shared across components — no prop drilling, no waterfall fetches. Components subscribe to the queries they need.

---

## 10. Testing strategy

Three layers, increasing in cost and value:

### Layer 1: Smoke tests (low cost, high value)
A `tsx` test that imports the component and renders all meaningful prop combos via `react-dom/server`. Catches: import errors, undefined access, broken JSX, missing context providers.

Pattern: `src/<path>/__tests__/<Component>.test.ts`. See [Plan 2 Task 12](../superpowers/plans/2026-05-08-ui-cleanup-plan-2-cancellation-modal-pilot.md#task-12-add-smoke-regression-test) for the template.

**Every public component should have one.**

### Layer 2: Integration tests (medium cost)
Test the component in the actual rendering tree with real(-ish) providers. Use Testing Library. Click buttons, assert state changes.

Currently we have **no React Testing Library setup**. Plan 4 should add it for `<Button>`, `<Modal>`, `<Form>` primitives. Don't try to integration-test every organism — focus on atoms and critical organisms.

### Layer 3: Visual regression (high cost, high value)
Storybook + Chromatic (or Percy, or Playwright snapshots). Renders every component in every state at every breakpoint, catches silent visual drift.

**We don't have this yet.** Plan 4 should evaluate. If we adopt:
- Storybook stories for every public atom and reusable organism (~50 stories at first).
- Chromatic CI integration on PRs touching components.
- Visual diffs reviewed before merge.

Without VRT, **manual A/B in `/dev/modals` is the fallback** — see Plan 2 Task 11. It works but doesn't scale.

### Layer 4: E2E (highest cost, narrow value)
Playwright tests for full user flows (signup → purchase → cancel). Reserve for critical paths only — payment, signup, the most-trafficked CRUD.

Currently we have **no E2E suite**. Out of scope for this cleanup; consider for a future quality initiative.

---

## 11. Component API stability and breaking changes

Public components in `src/components/ui/` and shared organisms have implicit consumers across the codebase. Their props interface is a contract.

### Stable practices
- **Add props as optional** with sensible defaults. No breaking change.
- **Rename a prop?** Add the new name as an alias, deprecate the old name with a code comment + JSDoc tag. Remove the old name in a follow-up after consumers migrate. Use `@deprecated` JSDoc.
- **Change a prop's type narrowing?** (e.g. `tone?: string` → `tone?: 'primary' | 'ghost'`) — this IS breaking. Plan a migration. Search consumers, update them, then narrow.
- **Removing a prop?** Search consumers first. If used: deprecate, migrate consumers, remove.
- **Changing default behavior?** Almost always breaking. Make the new behavior opt-in via a new prop, then flip the default in a major version.

### When breaking is OK
- The component is private (only used in one place).
- You've audited consumers and know they all want the new behavior.
- The break is in a follow-up commit immediately after the fix.

### Versioning
We don't version components individually — the codebase is a monorepo. Compatibility is enforced by changing all consumers in the same PR. The implicit version is "the current main branch."

If a component is published externally (npm), it gets semver. None of our components are today.

---

## 12. Anti-patterns

These are smells to call out in PR review.

| Anti-pattern | Why it's bad | Better |
|---|---|---|
| `<Modal isOpen={x} hasOverlay isCloseable={!y}>` (boolean trap) | Caller has to remember which combination means what | Single discriminator: `<Modal variant="dialog" />` |
| 12-prop component | Configuration soup | Compose via children, group related props |
| `style={{ color: '#ee0000' }}` everywhere | Bypasses design system | Use Tailwind tokens or CVA variants |
| `<div className="cm-*">` (file-local globals) | Hidden coupling, scoping fragile | Tailwind utilities + data-* attrs |
| Re-implementing icons inline | Drift, no consistency | `lucide-react` |
| HOC over a hook | Hooks are simpler and more typeable | Convert to hook |
| Prop drilling through 4+ layers | Coupling, refactoring pain | Context, query cache, or co-locate the consumer |
| One component fetching, transforming, AND rendering | Mixed concerns | Hook for fetch+transform, dumb component for render |
| Magic numbers in className arbitraries | Tokens missing | Add token to tailwind.config |
| `useEffect` for derived state | Use `useMemo` or compute inline | `useEffect` only for actual side effects |
| `useState` for data that lives in URL | Lost on refresh | Search params or route state |
| Mutating React state directly | Subtle bugs | Always create new objects |
| `key={index}` on a dynamic list | Reconciliation breaks | Stable unique key |
| Component file with `default export` of a function AND named exports of helpers | Tangled module surface | Helpers go in their own file or have clear naming |
| `// TODO: refactor this` left for years | Technical debt rot | Either fix now or file as backlog with date + owner |
| `<style jsx>` (with the codebase's adopted Tailwind) | Two ways to style | Tailwind utilities + module CSS for the rare hard cases |
| `!important` overrides | Specificity wars | `tailwind-merge` resolves conflicts; fix root cause |

---

## 13. References

Canonical sources to read for deeper context:

- **[Atomic Design](https://atomicdesign.bradfrost.com/)** — Brad Frost. The taxonomy of atoms/molecules/organisms.
- **[shadcn/ui](https://ui.shadcn.com/)** — The pattern we're moving toward: copy-paste primitives owned by you, CVA + tailwind-merge + Radix UI.
- **[Bulletproof React](https://github.com/alan2207/bulletproof-react)** — Community-curated reference architecture. Many opinions; pick what fits.
- **[Radix UI](https://www.radix-ui.com/primitives)** — Unstyled, accessible primitives. Best-in-class a11y.
- **[Tailwind CSS docs](https://tailwindcss.com/docs)** — The styling layer.
- **[class-variance-authority](https://cva.style/)** — How to encode typed variants.
- **[Feature-Sliced Design](https://feature-sliced.design/)** — A more opinionated folder convention than Atomic Design. Worth reading even if we don't fully adopt.
- **[Total TypeScript: discriminated unions](https://www.totaltypescript.com/discriminated-unions-are-a-devs-best-friend)** — Type-safe variants.
- **[React docs: Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)** — When to extract logic.
- **[React docs: render performance](https://react.dev/reference/react/memo)** — `memo`, `useMemo`, `useCallback`.

Internal sibling docs:
- [tailwind-conventions.md](./tailwind-conventions.md) — styling rules
- [component-decomposition-criteria.md](./component-decomposition-criteria.md) — when to split

---

## How this doc evolves

When you encounter a recurring decision in PR review that this doc doesn't cover, update it. When a rule turns out to be wrong in practice, change it. Don't let the doc rot — outdated guidance is worse than no guidance.

Annotate every change with a date + reason in git history. Don't silently rewrite principles.
