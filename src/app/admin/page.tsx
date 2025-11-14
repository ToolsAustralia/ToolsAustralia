"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import AdminPage from "@/app/admin/component/AdminPage";
import { AdminUser } from "@/types/admin";

export default function AdminDashboard() {
  const router = useRouter();
  const { data: session, status } = useSession();

  // Redirect if not authenticated or not admin
  useEffect(() => {
    if (status === "loading") return; // Still loading

    if (!session || session.user?.role !== "admin") {
      router.push("/");
    }
  }, [session, status, router]);

  // Show loading while checking authentication
  if (status === "loading") {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600"></div>
      </div>
    );
  }

  // Don't render if not authenticated or not admin
  if (!session || session.user?.role !== "admin") {
    return null;
  }

  // Create admin user object from session
  const adminUser: AdminUser = {
    id: session.user?.id || "",
    name: `${session.user?.firstName || ""} ${session.user?.lastName || ""}`.trim(),
    email: session.user?.email || "",
    role: "admin",
    isAdmin: true,
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

  return <AdminPage user={adminUser} navigateTo={navigateTo} />;
}
