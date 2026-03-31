import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AdminUserModalProvider } from "@/contexts/AdminUserModalContext";
import ModalsGalleryClient from "@/components/dev/ModalsGalleryClient";

/**
 * Development-only: preview modals, drawers, popovers, and other front overlays for UI / dark-mode review.
 * Returns 404 in production.
 */

export const metadata: Metadata = {
  title: "Overlay gallery (dev) | Tools Australia",
  description: "Development-only modal, drawer, and popover previews",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function DevModalsGalleryPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <AdminUserModalProvider>
      <ModalsGalleryClient />
    </AdminUserModalProvider>
  );
}
