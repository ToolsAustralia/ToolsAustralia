"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, User, Ticket, MessageCircle, CreditCard } from "lucide-react";

export default function BottomNav() {
  const pathname = usePathname();

  const navItems: Array<{
    id: string;
    label: string;
    icon: typeof User;
    href: string;
    isActive: boolean;
    badge?: number | string;
  }> = [
    {
      id: "home",
      label: "Home",
      icon: Home,
      href: "/",
      isActive: pathname === "/" || pathname === "",
    },
    {
      id: "profile",
      label: "Profile",
      icon: User,
      href: "/my-account",
      isActive: pathname === "/my-account" || pathname === "/my-account/",
    },
    {
      id: "draws",
      label: "Draws",
      icon: Ticket,
      href: "/my-account/draws",
      isActive: pathname?.startsWith("/my-account/draws"),
    },
    {
      id: "membership",
      label: "Membership",
      icon: CreditCard,
      href: "/my-account/membership",
      isActive: pathname?.startsWith("/my-account/membership"),
    },
    {
      id: "support",
      label: "Support",
      icon: MessageCircle,
      href: "/my-account/support",
      isActive: pathname === "/my-account/support" || pathname?.startsWith("/my-account/support"),
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 w-full max-w-[100vw] z-40 bg-white dark:bg-neutral-900 border-t border-gray-200 dark:border-neutral-800 pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="grid grid-cols-5 h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`group flex flex-col items-center justify-center gap-1 transition-colors rounded-lg py-2 focus:outline-none focus-visible:outline-none active:bg-black active:text-white dark:active:bg-neutral-950 dark:active:text-white ${
                item.isActive
                  ? "text-white bg-black dark:bg-neutral-950"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              <div className="relative">
                {item.isActive ? (
                  <Icon className="w-6 h-6 fill-current stroke-[1.5] stroke-black group-active:stroke-white dark:stroke-black dark:group-active:stroke-black" />
                ) : (
                  <Icon className="w-6 h-6 group-active:fill-current group-active:stroke-[1.5] group-active:stroke-white dark:group-active:stroke-black" />
                )}
                {item.badge && (
                  <div className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 dark:bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {item.badge}
                  </div>
                )}
              </div>
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
