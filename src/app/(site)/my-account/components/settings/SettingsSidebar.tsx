"use client";

// SettingsSidebar — desktop vertical nav + mobile 4-col segmented strip.
// Pure presentational. All business logic lives in page.tsx.

import React from "react";
import { User, CreditCard, KeyRound, Wallet, ChevronRight, LogOut } from "lucide-react";
import { cn } from "@/utils/cn";

// ---------------------------------------------------------------------------
// Contract — shared type + tab definition
// ---------------------------------------------------------------------------

export type SettingsSection = "profile" | "subscription" | "password" | "payment";

export const SETTINGS_TABS: Array<{
  id: SettingsSection;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  desc: string;
}> = [
  {
    id: "profile",
    label: "Profile",
    shortLabel: "Profile",
    icon: User,
    desc: "Personal info, contact",
  },
  {
    id: "subscription",
    label: "Subscription",
    shortLabel: "Plan",
    icon: CreditCard,
    desc: "Plan, billing",
  },
  {
    id: "password",
    label: "Password",
    shortLabel: "Password",
    icon: KeyRound,
    desc: "Sign-in & security",
  },
  {
    id: "payment",
    label: "Payment Methods",
    shortLabel: "Payments",
    icon: Wallet,
    desc: "Saved cards",
  },
];

export const VALID_TAB_IDS: ReadonlySet<string> = new Set(SETTINGS_TABS.map((t) => t.id));

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SettingsSidebarProps {
  activeTab: SettingsSection;
  setActiveTab: (id: SettingsSection) => void;
  hasAlert: boolean;
  isMobile?: boolean;
  onSignOut?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SettingsSidebar({
  activeTab,
  setActiveTab,
  hasAlert,
  isMobile = false,
  onSignOut,
}: SettingsSidebarProps) {
  if (isMobile) {
    // Fixed 4-col segmented strip — sticky at top, no horizontal scroll
    return (
      <div className="lg:hidden border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 sticky top-0 z-10">
        <div className="grid grid-cols-4 gap-1 px-2 py-2">
          {SETTINGS_TABS.map((t) => {
            const active = t.id === activeTab;
            const showDot = t.id === "subscription" && hasAlert;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl text-[11px] font-semibold transition-colors",
                  active
                    ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900"
                    : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800",
                )}
              >
                <t.icon className="w-4 h-4" strokeWidth={2} />
                <span className="truncate">{t.shortLabel}</span>
                {showDot && (
                  <span
                    className={cn(
                      "absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full",
                      active ? "bg-red-400" : "bg-red-600",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Desktop vertical sidebar
  return (
    <aside className="lg:sticky lg:top-20 self-start">
      <nav className="space-y-1">
        {SETTINGS_TABS.map((t) => {
          const active = t.id === activeTab;
          const showDot = t.id === "subscription" && hasAlert;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors",
                active
                  ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900"
                  : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900",
              )}
            >
              <div
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                  active
                    ? "bg-white/15 dark:bg-neutral-900/10"
                    : "bg-neutral-100 dark:bg-neutral-900 group-hover:bg-white dark:group-hover:bg-neutral-800",
                )}
              >
                <t.icon className="w-4 h-4" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{t.label}</p>
                  {showDot && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  )}
                </div>
                <p
                  className={cn(
                    "text-xs truncate",
                    active ? "opacity-70" : "text-neutral-500 dark:text-neutral-400",
                  )}
                >
                  {t.desc}
                </p>
              </div>
              <ChevronRight
                className={cn(
                  "w-4 h-4 shrink-0 transition",
                  active
                    ? "opacity-90"
                    : "opacity-0 -translate-x-1 group-hover:opacity-50 group-hover:translate-x-0",
                )}
                strokeWidth={2}
              />
            </button>
          );
        })}

        {/* Sign out */}
        {onSignOut && (
          <div className="pt-2 mt-2 border-t border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={onSignOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0">
                <LogOut className="w-4 h-4" strokeWidth={2} />
              </div>
              <span className="text-sm font-semibold">Sign out</span>
            </button>
          </div>
        )}
      </nav>
    </aside>
  );
}
