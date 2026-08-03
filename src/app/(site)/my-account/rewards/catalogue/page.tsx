// nonce-CSP route class — must render per-request (docs/security-csp/architecture.md).
// Segment config is ignored in "use client" files, so this server shim carries it,
// matching the sibling /my-account/rewards route.
export const dynamic = "force-dynamic";
export { default } from "./page-client";
