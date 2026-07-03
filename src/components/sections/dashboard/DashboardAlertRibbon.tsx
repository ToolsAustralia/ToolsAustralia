"use client";

import { ShieldAlert, Sparkles } from "lucide-react";
import { cn } from "@/utils/cn";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";

interface DashboardAlertRibbonProps {
  acct: DashboardAccountState;
  className?: string;
}

/**
 * State alert ribbon above the entries card — past-due (amber) or one-time (teal),
 * ported from the prototype. Renders nothing for active / guest.
 */
export default function DashboardAlertRibbon({ acct, className }: DashboardAlertRibbonProps) {
  if (acct === "pastdue") {
    // High-contrast amber pill floating at the hero↔entries seam — mirrors the
    // one-time teal pill below (the parent column is pulled up over the hero).
    return (
      <div
        className={cn("relative z-10 mx-auto flex w-fit max-w-full items-center gap-2 rounded-full px-3.5 py-2 shadow-[0_10px_24px_-10px_rgba(217,119,6,.75)]", className)}
        style={{ background: "linear-gradient(100deg,#f59e0b,#d97706)", color: "#fff", border: "1px solid rgba(255,255,255,.28)" }}
      >
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span className="text-[11.5px] font-bold leading-tight">Renewal failed — update payment to keep earning entries</span>
      </div>
    );
  }

  if (acct === "onetime") {
    // A compact, high-contrast pill that FLOATS at the hero↔entries seam (the parent
    // pulls this column up over the hero's bottom), instead of a low-contrast strip.
    return (
      <div
        className={cn("relative z-10 mx-auto flex w-fit max-w-full items-center gap-2 rounded-full px-3.5 py-2 shadow-[0_10px_24px_-10px_rgba(13,148,136,.75)]", className)}
        style={{ background: "linear-gradient(100deg,#0ea5a5,#0d9488)", color: "#fff", border: "1px solid rgba(255,255,255,.28)" }}
      >
        <Sparkles className="h-4 w-4 shrink-0" />
        <span className="text-[11.5px] font-bold leading-tight">
          Become a member for lasting partner discounts, more free entries &amp; bonus offers
        </span>
      </div>
    );
  }

  return null;
}
