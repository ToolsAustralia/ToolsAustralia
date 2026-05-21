---
name: ""
overview: ""
todos: []
isProject: false
---

# Global light / dark theme rollout (revised)

## Current state (reference)

- **Tailwind**: `[tailwind.config.ts](tailwind.config.ts)` — `darkMode: "class"`.
- **State**: `[src/stores/useThemeStore.ts](src/stores/useThemeStore.ts)` — Zustand + `persist` (`name: "ta-theme"`), manual toggle sets `userManualOverride: true` (auto-theme already defers to manual override).
- **DOM sync**: `[src/contexts/ThemeContext.tsx](src/contexts/ThemeContext.tsx)` + root `[providers.tsx](src/app/providers.tsx)`.
- **Reference UX**: Dashboard `[DashboardHeader.tsx](src/app/(site)`/my-account/components/DashboardHeader.tsx); promotions `[ThemeToggle.tsx](src/components/ui/ThemeToggle.tsx)`; Ryobi local `dark` wrapper in `[PromotionsLayoutShell.tsx](src/components/promo/PromotionsLayoutShell.tsx)` — **unchanged**.
- **Bug**: Nested `ThemeProvider scoped` in `[my-account/layout.tsx](src/app/(site)`/my-account/layout.tsx) — cleanup removes `dark` from `<html>` on leave; remove nested provider.

---

## 1. Hydration / FOUC strategy (before React)

**Problem**: First paint has no `dark` on `<html>`; after hydrate, `ThemeContext` applies it → flash of light UI.

**Fix**: Inline **blocking** script in `[src/app/layout.tsx](src/app/layout.tsx)` in `<head>`, **before** React, so the first paint matches persisted intent.

**Critical implementation detail**: Persisted key is `ta-theme`, but the value is **Zustand persist JSON**, not the literal string `"dark"`. The script must parse stored state:

```js
(function () {
  try {
    var raw = localStorage.getItem("ta-theme");
    if (!raw) return;
    var parsed = JSON.parse(raw);
    var theme = parsed && parsed.state && parsed.state.theme;
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
})();
```

**Optional default when no `ta-theme`** (pairs with §6): if no key, read `window.matchMedia("(prefers-color-scheme: dark)").matches` and add `dark` when true — document product choice so it doesn’t fight AEST `useAutoTheme` on first load (recommend: inline script only sets class from **persisted** theme; system default can be applied after rehydrate in store `onRehydrateStorage` or initial state logic — see §6).

**Security**: If CSP blocks inline scripts in production, use a **nonce** on this script the same way other head scripts use `[getNonce](src/utils/security/getNonce.ts)`.

---

## 2. ThemeMetaSync — single ownership

**Role**: One client component owns `theme-color` and `color-scheme` on the live document.

**Location**: `[src/components/system/ThemeMetaSync.tsx](src/components/system/ThemeMetaSync.tsx)` (new).

**Behavior**:

- Subscribe to `useThemeStore((s) => s.theme)`.
- `useEffect`: update **one** `meta[name="theme-color"]` (consolidate `[layout.tsx](src/app/layout.tsx)` duplicate `theme-color` metas into a single tag this component updates, or `querySelector` + create if missing).
- Set `document.documentElement.style.colorScheme = theme` (`"light"` | `"dark"`).

Example shape (implementation can match exact content values to design tokens):

```tsx
"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/stores/useThemeStore";

export default function ThemeMetaSync() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", theme === "dark" ? "#0a0a0a" : "#ffffff");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return null;
}
```

**Mount**: Once inside root `[Providers](src/app/providers.tsx)` (inside `ThemeProvider` so order is consistent).

---

## 3. Pathname rules — single utility (no drift)

**File**: `[src/utils/themeToggleVisibility.ts](src/utils/themeToggleVisibility.ts)`

```ts
export function shouldShowFloatingThemeToggle(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname.startsWith("/admin")) return false;
  if (pathname.startsWith("/my-account")) return false;
  if (pathname.startsWith("/promotions")) return false;
  return true;
}
```

**Usage**:

- `SiteFloatingThemeToggle` (or equivalent host in `(site)` layout).
- Refactor `[PromotionsGuestThemeToggle](src/components/ui/ThemeToggle.tsx)` if helpful so “guest on promotions” stays special but **admin / my-account / promotions** exclusions all flow from one truth where applicable.

**Edge routes**: `/login`, `/reset-password`, etc. — `shouldShowFloatingThemeToggle` returns `true`; only mount the floating toggle on pages that **also** get `dark:` styling (or gate with a second helper later, e.g. `shouldShowFloatingThemeToggleOnAuthPages`).

---

## 4. Design system tokens (scale — first-class, not optional)

**Why**: Repeated `bg-gray-50 dark:bg-neutral-950` spreads “design in code” and slows redesigns.

**Where**: `[src/app/globals.css](src/app/globals.css)` — `:root` and `.dark` define semantic surfaces (align numeric hex with Tailwind grays/neutral already used on my-account for visual parity).

**Example direction** (names TBD in implementation; map to real palette):

```css
:root {
  --bg-page: #f9fafb;
  --bg-surface: #ffffff;
  --text-primary: #111827;
  --text-muted: #6b7280;
  --border-default: #e5e7eb;
}

.dark {
  --bg-page: #0a0a0a;
  --bg-surface: #171717;
  --text-primary: #f5f5f5;
  --text-muted: #a3a3a3;
  --border-default: #404040;
}
```

**Tailwind usage**: `bg-[var(--bg-page)]`, `text-[var(--text-primary)]`, or add `@layer utilities` shortcuts e.g. `.bg-page { background-color: var(--bg-page); }` for readability.

**Rollout**:

- **Phase 0 / early**: Define tokens + migrate **shell** (my-account layout classes can stay until touched; new public/admin chrome prefers tokens).
- **Ongoing**: Prefer tokens for new work; migrate hot paths incrementally.

---

## 5. Architecture (unchanged core)

- Single root `ThemeProvider`; remove nested provider from my-account.
- `HeaderThemeToggle` shared by dashboard + admin top bar.
- `SiteFloatingThemeToggle` using `ThemeToggleButton` + `shouldShowFloatingThemeToggle`.

---

## 6. Micro UX (premium feel)

**A. Theme transition** (subtle, avoid fighting instant paint): In `globals.css` `@layer base`:

```css
html {
  transition: background-color 0.2s ease, color 0.2s ease;
}
```

Scope/total duration tunable so it doesn’t feel sluggish on route change.

**B. System preference as default** (optional upgrade): If no persisted `ta-theme` yet, initialize theme from `prefers-color-scheme`. Implement in one place (e.g. store hydration / `onRehydrateStorage` or a tiny init that runs once) so it doesn’t conflict with AEST `useAutoTheme`: e.g. only use system default when `!persisted` and before first auto run, or document precedence: **saved > manual override > auto schedule > system**.

**C. Persist user intent** — **already present**: `toggleTheme` sets `userManualOverride: true`; `useAutoTheme` respects it. Plan: expose in settings if needed (“Follow schedule” vs “Use my choice”) and ensure any new `setTheme` paths set override when user-driven.

---

## 7. Admin phases (expanded)


| Sub-phase                    | Scope                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **C1 — Shell**               | `AdminPage` outer chrome, desktop/mobile sidebar, top bar, `admin-scrollbar`, main content background                          |
| **C2 — Tables + forms**      | Data tables (striping, borders, hover), pagination, filters, **inputs / selects / textareas / focus rings**, validation states |
| **C3 — Analytics / widgets** | Charts (axis, grid, tooltip colors), cards, badges, metrics toggles                                                            |


Charts may need library-specific theme props or CSS variables — call out during C3.

---

## 8. Public styling phases (unchanged idea, tokens-first)

- **Tier 1**: Header, cart/menus, newsletter, site layout wrappers.
- **Tier 2**: Home, shop, checkout, membership, high-traffic.
- **Tier 3**: Remaining `(site)` routes + modals.

---

## 9. Verification checklist

- No FOUC: hard refresh on `/` and `/shop` with persisted `dark`.
- `ThemeMetaSync`: mobile browser chrome color updates; single `theme-color` policy documented.
- `shouldShowFloatingThemeToggle` — no duplicate FAB on promotions/my-account/admin.
- My-account → home: `<html class="dark">` stable after removing scoped provider.
- Promotions/Ryobi baseline unchanged.

---

## Implementation todos

- **theme-fouc-script**: Nonce-safe inline script in `layout.tsx` head parsing `ta-theme` persist JSON
- **theme-meta-sync**: Add `ThemeMetaSync.tsx` + mount in `Providers`; dedupe `theme-color` in root layout
- **theme-toggle-visibility**: Add `themeToggleVisibility.ts`; wire floating toggle + refactor promotions if needed
- **theme-tokens**: Add `:root` / `.dark` CSS variables + utility shortcuts; use in new shell work
- **fix-scoped-provider**: Remove nested `ThemeProvider` from my-account
- **header-toggle-dry**: `HeaderThemeToggle` + dashboard + admin
- **site-floating-toggle**: Client host in `(site)/layout`, z-index vs `FloatingPromoBanner`
- **micro-ux**: `html` transition; optional system default policy documented + implemented
- **admin-c1-c2-c3**: Shell, then tables/forms, then analytics/widgets
- **public-tiers**: Chrome → pages → modals

