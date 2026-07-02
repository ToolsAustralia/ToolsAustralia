"use client";

import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import AdminPage from "@/app/admin/component/AdminPage";
import { AdminUser } from "@/types/admin";
import DashboardLoader from "@/components/loading/DashboardLoader";

export default function AdminTabPage() {
  const router = useRouter();
  const params = useParams();
  const { data: session, status } = useSession();
  const tab = params?.tab as string;

  // Internal users = userType "staff" / "admin", or legacy role:"admin"
  // (the legacy bridge stays until Phase 5 drops User.role).
  const isInternalUser =
    session?.user?.userType === "staff" ||
    session?.user?.userType === "admin" ||
    session?.user?.role === "admin";

  // Redirect if not authenticated or not internal
  useEffect(() => {
    if (status === "loading") return;
    if (!session || !isInternalUser) router.push("/");
  }, [session, status, isInternalUser, router]);

  // Show loading while checking authentication
  if (status === "loading") {
    return <DashboardLoader label="Loading admin…" className="bg-gray-50 dark:bg-neutral-950" />;
  }

  // Don't render if not authenticated or not internal
  if (!session || !isInternalUser) {
    return null;
  }

  // Create admin user object from session — `role` is the display name of
  // the user's assigned Role document so the sidebar can show "Customer
  // Support" instead of the legacy "admin" string.
  const roleLabel =
    session.user?.roleName ??
    (session.user?.userType === "admin" ? "Admin" : "Staff");
  const adminUser: AdminUser = {
    id: session.user?.id || "",
    name: `${session.user?.firstName || ""} ${session.user?.lastName || ""}`.trim(),
    email: session.user?.email || "",
    role: roleLabel,
    isAdmin: session.user?.userType === "admin",
    lastLogin: new Date(),
  };

  const navigateTo = (page: string) => {
    // Handle navigation to different pages
    switch (page) {
      case "home":
        router.push("/");
        break;
      case "shop":
        router.push("/shop");
        break;
      case "membership":
        router.push("/membership");
        break;
      case "rewards":
        router.push("/rewards");
        break;
      case "contact":
        router.push("/contact");
        break;
      case "faq":
        router.push("/faq");
        break;
      default:
        router.push("/");
        break;
    }
  };

  return <AdminPage user={adminUser} navigateTo={navigateTo} selectedTab={tab || "overview"} />;
}
