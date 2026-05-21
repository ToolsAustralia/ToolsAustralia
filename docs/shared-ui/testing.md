# Shared UI — Testing

The repo uses standalone `tsx` scripts (no jest/vitest). For UI components the
approach is server-side smoke rendering via `react-dom/server`'s
`renderToString`, which catches import errors, undefined access, and broken JSX
without needing a browser.

## CancellationUpsellModal smoke test

```bash
npm run test:cancellation-upsell
```

Runs 12 meaningful prop combinations through `renderToString` — covering all
tier/downgrade variants, past-due states, zero-entry states, and optional-prop
edge cases. Tests live at:

```
src/components/modals/CancellationUpsellModal/__tests__/CancellationUpsellModal.test.ts
```

A companion preload script (`asset-stubs.cjs` in the same directory) registers
`require.extensions` stubs for `.webp` and `.css` files so tsx/Node.js can
resolve the binary and CSS module imports that Next.js would normally handle via
its bundler.

**Key detail for the CSS stub:** esbuild compiles `import styles from "x.css"`
into `__toESM(require("x.css"))`. The `__toESM` helper checks `mod.__esModule`;
if truthy it tries to copy own enumerable keys from the module (which are `[]`
on a Proxy over `{}`), producing an empty object. The stub therefore must return
`false` for `__esModule` so `__toESM` wraps the proxy as
`{ default: cssProxy }`, making `import_hero.default.scrollFrame` work.

## RenewalFailedModal smoke test

```bash
npm run test:renewal-failed
```

Runs 2 prop combinations through `renderToString` — open (initial state) and
closed. Because `RenewalFailedModal` only exposes 2 public props (`isOpen`,
`onClose`) and all rendering branches are driven by internal state, the smoke
test covers the full reachable surface from outside the component.

The component requires `UserProvider` in addition to the baseline four providers,
because it calls `useUserContext` internally. Provider nesting order is:
`SessionProvider > QueryClientProvider > UserProvider > LoadingProvider > ToastProvider > modal`.

`UserProvider` must sit inside `QueryClientProvider` because it uses TanStack
Query hooks internally.

Tests live at:

```
src/components/modals/RenewalFailedModal/__tests__/RenewalFailedModal.test.ts
```

The asset-stubs preload script (`asset-stubs.cjs` in the same directory) is a
copy of the CancellationUpsellModal one, stubbing `.webp`, `.png`, `.jpg`,
`.jpeg`, `.gif`, `.svg`, and `.css` module imports.

## Manual smoke

- Render `/dev/modals` in dev to visually verify CancellationUpsellModal and RenewalFailedModal
- Toggle theme — verify all components render correctly in both modes
- Tab through a page with focus rings — verify accessibility
