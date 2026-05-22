import { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AdminUserModalProvider } from "@/contexts/AdminUserModalContext";
import { AdminThemeProvider } from "@/contexts/AdminThemeContext";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Dashboard - Tools Australia",
  description: "Admin dashboard for managing Tools Australia ecommerce platform",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  if (session.user.userType !== "staff" && session.user.userType !== "admin") {
    // Legacy bridge: a user with role:"admin" but no staff/admin userType still gets in (Phase 5 removes this)
    if (session.user.role !== "admin") redirect("/");
  }

  return (
    <AdminThemeProvider>
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
    </AdminThemeProvider>
  );
}
