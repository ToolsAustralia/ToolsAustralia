"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  Download,
  FileText,
  Gift,
  Megaphone,
  Shield,
  Trophy,
  UserCheck,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Card, SectionTitle } from "@/components/admin/ui";
import AdminMajorDrawModal from "@/components/modals/draws/AdminMajorDrawModal";

/**
 * Quick actions grid for the admin Overview.
 *
 * Navigation-first: most actions route to an admin tab via `/admin/<tab>`
 * (resolved by the `[tab]` dynamic segment). Two actions stay wired to modals:
 * - Create Major Draw → opens `AdminMajorDrawModal`; success → `onRefreshStats`.
 * - Export Participants → export modal → `/api/admin/major-draw/export`.
 *
 * Layout: up to 9 actions. Mobile shows the top 4 (2×2); actions 5–9 are
 * `hidden sm:flex`, so desktop fills out to a 3×3 grid.
 */

interface QuickActionsCardProps {
  onRefreshStats: () => void;
}

type QuickAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Icon chip tone classes (light + dark). */
  toneBg: string;
  /** `true` to keep the action in the mobile 2×2; otherwise `hidden sm:flex`. */
  mobile: boolean;
} & (
  | { kind: "nav"; href: string }
  | { kind: "modal"; onClick: () => void }
);

export default function QuickActionsCard({ onRefreshStats }: QuickActionsCardProps) {
  const router = useRouter();
  const [isMajorDrawModalOpen, setIsMajorDrawModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportMajorDraw = async (format: "csv" | "excel") => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/admin/major-draw/export?format=${format}`);

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `major-draw-participants-${new Date().toISOString().split("T")[0]}.${
        format === "excel" ? "xlsx" : "csv"
      }`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setIsExportModalOpen(false);
    } catch (error) {
      console.error("Export error:", error);
      alert("Failed to export data. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  // Ordered by importance. Top 4 (`mobile: true`) form the phone 2×2; the rest
  // fill out the desktop 3×3.
  const actions: QuickAction[] = [
    {
      key: "create-major-draw",
      kind: "modal",
      label: "Create Major Draw",
      icon: Trophy,
      toneBg: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
      mobile: true,
      onClick: () => setIsMajorDrawModalOpen(true),
    },
    {
      key: "create-mini-draw",
      kind: "nav",
      label: "Create Mini Draw",
      icon: Gift,
      toneBg: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
      mobile: true,
      href: "/admin/mini-draws",
    },
    {
      key: "launch-promo",
      kind: "nav",
      label: "Launch Promo",
      icon: Megaphone,
      toneBg: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
      mobile: true,
      href: "/admin/promos",
    },
    {
      key: "export-participants",
      kind: "modal",
      label: "Export Participants",
      icon: Download,
      toneBg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
      mobile: true,
      onClick: () => setIsExportModalOpen(true),
    },
    {
      key: "users",
      kind: "nav",
      label: "Users",
      icon: Users,
      toneBg: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
      mobile: false,
      href: "/admin/users",
    },
    {
      key: "affiliates",
      kind: "nav",
      label: "Affiliates",
      icon: UserCheck,
      toneBg: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400",
      mobile: false,
      href: "/admin/affiliates",
    },
    {
      key: "draw-results",
      kind: "nav",
      label: "Draw Results",
      icon: Award,
      toneBg: "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400",
      mobile: false,
      href: "/admin/draw-results",
    },
    {
      key: "manage-team",
      kind: "nav",
      label: "Manage Team",
      icon: Shield,
      toneBg: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400",
      mobile: false,
      href: "/admin/team",
    },
    {
      key: "submissions",
      kind: "nav",
      label: "Submissions",
      icon: FileText,
      toneBg: "bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400",
      mobile: false,
      href: "/admin/submissions",
    },
  ];

  const buttonBase =
    "group flex flex-col items-start gap-2.5 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 hover:lift transition-all text-left";
  const chip = "w-9 h-9 rounded-lg flex items-center justify-center";
  const labelClass =
    "text-2xs font-semibold text-neutral-700 dark:text-neutral-200 leading-tight";

  return (
    <>
      <Card className="p-5 h-full">
        <SectionTitle title="Quick actions" subtitle="Jump to a section" icon={Zap} />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {actions.map((action) => {
            const Icon = action.icon;
            const visibility = action.mobile ? "flex" : "hidden sm:flex";
            const onClick =
              action.kind === "nav"
                ? () => router.push(action.href)
                : action.onClick;

            return (
              <button
                key={action.key}
                type="button"
                onClick={onClick}
                className={`${visibility} ${buttonBase}`}
              >
                <span className={`${chip} ${action.toneBg}`}>
                  <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
                </span>
                <span className={labelClass}>{action.label}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Create Major Draw modal */}
      <AdminMajorDrawModal
        isOpen={isMajorDrawModalOpen}
        onClose={() => setIsMajorDrawModalOpen(false)}
        onSuccess={() => {
          onRefreshStats();
        }}
      />

      {/* Export Participants modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in border border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Export Major Draw Participants</h3>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                aria-label="Close"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="text-neutral-600 dark:text-neutral-400 mb-6 text-sm">
              Export all participants and their entry counts from the current major draw.
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleExportMajorDraw("csv")}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold"
              >
                <Download className="w-5 h-5" />
                {isExporting ? "Exporting..." : "Export as CSV"}
              </button>
              <button
                type="button"
                onClick={() => handleExportMajorDraw("excel")}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold"
              >
                <Download className="w-5 h-5" />
                {isExporting ? "Exporting..." : "Export as Excel"}
              </button>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                disabled={isExporting}
                className="w-full px-4 py-3 border-2 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
