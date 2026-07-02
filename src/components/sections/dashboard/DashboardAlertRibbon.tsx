"use client";

import { ShieldAlert, Clock } from "lucide-react";
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
    return (
      <div
        className={className}
        style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 15px", borderRadius: "0.875rem", background: "linear-gradient(100deg,rgba(14,165,165,.16),rgba(14,165,165,.06))", border: "1px solid rgba(14,165,165,.42)" }}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[#0ea5a5]" style={{ background: "rgba(14,165,165,.2)" }}>
          <Clock className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <b className="font-['Poppins'] text-[13px] font-extrabold text-primary-token dark:text-white">
            Partner access ends {expiryLabel ? `in ${expiryLabel}` : "soon"}
          </b>
          <div className="mt-0.5 text-[11px] leading-[1.4] text-muted-token">Your one-time pack unlocked discounts — become a member to keep them.</div>
        </div>
      </div>
    );
  }

  return null;
}
