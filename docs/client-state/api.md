# Client State — API

_N/A — no API surface._

## `useOrderQueries` — order rows carry an optional image (2026-08-27)

The order-list row type gained `image?: string`, mirroring `OrderListItem` in
`src/services/shop/orderQueries.ts`. It is the first catalogue image of the referenced
product, joined at query time rather than snapshotted onto the order line.

**Optional at every step, deliberately.** A product deleted since the order was placed
leaves the line intact but unresolvable, so consumers must render a fallback rather than
assume a URL. The hook type says `?` for that reason, not as a convenience.
