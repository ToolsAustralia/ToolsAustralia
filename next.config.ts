import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // External packages for server components
  serverExternalPackages: ["mongoose"],

  // Handle environment variables properly
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // Image optimization
  images: {
    domains: ["localhost"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
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
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "origin-when-cross-origin" },
        ],
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
