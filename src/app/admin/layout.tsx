import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Dashboard - Tools Australia",
  description: "Admin dashboard for managing Tools Australia ecommerce platform",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Note: Authentication is handled by middleware
  // Admin access control is managed at the route level

  return <div className="h-screen-dvh overflow-hidden">{children}</div>;
}
