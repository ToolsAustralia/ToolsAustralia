"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AdminPage from "@/app/admin/component/AdminPage";
import { AdminUser } from "@/types/admin";
import { usePermissions } from "@/hooks/usePermissions";
import { firstAccessibleTabId } from "@/app/admin/component/adminTabs";
import DashboardLoader from "@/components/loading/DashboardLoader";

export default function AdminDashboard() {
  const router = useRouter();
  const { data: session } = useSession();
  const { isLoading, isStaff, has } = usePermissions();

  // If the user can't see Overview, redirect to the first tab they CAN see.
  // This catches custom-role staff (e.g. Submissions-only) who would otherwise
  // land here and stare at Forbidden errors. Runs as soon as permissions are
  // loaded; layout's server guard already verified they're internal users.
  useEffect(() => {
    if (isLoading) return;
    if (!isStaff) return;
    if (has("overview.view")) return;
    const target = firstAccessibleTabId(has);
    if (target && target !== "overview") {
      router.replace(`/admin/${target}`);
    }
  }, [isLoading, isStaff, has, router]);

  // Show loading while checking authentication
  if (isLoading) {
    return <DashboardLoader label="Loading admin…" className="bg-gray-50 dark:bg-neutral-950" />;
  }

  // Don't render if not staff — the admin layout's server guard handles the redirect,
  // but we gate here too as a belt-and-suspenders for the client.
  if (!isStaff) {
    router.push("/");
    return null;
  }

  // Create admin user object from session
  const roleLabel =
    session?.user?.roleName ??
    (session?.user?.userType === "admin" ? "Admin" : "Staff");
  const adminUser: AdminUser = {
    id: session?.user?.id || "",
    name: `${session?.user?.firstName || ""} ${session?.user?.lastName || ""}`.trim(),
    email: session?.user?.email || "",
    role: roleLabel,
    isAdmin: session?.user?.userType === "admin",
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

  return <AdminPage user={adminUser} navigateTo={navigateTo} selectedTab="overview" />;
}
