import type { NextConfig } from "next";

const DEFAULT_IMAGE_HOSTS = ["toolsaustralia.com.au", "assets.toolsaustralia.com.au", "res.cloudinary.com"];
const configuredImageHosts = (process.env.NEXT_PUBLIC_IMAGE_HOSTS || "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);
const allowedImageHosts = Array.from(new Set([...DEFAULT_IMAGE_HOSTS, ...configuredImageHosts]));

const imageDomains = allowedImageHosts.filter((host) => !host.includes("*") && host.length > 0);
const imageRemotePatterns = allowedImageHosts.map((hostname) => ({
  protocol: "https" as const,
  hostname,
}));

const CONTENT_SECURITY_POLICY = `
default-src 'self';
base-uri 'self';
block-all-mixed-content;
connect-src 'self' https:;
font-src 'self' https: data:;
form-action 'self';
frame-ancestors 'none';
frame-src 'self' https://js.stripe.com https://connect.facebook.net https://www.facebook.com;
img-src 'self' https: data: blob:;
manifest-src 'self';
media-src 'self' https:;
object-src 'none';
script-src 'self' 'unsafe-inline' 'unsafe-eval' https:;
style-src 'self' 'unsafe-inline' https:;
upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

const securityHeaders = [
  // Enforce HTTPS for all subdomains
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Disable embedding to mitigate clickjacking
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  // Prevent MIME sniffing attacks
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  // Provide modern referrer policy
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  // Opt-in to the most restrictive same-origin isolation
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Embedder-Policy",
    value: "require-corp",
  },
  // Limit advanced browser features unless explicitly required
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  // Baseline CSP - adjust allow-lists as new third parties are integrated
  {
    key: "Content-Security-Policy",
    value: CONTENT_SECURITY_POLICY,
  },
];

const nextConfig: NextConfig = {
  // External packages for server components
  serverExternalPackages: ["mongoose"],

  // Handle environment variables properly
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // Image optimization
  images: {
    domains: ["localhost", ...imageDomains],
    remotePatterns: imageRemotePatterns,
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
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  // SEO-friendly redirects
  async redirects() {
    return [
      // Example: temporarily hidden winners page should 301 to home
      { source: "/winners", destination: "/", permanent: true },
    ];
  },

  // Optional: enforce no trailing slash (Next defaults are fine, keep explicit for clarity)
  trailingSlash: false,
};

export default nextConfig;
