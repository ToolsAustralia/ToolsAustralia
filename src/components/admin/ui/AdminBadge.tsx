"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle,
  Clock,
  CreditCard,
  PauseCircle,
  XCircle,
} from "lucide-react";
import type { AdminUserListItem } from "@/types/admin";
import { deriveMembershipDisplayStatus } from "@/utils/subscription/subscription-helpers";

/** Matches subscription column badges in admin users table */
export const ADMIN_BADGE_BASE =
  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-2xs sm:text-xs font-semibold shadow-sm ring-1 transition-colors";

export const adminBadgeVariants = {
  neutral:
    "bg-gradient-to-br from-slate-50 to-gray-100 dark:from-neutral-800 dark:to-neutral-900 text-slate-700 dark:text-neutral-200 ring-slate-200/80 dark:ring-neutral-600 border border-slate-200/90 dark:border-neutral-600",
  success:
    "bg-gradient-to-br from-emerald-50 via-teal-50/80 to-emerald-100/60 dark:from-emerald-950/55 dark:via-emerald-900/35 dark:to-teal-950/45 text-emerald-800 dark:text-emerald-300 ring-emerald-200/90 dark:ring-emerald-500/35 border border-emerald-200/80 dark:border-emerald-500/30",
  warning:
    "bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/50 dark:to-yellow-950/35 text-amber-900 dark:text-amber-300 ring-amber-200/90 dark:ring-amber-500/35 border border-amber-200/80 dark:border-amber-500/25",
  danger:
    "bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/45 dark:to-rose-950/35 text-red-800 dark:text-red-300 ring-red-200/90 dark:ring-red-500/30 border border-red-200/80 dark:border-red-500/25",
  info:
    "bg-gradient-to-br from-sky-50 to-blue-50 dark:from-sky-950/45 dark:to-blue-950/35 text-sky-900 dark:text-sky-200 ring-sky-200/90 dark:ring-sky-500/30 border border-sky-200/80 dark:border-sky-500/25",
  tagBlue:
    "bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950/50 dark:to-sky-950/35 text-blue-900 dark:text-blue-200 ring-blue-200/90 dark:ring-blue-500/30 border border-blue-200/80 dark:border-blue-500/25",
  tagEmerald:
    "bg-gradient-to-br from-emerald-50 to-teal-50 dark: from-emerald-950/45 dark:to-teal-950/35 text-emerald-900 dark:text-emerald-200 ring-emerald-200/90 dark:ring-emerald-500/30 border border-emerald-200/80 dark:border-emerald-500/25",
  tagViolet:
    "bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/45 dark:to-purple-950/35 text-violet-900 dark:text-violet-200 ring-violet-200/90 dark:ring-violet-500/30 border border-violet-200/80 dark:border-violet-500/25",
  tagOrange:
    "bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/45 dark:to-amber-950/35 text-orange-900 dark:text-orange-200 ring-orange-200/90 dark:ring-orange-500/30 border border-orange-200/80 dark:border-orange-500/25",
  tagPink:
    "bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950/45 dark:to-rose-950/35 text-pink-900 dark:text-pink-200 ring-pink-200/90 dark:ring-pink-500/30 border border-pink-200/80 dark:border-pink-500/25",
  tagAmber:
    "bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/50 dark:to-yellow-950/35 text-amber-900 dark:text-amber-200 ring-amber-200/90 dark:ring-amber-500/35 border border-amber-200/80 dark:border-amber-500/25",
} as const;

export type AdminBadgeVariant = keyof typeof adminBadgeVariants;

export interface AdminBadgeProps {
  variant: AdminBadgeVariant;
  icon?: LucideIcon;
  iconClassName?: string;
  showPulseDot?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function AdminBadge({
  variant,
  icon: Icon,
  iconClassName,
  showPulseDot,
  className = "",
  children,
}: AdminBadgeProps) {
  const surface = adminBadgeVariants[variant];
  return (
    <span className={`${ADMIN_BADGE_BASE} ${surface} ${className}`.trim()}>
      {Icon ? <Icon className={`w-3 h-3 shrink-0 ${iconClassName ?? ""}`.trim()} aria-hidden /> : null}
      {showPulseDot ? (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40 dark:bg-emerald-500" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
        </span>
      ) : null}
      {children}
    </span>
  );
}

/**
 * Core subscription state used by users list and user detail modal.
 */
export function renderSubscriptionStateBadge(
  subscription?: { status?: string; isActive?: boolean } | null
): React.ReactNode {
  if (!subscription) {
    return (
      <AdminBadge variant="neutral" icon={Ban} iconClassName="opacity-70">
        No Subscription
      </AdminBadge>
    );
  }

  const status = subscription.status?.toLowerCase();
  if (status === "incomplete" || status === "cancelled" || status === "canceled") {
    return (
      <AdminBadge variant="neutral" icon={Ban} iconClassName="opacity-70">
        No Subscription
      </AdminBadge>
    );
  }

  if (subscription.isActive) {
    return (
      <AdminBadge
        variant="success"
        icon={CreditCard}
        iconClassName="opacity-90 text-emerald-600 dark:text-emerald-400"
        showPulseDot
      >
        Active
      </AdminBadge>
    );
  }

  if (status === "past_due") {
    return (
      <AdminBadge variant="warning" icon={AlertTriangle} iconClassName="text-amber-600 dark:text-amber-400">
        Past Due
      </AdminBadge>
    );
  }

  // Retention-paused (freeze window): status "paused" + isActive false. Match the detail-header
  // badge (renderMembershipStatusBadge) so a paused member isn't mislabelled "Inactive" in the list.
  if (status === "paused") {
    return (
      <AdminBadge variant="info" icon={PauseCircle} iconClassName="text-sky-600 dark:text-sky-400">
        Paused
      </AdminBadge>
    );
  }

  return (
    <AdminBadge variant="danger" icon={PauseCircle} iconClassName="text-red-600 dark:text-red-400">
      Inactive
    </AdminBadge>
  );
}

export function renderAdminSubscriptionBadge(user: AdminUserListItem): React.ReactNode {
  return renderSubscriptionStateBadge(user.subscription ?? null);
}

/**
 * Rich membership-state badge for the user-detail modal HEADER.
 *
 * Unlike the coarse `renderSubscriptionStateBadge` (list rows), this surfaces the
 * full lifecycle the admin needs at a glance — including "scheduled to cancel"
 * with its end date — via the shared `deriveMembershipDisplayStatus` derivation.
 */
export function renderMembershipStatusBadge(
  subscription?:
    | { status?: string; isActive?: boolean; autoRenew?: boolean; endDate?: string | Date | null }
    | null
): React.ReactNode {
  const state = deriveMembershipDisplayStatus(subscription);

  switch (state) {
    case "active":
      return (
        <AdminBadge
          variant="success"
          icon={CreditCard}
          iconClassName="opacity-90 text-emerald-600 dark:text-emerald-400"
          showPulseDot
        >
          Active
        </AdminBadge>
      );
    case "past_due":
      return (
        <AdminBadge variant="warning" icon={AlertTriangle} iconClassName="text-amber-600 dark:text-amber-400">
          Past Due
        </AdminBadge>
      );
    case "paused":
      return (
        <AdminBadge variant="info" icon={PauseCircle} iconClassName="text-sky-600 dark:text-sky-400">
          Paused
        </AdminBadge>
      );
    case "scheduled_cancel": {
      const endRaw = subscription?.endDate ? new Date(subscription.endDate) : null;
      const endLabel =
        endRaw && !Number.isNaN(endRaw.getTime())
          ? endRaw.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
          : null;
      return (
        <AdminBadge variant="tagOrange" icon={CalendarClock} iconClassName="text-orange-600 dark:text-orange-400">
          {endLabel ? `Cancels ${endLabel}` : "Cancellation scheduled"}
        </AdminBadge>
      );
    }
    case "cancelled":
      return (
        <AdminBadge variant="danger" icon={XCircle} iconClassName="text-red-600 dark:text-red-400">
          Cancelled
        </AdminBadge>
      );
    case "none":
    default:
      return (
        <AdminBadge variant="neutral" icon={Ban} iconClassName="opacity-70">
          Guest — no membership
        </AdminBadge>
      );
  }
}

export function VerificationBadge({ verified, label }: { verified: boolean; label?: string }) {
  if (verified) {
    return (
      <AdminBadge variant="success" icon={CheckCircle} iconClassName="text-emerald-600 dark:text-emerald-400">
        {label ?? "Verified"}
      </AdminBadge>
    );
  }
  return (
    <AdminBadge variant="warning" icon={AlertTriangle} iconClassName="text-amber-600 dark:text-amber-400">
      {label ?? "Unverified"}
    </AdminBadge>
  );
}

export function AccountActiveBadge({ isActive }: { isActive: boolean }) {
  if (isActive) {
    return (
      <AdminBadge variant="success" icon={CheckCircle} iconClassName="text-emerald-600 dark:text-emerald-400">
        Active
      </AdminBadge>
    );
  }
  return (
    <AdminBadge variant="danger" icon={XCircle} iconClassName="text-red-600 dark:text-red-400">
      Inactive
    </AdminBadge>
  );
}

export function OrderStatusBadge({ status }: { status?: string | null }) {
  const raw = status || "Unspecified";
  const s = raw.toLowerCase();
  if (s === "completed") {
    return (
      <AdminBadge variant="success" icon={CheckCircle} iconClassName="text-emerald-600 dark:text-emerald-400">
        {raw}
      </AdminBadge>
    );
  }
  if (s === "pending") {
    return (
      <AdminBadge variant="warning" icon={Clock} iconClassName="text-amber-600 dark:text-amber-400">
        {raw}
      </AdminBadge>
    );
  }
  if (s === "processing") {
    return <AdminBadge variant="info">{raw}</AdminBadge>;
  }
  if (s === "cancelled" || s === "canceled") {
    return (
      <AdminBadge variant="danger" icon={XCircle} iconClassName="text-red-600 dark:text-red-400">
        {raw}
      </AdminBadge>
    );
  }
  return <AdminBadge variant="neutral">{raw}</AdminBadge>;
}

export function SubscriptionHistoryStatusBadge({ status }: { status?: string | null }) {
  const raw = status || "—";
  // `trialing` is a paid, active member (we anchor/reanchor billing via Stripe `trial_end`); never
  // surface "trialing" in the admin UI — render it as "active" like any other active row.
  const display = raw === "trialing" ? "active" : raw;
  const isGranted = raw === "BenefitsGranted";
  return (
    <AdminBadge variant={isGranted ? "success" : "warning"} icon={isGranted ? CheckCircle : AlertTriangle}>
      {display}
    </AdminBadge>
  );
}

export function ActiveOrInactiveBadge({
  active,
  activeLabel = "Active",
  inactiveLabel = "Inactive",
}: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  if (active) {
    return (
      <AdminBadge variant="success" icon={CheckCircle} iconClassName="text-emerald-600 dark:text-emerald-400">
        {activeLabel}
      </AdminBadge>
    );
  }
  return <AdminBadge variant="neutral">{inactiveLabel}</AdminBadge>;
}

export function DrawParticipationStatusBadge({ status }: { status?: string | null }) {
  const raw = status || "Unspecified";
  const s = raw.toLowerCase();
  if (s === "completed") {
    return <AdminBadge variant="success">{raw}</AdminBadge>;
  }
  if (s === "active") {
    return <AdminBadge variant="info">{raw}</AdminBadge>;
  }
  return <AdminBadge variant="neutral">{raw}</AdminBadge>;
}

export function MiniDrawParticipationStatusBadge({
  miniDrawStatus,
  isActive,
}: {
  miniDrawStatus?: string | null;
  isActive?: boolean;
}) {
  const raw = miniDrawStatus || (isActive ? "Active" : "Inactive");
  const s = (miniDrawStatus || "").toLowerCase();
  if (s === "completed") {
    return <AdminBadge variant="success">{raw}</AdminBadge>;
  }
  if (isActive) {
    return <AdminBadge variant="info">{raw}</AdminBadge>;
  }
  return <AdminBadge variant="neutral">{raw}</AdminBadge>;
}

const ENTRY_SOURCE_VARIANT: Record<string, AdminBadgeVariant> = {
  membership: "tagBlue",
  "one-time-package": "tagEmerald",
  upsell: "tagViolet",
  "mini-draw": "tagOrange",
  referral: "tagPink",
  "bonus-entry-promo": "tagAmber",
  "cancellation-upsell": "tagAmber",
};

export function EntrySourceBadge({ sourceKey, children }: { sourceKey: string; children: React.ReactNode }) {
  const variant = ENTRY_SOURCE_VARIANT[sourceKey] ?? "neutral";
  return <AdminBadge variant={variant}>{children}</AdminBadge>;
}

/** Read / Unread column in submissions tables */
export function SubmissionReadBadge({ readAt }: { readAt?: string | null }) {
  if (readAt) {
    return <AdminBadge variant="success">Read</AdminBadge>;
  }
  return <AdminBadge variant="warning">Unread</AdminBadge>;
}

/** A/B experiment lifecycle */
export function ExperimentStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const variant: AdminBadgeVariant =
    s === "active" ? "success" : s === "paused" ? "warning" : s === "ended" ? "danger" : "neutral";
  return (
    <AdminBadge variant={variant} className="capitalize">
      {status}
    </AdminBadge>
  );
}

/** Major draw rows in Draw Results / Upcoming Draws */
export function MajorDrawTableStatusBadge({ status }: { status: string }) {
  const raw = status.charAt(0).toUpperCase() + status.slice(1);
  const s = status.toLowerCase();
  if (s === "completed") {
    return <AdminBadge variant="success">{raw}</AdminBadge>;
  }
  if (s === "frozen") {
    return <AdminBadge variant="info">{raw}</AdminBadge>;
  }
  if (s === "active") {
    return <AdminBadge variant="warning">{raw}</AdminBadge>;
  }
  if (s === "cancelled") {
    return <AdminBadge variant="danger">{raw}</AdminBadge>;
  }
  return <AdminBadge variant="neutral">{raw}</AdminBadge>;
}

/** Stripe charge job row (bulk / single-user past-due) */
export function ChargeJobResultStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "success") {
    return <AdminBadge variant="success">{status}</AdminBadge>;
  }
  if (s === "failed") {
    return <AdminBadge variant="danger">{status}</AdminBadge>;
  }
  return <AdminBadge variant="warning">{status}</AdminBadge>;
}

export function DrawWinnerOutcomeBadge({
  status,
  hasWinnerUserId,
}: {
  status: string;
  hasWinnerUserId: boolean;
}) {
  const st = status.toLowerCase();
  if (hasWinnerUserId) {
    return (
      <AdminBadge variant="success" icon={CheckCircle} iconClassName="text-emerald-600 dark:text-emerald-400">
        Winner Selected
      </AdminBadge>
    );
  }
  if (st === "completed" || st === "frozen") {
    return (
      <AdminBadge variant="danger" icon={XCircle} iconClassName="text-red-600 dark:text-red-400">
        No Winner
      </AdminBadge>
    );
  }
  return (
    <AdminBadge variant="warning" icon={Clock} iconClassName="text-amber-600 dark:text-amber-400">
      Pending
    </AdminBadge>
  );
}
