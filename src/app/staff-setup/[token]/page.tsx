// nonce-CSP route class — must render per-request (docs/security-csp/architecture.md).
// Segment config is ignored in "use client" files, so this server shim carries it.
export const dynamic = "force-dynamic";
export { default } from "./page-client";
