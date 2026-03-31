import { Metadata } from "next";
import { Suspense } from "react";
import { AdminUserModalProvider } from "@/contexts/AdminUserModalContext";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Dashboard - Tools Australia",
  description: "Admin dashboard for managing Tools Australia ecommerce platform",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Note: Authentication is handled by middleware
  // Admin access control is managed at the route level

  return (
    <div className="h-screen-dvh overflow-hidden">
      <AdminUserModalProvider>
        <Suspense fallback={
          <div className="min-h-screen-svh flex items-center justify-center bg-gray-50 dark:bg-neutral-950">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600 dark:border-red-500"></div>
          </div>
        }>
          {children}
        </Suspense>
      </AdminUserModalProvider>
    </div>
  );
}
