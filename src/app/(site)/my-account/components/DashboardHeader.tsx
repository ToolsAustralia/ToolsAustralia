"use client";

import React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Settings, Sun, Moon, ArrowLeft, AlertTriangle, User, Ticket, MessageCircle, CreditCard } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

interface DashboardHeaderProps {
  title?: string;
  showBackButton?: boolean;
  showRenewalAlert?: boolean;
  /** When provided, called instead of router.back() when back button is clicked */
  onBackClick?: () => void;
}

const NAV_ITEMS = [
  { id: "profile", label: "Profile", icon: User, href: "/my-account", isActive: (path: string | null) => path === "/my-account" || path === "/my-account/" },
  { id: "draws", label: "Draws", icon: Ticket, href: "/my-account/draws", isActive: (path: string | null) => path?.startsWith("/my-account/draws") },
  { id: "membership", label: "Membership", icon: CreditCard, href: "/my-account/membership", isActive: (path: string | null) => path?.startsWith("/my-account/membership") },
  { id: "support", label: "Support", icon: MessageCircle, href: "/my-account/support", isActive: (path: string | null) => path === "/my-account/support" || path?.startsWith("/my-account/support") },
] as const;

export default function DashboardHeader({
  title = "Profile",
  showBackButton = false,
  showRenewalAlert = false,
  onBackClick,
}: DashboardHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  const isSettingsPage = pathname?.includes("/settings");

  const handleBack = () => {
    if (onBackClick) {
      onBackClick();
    } else {
      router.back();
    }
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-gray-200 dark:border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {showBackButton && (
              <button
                onClick={handleBack}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors shrink-0"
                aria-label="Go back"
              >
                <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </button>
            )}
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
              {title}
            </h1>
          </div>

          {/* Desktop nav - mirrors bottom nav for large screens where bottom nav is hidden */}
          <nav className="hidden lg:flex items-center gap-1" aria-label="Account navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.isActive(pathname ?? null);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-black text-white dark:bg-neutral-950 dark:text-white"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "fill-current" : ""}`} strokeWidth={1.5} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? (
                <Moon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              ) : (
                <Sun className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              )}
            </button>

            {!isSettingsPage && (
              <button
                onClick={() => router.push("/my-account/settings")}
                className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                aria-label="Open settings"
              >
                <Settings className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                {showRenewalAlert && (
                  <div className="absolute -top-1 -right-1">
                    <AlertTriangle className="w-4 h-4 text-amber-500 animate-pulse" strokeWidth={2.5} />
                  </div>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
    {/* Spacer to prevent content from scrolling under fixed header */}
    <div className="h-14 sm:h-16" aria-hidden="true" />
    </>
  );
}
