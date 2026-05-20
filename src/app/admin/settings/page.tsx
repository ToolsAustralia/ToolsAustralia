"use client";

// The /admin/[tab] dynamic route is normally what renders each admin tab, but
// the design-preview folder at /admin/settings/preview makes "settings" a
// static segment — so /admin/settings would 404 without a page.tsx here.
// This file is a thin wrapper that delegates to AdminPage with the right tab.

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import AdminPage from "@/app/admin/component/AdminPage";
import type { AdminUser } from "@/types/admin";

export default function AdminSettingsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  // Internal users = userType "staff" / "admin", or legacy role:"admin".
  const isInternalUser =
    session?.user?.userType === "staff" ||
    session?.user?.userType === "admin" ||
    session?.user?.role === "admin";

  useEffect(() => {
    if (status === "loading") return;
    if (!session || !isInternalUser) router.push("/");
  }, [session, status, isInternalUser, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600" />
      </div>
    );
  }
  if (!session || !isInternalUser) return null;

  const adminUser: AdminUser = {
    id: session.user?.id ?? "",
    name: `${session.user?.firstName ?? ""} ${session.user?.lastName ?? ""}`.trim(),
    email: session.user?.email ?? "",
    role: "admin",
    isAdmin: true,
    lastLogin: new Date(),
  };

  const navigateTo = (page: string) => {
    const map: Record<string, string> = {
      home: "/",
      shop: "/shop",
      membership: "/membership",
      rewards: "/rewards",
      contact: "/contact",
      faq: "/faq",
    };
    router.push(map[page] ?? "/");
  };

  return (
    <AdminPage user={adminUser} navigateTo={navigateTo} selectedTab="settings" />
  );
}
