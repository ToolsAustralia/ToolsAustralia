"use client";

import { ShieldAlert, Clock } from "lucide-react";
import { cn } from "@/utils/cn";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";

interface DashboardAlertRibbonProps {
  acct: DashboardAccountState;
  /** One-time time-gated access label, e.g. "5 days". */
  expiryLabel?: string | null;
  className?: string;
}

/**
 * State alert ribbon above the entries card — past-due (amber) or one-time (teal),
 * ported from the prototype. Renders nothing for active / guest.
 */
export default function DashboardAlertRibbon({ acct, expiryLabel, className }: DashboardAlertRibbonProps) {
  if (acct === "pastdue") {
    return (
      <div
        className={className}
        style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 15px", borderRadius: "0.875rem", background: "linear-gradient(100deg,rgba(217,119,6,.16),rgba(217,119,6,.07))", border: "1px solid rgba(217,119,6,.42)" }}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[#d97706]" style={{ background: "rgba(217,119,6,.2)" }}>
          <ShieldAlert className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <b className="font-['Poppins'] text-[13px] font-extrabold text-primary-token dark:text-white">Payment failed</b>
          <div className="mt-0.5 text-[11px] leading-[1.4] text-muted-token">Your membership entries are paused until you update payment.</div>
        </div>
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
        <Clock className="h-4 w-4 shrink-0" />
        <span className="text-[11.5px] font-bold leading-tight">
          Partner access ends {expiryLabel ? `in ${expiryLabel}` : "soon"} — become a member to keep it
        </span>
      </div>
    );
  }

  return null;
}
