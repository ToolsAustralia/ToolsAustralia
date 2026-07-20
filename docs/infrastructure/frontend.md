# Infrastructure — Frontend

Mostly server-side. Image serving and upload have client-facing components but those live in their consuming domains:
- Upload UIs in [upsell](../upsell/) (`components/upload/`)
- Image serving consumed throughout via the image utilities in [shared-ui](../shared-ui/)

## 2026-07-20 — sweep:font-poppins npm scripts

`package.json` gained `sweep:font-poppins` (`--apply`) and `sweep:font-poppins:dry` — the
Poppins-class codemod (see docs/dev-tooling/frontend.md and docs/shared-ui/tailwind-conventions.md §10).
