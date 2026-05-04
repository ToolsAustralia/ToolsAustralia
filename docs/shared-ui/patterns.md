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
