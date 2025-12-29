/**
 * Page Metadata Helper Utilities
 *
 * Provides utility functions for extracting page metadata from route information.
 * Maps pathname patterns to page types and extracts page names for tracking.
 *
 * @author Senior Full-Stack Developer
 * @version 1.0.0
 */

import type { PageMetadata } from "@/types/tracking";

/**
 * Maps pathname patterns to page types
 * Used to determine the type of page for tracking purposes
 */
const PAGE_TYPE_MAP: Record<string, string> = {
  "/": "home",
  "/shop": "shop",
  "/mini-draws": "mini-draws",
  "/checkout": "checkout",
  "/membership": "membership",
  "/my-account": "my-account",
  "/rewards": "rewards",
  "/login": "login",
  "/register": "register",
  "/faq": "faq",
  "/contact": "contact",
  "/terms": "terms",
  "/privacy": "privacy",
  "/winners": "winners",
  "/draw-results": "draw-results",
};

/**
 * Extracts page metadata from pathname and URL
 *
 * @param pathname - The current pathname (e.g., "/shop/dewalt-drill")
 * @param url - Optional full URL (defaults to window.location.href if available)
 * @returns PageMetadata object with page_type, page_name, and page_url
 *
 * @example
 * const metadata = extractPageMetadata("/shop/dewalt-drill", "https://example.com/shop/dewalt-drill");
 * // Returns: { page_type: "product", page_name: "dewalt-drill", page_url: "https://example.com/shop/dewalt-drill" }
 */
export function extractPageMetadata(pathname: string, url?: string): PageMetadata {
  try {
    // Get page URL - prefer provided URL, fallback to window.location if available
    let pageUrl = url;
    if (!pageUrl && typeof window !== "undefined") {
      pageUrl = window.location.href;
    }
    if (!pageUrl) {
      pageUrl = "";
    }

    // Normalize pathname (remove trailing slash, handle empty)
    const normalizedPathname = pathname.replace(/\/$/, "") || "/";

    // Determine page type based on pathname patterns
    let pageType = "unknown";
    let pageName = "";

    // Check exact matches first
    if (PAGE_TYPE_MAP[normalizedPathname]) {
      pageType = PAGE_TYPE_MAP[normalizedPathname];
      pageName = normalizedPathname.split("/").pop() || "";
    }
    // Check for product pages: /shop/[slug]
    else if (normalizedPathname.startsWith("/shop/")) {
      pageType = "product";
      pageName = normalizedPathname.split("/").pop() || "";
    }
    // Check for mini-draw pages: /mini-draws/[id]
    else if (normalizedPathname.startsWith("/mini-draws/")) {
      pageType = "mini-draw";
      pageName = normalizedPathname.split("/").pop() || "";
    }
    // Check for brand pages: /shop/brand/[brand]
    else if (normalizedPathname.startsWith("/shop/brand/")) {
      pageType = "brand";
      pageName = normalizedPathname.split("/").pop() || "";
    }
    // Check for checkout pages
    else if (normalizedPathname.startsWith("/checkout")) {
      pageType = "checkout";
      pageName = "checkout";
    }
    // Check for admin pages
    else if (normalizedPathname.startsWith("/admin")) {
      pageType = "admin";
      pageName = normalizedPathname.split("/").pop() || "admin";
    }
    // Default: use pathname segments
    else {
      const segments = normalizedPathname.split("/").filter(Boolean);
      pageType = segments[0] || "home";
      pageName = segments[segments.length - 1] || "";
    }

    return {
      page_type: pageType,
      page_name: pageName,
      page_url: pageUrl,
    };
  } catch (error) {
    // Return safe defaults on error
    if (process.env.NODE_ENV === "development") {
      // console.warn("Error extracting page metadata:", error);
    }
    return {
      page_type: "unknown",
      page_name: "",
      page_url: url || (typeof window !== "undefined" ? window.location.href : ""),
    };
  }
}

