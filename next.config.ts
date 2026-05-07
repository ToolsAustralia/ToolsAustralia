import type { NextConfig } from "next";
import { buildSecurityHeaders, buildSecurityHeadersForWebhook } from "./src/utils/security/csp";

const DEFAULT_IMAGE_HOSTS = ["toolsaustralia.com.au", "assets.toolsaustralia.com.au", "res.cloudinary.com", "placehold.co"];
const configuredImageHosts = (process.env.NEXT_PUBLIC_IMAGE_HOSTS || "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);
const allowedImageHosts = Array.from(new Set([...DEFAULT_IMAGE_HOSTS, ...configuredImageHosts]));

const imageRemotePatterns = allowedImageHosts.map((hostname) => ({
  protocol: "https" as const,
  hostname,
}));

// Fallback CSP without nonce (used as static fallback in next.config.ts)
// In production, middleware sets CSP dynamically with nonce per request
// Note: CONTENT_SECURITY_POLICY is built dynamically in buildSecurityHeaders() below

// Static security headers (fallback for routes not handled by middleware)
// In production, middleware sets these dynamically with per-request nonces
// This static version is kept as a fallback and for development reference
const securityHeaders =
  process.env.NODE_ENV === "production"
    ? buildSecurityHeaders() // Uses shared utility, but without nonce (middleware handles nonce)
    : [];

// Webhook-safe headers (excludes Cross-Origin-Embedder-Policy to allow external POST requests)
// Webhooks are server-to-server requests that use signature verification for security
// Applied in all environments to ensure webhooks work in development, staging, and production
const webhookHeaders = buildSecurityHeadersForWebhook(); // Excludes COEP to allow Stripe webhook POSTs

const nextConfig: NextConfig = {
  // External packages for server components
  serverExternalPackages: ["mongoose"],

  // Handle environment variables properly
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // Image optimization (AVIF first, then WebP fallback; sharp recommended for runtime optimization)
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2_592_000, // 30 days — defaults are 60s which churns Image Optimization Cache
    deviceSizes: [640, 750, 828, 1080, 1280, 1920, 2048], // dropped 1200, 3840 from defaults
    imageSizes: [16, 32, 64, 128, 256, 384], // dropped 48, 96 from defaults
    remotePatterns: [
      { protocol: "http" as const, hostname: "localhost" }, // dev
      ...imageRemotePatterns,
    ],
  },

  // Tree-shake heavy barrel-imported libraries; restore client-side router cache windows
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "date-fns-tz"],
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },

  // Compiler options to remove console logs in production
  // This strips console.log, console.info, console.debug, and console.warn at build time
  // console.error is preserved for critical error reporting
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? {
            exclude: ["error"], // Keep console.error for critical errors
          }
        : false,
  },

  // Headers for security
  async headers() {
    // Always apply webhook-safe headers to webhook routes (all environments)
    // This ensures Stripe webhooks work in development, staging, and production
    const headerConfigs = [
      {
        // Apply webhook-safe headers (without COEP) to Stripe webhook endpoint
        // This allows external POST requests from Stripe while maintaining other security headers
        // Using exact match pattern for webhook route to ensure it's matched first
        source: "/api/stripe/webhook",
        headers: webhookHeaders,
      },
    ];

    // In production, also apply full security headers to all other routes
    if (securityHeaders.length > 0) {
      headerConfigs.push({
        // Apply full security headers to all routes except webhook routes
        // The negative lookahead pattern excludes /api/stripe/webhook from this rule
        // This pattern matches all routes that don't start with /api/stripe/webhook
        source: "/((?!api/stripe/webhook).*)",
        headers: securityHeaders,
      });
    }

    return headerConfigs;
  },

  // SEO-friendly redirects
  async redirects() {
    return [];
  },

  // Optional: enforce no trailing slash (Next defaults are fine, keep explicit for clarity)
  trailingSlash: false,
};

export default nextConfig;
