"use client";

/**
 * Settings/overlay Claude redesign body for PaymentMethodsTab (the Payment sheet).
 *
 * PRESENTATIONAL ONLY. No hooks/fetch/business logic — every value/handler is
 * passed from the orchestrator (index.tsx), which keeps ALL Stripe wiring, the
 * `stripePromise` singleton, the add-form `<Elements>` block (passed in as
 * `addForm`) and the delete `ConfirmationModal`. Set-default / delete call the
 * same handlers with the same disabled/loading state. Modal-mode never renders this.
 *
 * Layout matches the prototype PaymentSheet: hero card face (default card) →
 * SAVED CARDS radio rows (Default badge / Remove) → dashed "Add a new card" →
 * encrypted footer.
 */

import React from "react";
import { AlertTriangle, CreditCard, Lock, Plus } from "lucide-react";
import type { SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";
import { cn } from "@/utils/cn";

export interface SettingsRedesignPaymentProps {
  paymentMethods: SavedPaymentMethod[];
  subscriptionDefaultPaymentMethodId: string | null;
  loading: boolean;
  error: string | null;
  hasActiveSubscription: boolean;
  subscriptionStatus?: string;
  showAddForm: boolean;
  isCreatingSetupIntent: boolean;
  settingDefaultId: string | null;
  deletingId: string | null;
  /** Pre-built Elements + AddPaymentForm block (or null) — built in index.tsx. */
  addForm: React.ReactNode;
  /** Name printed on the hero card face (from the orchestrator's user). */
  cardholderName?: string;
  onAddNew: () => void;
  onSetDefault: (paymentMethodId: string) => void;
  onDelete: (paymentMethodId: string) => void;
}

function brandFace(brandRaw?: string): { bg: string; mark: React.ReactNode } {
  const brand = (brandRaw ?? "").toLowerCase();
  if (brand === "visa") {
    return {
      bg: "linear-gradient(135deg,#141414 0%,#1b2140 48%,#0b1a3a 100%)",
      mark: <span className="font-poppins text-xl font-black italic tracking-tight text-white">VISA</span>,
    };
  }
  if (brand === "mastercard") {
    return {
      bg: "linear-gradient(135deg,#1d1d1d 0%,#2a1a14 50%,#3d0f0f 100%)",
      mark: (
        <div className="flex items-center -space-x-3">
          <span className="h-7 w-7 rounded-full bg-[#eb001b]" />
          <span className="h-7 w-7 rounded-full bg-[#f79e1b] mix-blend-screen" />
        </div>
      ),
    };
  }
  if (brand === "amex" || brand === "american express") {
    return {
      bg: "linear-gradient(135deg,#0a6896 0%,#0b4d77 50%,#062e49 100%)",
      mark: <span className="font-poppins text-lg font-black tracking-wider text-white">AMEX</span>,
    };
  }
  return {
    bg: "linear-gradient(135deg,#111 0%,#2a2a2e 55%,#141416 100%)",
    mark: <span className="font-poppins text-sm font-black uppercase tracking-wider text-white">{brandRaw || "Card"}</span>,
  };
}

function expLabel(meta?: SavedPaymentMethod["card"]): string {
  return meta ? `${String(meta.expMonth).padStart(2, "0")}/${String(meta.expYear).slice(-2)}` : "––/––";
}

function brandName(brandRaw?: string): string {
  if (!brandRaw) return "Card";
  return brandRaw.charAt(0).toUpperCase() + brandRaw.slice(1);
}

const SettingsRedesignPayment: React.FC<SettingsRedesignPaymentProps> = ({
  paymentMethods,
  subscriptionDefaultPaymentMethodId,
  loading,
  error,
  hasActiveSubscription,
  showAddForm,
  isCreatingSetupIntent,
  settingDefaultId,
  deletingId,
  addForm,
  cardholderName,
  onAddNew,
  onSetDefault,
  onDelete,
}) => {
  // Dedup (mirror legacy safety net) — keep first occurrence per id.
  const uniqueMap = new Map<string, SavedPaymentMethod>();
  for (const pm of paymentMethods) {
    if (pm.paymentMethodId && !uniqueMap.has(pm.paymentMethodId)) uniqueMap.set(pm.paymentMethodId, pm);
  }
  const cards = Array.from(uniqueMap.values());

  // Two "defaults" exist: the wallet default (pm.isDefault) and the card the
  // Stripe subscription actually charges (subscriptionDefaultPaymentMethodId).
  // With an active subscription the charged card wins; else fall back to the
  // wallet default so exactly one card is starred.
  const subscriptionCardKnown = Boolean(hasActiveSubscription) && Boolean(subscriptionDefaultPaymentMethodId);
  const isDefaultCard = (pm: SavedPaymentMethod) =>
    subscriptionCardKnown ? pm.paymentMethodId === subscriptionDefaultPaymentMethodId : pm.isDefault;

  const heroCard = cards.find(isDefaultCard) ?? cards[0];
  const heroFace = brandFace(heroCard?.card?.brand);

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-red-200/80 bg-red-50/60 p-4 dark:border-red-900/60 dark:bg-red-950/30">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" strokeWidth={2.25} />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-token bg-surface p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-b-2 border-red-600" />
          <p className="text-sm text-muted-token">Loading payment methods…</p>
        </div>
      ) : (
        <>
          {/* Hero card face — the default / charged card */}
          {heroCard && (
            <div
              className="relative overflow-hidden rounded-[1.25rem] p-5 text-white shadow-[0_18px_40px_-20px_rgba(0,0,0,.6)]"
              style={{ background: heroFace.bg }}
            >
              <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
              <div className="relative flex flex-col gap-[18px]">
                <div className="flex items-start justify-between">
                  <div className="relative h-7 w-10 overflow-hidden rounded-md bg-gradient-to-br from-yellow-300 to-yellow-600 shadow-inner">
                    <div className="absolute inset-1 grid grid-cols-3 grid-rows-3 gap-px">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} className="rounded-sm bg-yellow-700/30" />
                      ))}
                    </div>
                  </div>
                  {heroFace.mark}
                </div>
                <div className="flex items-center justify-between gap-1 font-mono text-lg tracking-[0.12em]">
                  <span>••••</span>
                  <span>••••</span>
                  <span>••••</span>
                  <span>{heroCard.card?.last4 ?? "••••"}</span>
                </div>
                <div className="flex items-end justify-between">
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/60">Card holder</p>
                    <p data-cs-mask className="truncate font-poppins text-sm font-bold tracking-wide">{cardholderName || "Cardholder"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/60">Expires</p>
                    <p className="font-poppins text-sm font-bold tracking-wider">{expLabel(heroCard.card)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Saved cards — radio rows */}
          {cards.length > 0 && (
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">Saved cards</p>
              <div className="space-y-2">
                {cards.map((pm) => {
                  const isDefault = isDefaultCard(pm);
                  const isDeleting = deletingId === pm.paymentMethodId;
                  return (
                    <div
                      key={pm.paymentMethodId}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border bg-surface p-3.5 shadow-sm transition-colors",
                        isDefault ? "border-emerald-500 ring-1 ring-emerald-500/30" : "border-token",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => !isDefault && onSetDefault(pm.paymentMethodId)}
                        disabled={isDefault || settingDefaultId !== null}
                        aria-label={isDefault ? "Default card" : "Set as default"}
                        className="shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-default"
                      >
                        <span
                          className={cn(
                            "grid h-5 w-5 place-items-center rounded-full border-2",
                            isDefault ? "border-emerald-500" : "border-black/25 dark:border-white/30",
                          )}
                        >
                          {isDefault && <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />}
                        </span>
                      </button>

                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-black/[.05] text-muted-token dark:bg-white/[.08]">
                        <CreditCard className="h-[18px] w-[18px]" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-primary-token dark:text-white">
                          {brandName(pm.card?.brand)} •••• {pm.card?.last4 ?? "••••"}
                        </p>
                        <p className="text-xs text-muted-token">
                          Expires {expLabel(pm.card)}
                          {isDefault ? " · Default" : ""}
                        </p>
                      </div>

                      {/*
                        Shown on EVERY card, including the default one. Hiding it on the
                        default made a member whose only card is the default unable to remove
                        it at all — there was no other row to reveal the action. The
                        consequences are handled by the confirmation dialog, which already
                        distinguishes simple / billing-reassign / billing-last
                        (`getPaymentMethodDeleteFlowKind`), and the API independently refuses
                        to drop a last billing card without `confirmBillingRisk`.
                      */}
                      <button
                        type="button"
                        onClick={() => onDelete(pm.paymentMethodId)}
                        disabled={isDeleting}
                        aria-label={`Remove ${brandName(pm.card?.brand)} ending ${pm.card?.last4 ?? ""}`}
                        className="shrink-0 text-xs font-semibold text-red-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-60 dark:text-red-500"
                      >
                        {isDeleting ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add a new card — reveals the Stripe Elements form */}
          {showAddForm ? (
            <div>{addForm}</div>
          ) : (
            <button
              type="button"
              onClick={onAddNew}
              disabled={isCreatingSetupIntent}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-token py-4 text-sm font-bold text-primary-token transition-colors hover:border-red-500 hover:bg-red-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-60 dark:text-white dark:hover:bg-red-950/20"
            >
              <Plus className="h-4 w-4" /> {isCreatingSetupIntent ? "Preparing…" : "Add a new card"}
            </button>
          )}

          {/* Encrypted footer */}
          <div className="flex items-start gap-2.5 rounded-2xl bg-black/[.04] px-4 py-3 dark:bg-white/[.05]">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-token" strokeWidth={2} />
            <p className="text-xs text-muted-token">Encrypted &amp; processed securely. We never store your full card number.</p>
          </div>
        </>
      )}
    </div>
  );
};

export default SettingsRedesignPayment;
