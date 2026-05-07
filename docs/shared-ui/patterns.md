# Shared UI — Patterns

## P1. Composition via children

Most primitives accept `children` and add behaviour. Don't try to prop-drill content — let consumers compose.

## P2. Tailwind via class merging

Components accept `className` and merge with internal classes via `clsx` / `cn`. Lets consumers override styling without forking.

## P3. ARIA defaults

Primitives include sensible ARIA defaults (e.g. `<Modal>` traps focus, sets `aria-modal`). Override via props for special cases.

## P4. Server-component-friendly

Most shared-ui components are server-component-friendly (no client-side state). Where state is needed, the component is `"use client"` at the file boundary.

## P5. Theme-aware

`dark:` variants present throughout. Don't write light-only components.

## P6. Re-export through `index.ts`

Clean imports: `import { Button, Modal } from "@/components"` instead of deep paths.

## P7. Business identity from config

Business identity strings (legal name, ABN, ACN, license, address) come from [src/config/business.ts](../../src/config/business.ts). Layout components like [Footer](../../src/components/layout/Footer.tsx) import `BUSINESS` rather than hardcoding values.

## P8. Header action stack

[`Header`](../../src/components/layout/Header.tsx) renders a fixed action stack on the right: **Theme | Cart | User**. The cart button toggles `isCartOpen` from `SidebarContext` and shows a count badge sourced from `useCart().summary.totalItems` (capped to `9+` for ≥10). The cart icon flipped on with the shop launch (was hidden behind the theme toggle previously).

### ModalContainer `testId` prop (E2E)

`ModalContainer` accepts an optional `testId` prop that becomes the wrapper's `data-testid` (default `"modal-container"`). E2E specs targeting a specific modal pass the modal-specific id (e.g., `<ModalContainer testId={testid.userSetupModal}>`). Source of truth for testid strings: [`e2e/utils/selectors.ts`](../../e2e/utils/selectors.ts).

### PaymentMethodsTab E2E test IDs

[`src/components/modals/PaymentMethodsTab.tsx`](../../src/components/modals/PaymentMethodsTab.tsx) is rendered inside the My Account Settings → Payment tab. It carries:
- `account-add-payment-method-button` on both the empty-state and bottom add buttons.
- `account-saved-card-item` on each saved card row.
- `account-saved-card-set-default` on each row's "Set Default" button.
- `account-saved-card-delete` on each row's trash button.

Consumed by `e2e/account/payment-methods.spec.ts`. The `Button` component in `modals/ui/Button.tsx` forwards `data-testid` to the underlying `<button>`.
