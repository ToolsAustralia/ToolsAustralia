"use client";

/**
 * Settings-page-only Claude redesign body for PaymentMethodsTab.
 *
 * PRESENTATIONAL ONLY. No hooks/fetch/business logic — every value/handler is
 * passed from the orchestrator (index.tsx), which keeps ALL Stripe wiring,
 * the `stripePromise` singleton, the add-form `<Elements>` block (passed in as
 * `addForm`) and the delete `ConfirmationModal`. Card set-default / delete call
 * the same handlers with the same disabled/loading state as the legacy body.
 * Modal-mode / SettingsModal never render this.
 */

import React from "react";
import { AlertTriangle, Plus, Star, Trash2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import {
  Card,
  SectionHeader,
  SettingsButton,
} from "@/app/(site)/my-account/components/settings/ui/primitives";
import type { SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";

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
  onAddNew: () => void;
  onSetDefault: (paymentMethodId: string) => void;
  onDelete: (paymentMethodId: string) => void;
}

const brandSkin = (
  brandRaw?: string,
): { bg: string; mark: React.ReactNode } => {
  const brand = (brandRaw ?? "").toLowerCase();
  if (brand === "visa") {
    return {
      bg: "bg-gradient-to-br from-[#1a1f71] via-[#0e1858] to-[#070b30]",
      mark: <span className="font-poppins font-black italic text-white text-xl tracking-tight">VISA</span>,
    };
  }
  if (brand === "mastercard") {
    return {
      bg: "bg-gradient-to-br from-[#1d1d1d] via-[#2a1a14] to-[#4a0d0d]",
      mark: (
        <div className="flex items-center -space-x-3">
          <span className="w-7 h-7 rounded-full bg-[#eb001b]" />
          <span className="w-7 h-7 rounded-full bg-[#f79e1b] mix-blend-screen" />
        </div>
      ),
    };
  }
  if (brand === "amex" || brand === "american express") {
    return {
      bg: "bg-gradient-to-br from-[#0a6896] via-[#0b4d77] to-[#062e49]",
      mark: <span className="font-poppins font-black text-white text-lg tracking-wider">AMEX</span>,
    };
  }
  return {
    bg: "bg-gradient-to-br from-neutral-700 via-neutral-800 to-neutral-900",
    mark: (
      <span className="font-poppins font-black text-white text-sm tracking-wider uppercase">
        {brandRaw || "Card"}
      </span>
    ),
  };
};

const SettingsRedesignPayment: React.FC<SettingsRedesignPaymentProps> = ({
  paymentMethods,
  subscriptionDefaultPaymentMethodId,
  loading,
  error,
  hasActiveSubscription,
  subscriptionStatus,
  showAddForm,
  isCreatingSetupIntent,
  settingDefaultId,
  deletingId,
  addForm,
  onAddNew,
  onSetDefault,
  onDelete,
}) => {
  // Dedup (mirror legacy safety net) — keep first occurrence per id.
  const uniqueMap = new Map<string, SavedPaymentMethod>();
  for (const pm of paymentMethods) {
    if (pm.paymentMethodId && !uniqueMap.has(pm.paymentMethodId)) {
      uniqueMap.set(pm.paymentMethodId, pm);
    }
  }
  const cards = Array.from(uniqueMap.values());

  return (
    <div className="space-y-6">
      <SectionHeader
        title="My wallet"
        description="The card with the star is charged for your subscription."
        icon={ShieldCheck}
        accent="red"
      />

      {hasActiveSubscription && (
        <Card className="border-sky-200/80 dark:border-sky-900/60 bg-sky-50/60 dark:bg-sky-950/30 p-4 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" strokeWidth={2} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-sky-900 dark:text-sky-200">Active subscription</p>
            <p className="text-xs text-sky-700 dark:text-sky-300 mt-0.5">
              Your subscription is {subscriptionStatus === "active" ? "active" : subscriptionStatus}. The
              starred card is used for future payments — set a different card as default to change it.
            </p>
          </div>
        </Card>
      )}

      {error && (
        <Card className="border-red-200/80 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/30 p-4 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" strokeWidth={2.25} />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </Card>
      )}

      {loading && (
        <Card className="p-8 text-center">
          <div className="w-8 h-8 mx-auto mb-3 rounded-full border-b-2 border-red-600 animate-spin" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading payment methods…</p>
        </Card>
      )}

      {/* Add-form (Stripe Elements) is built in index.tsx and passed through */}
      {!loading && showAddForm && addForm}

      {!loading && !showAddForm && cards.length === 0 && (
        <Card className="p-6 sm:p-10 text-center border-dashed border-neutral-300 dark:border-neutral-700">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 flex items-center justify-center mb-4">
            <Plus className="w-7 h-7" strokeWidth={1.5} />
          </div>
          <p className="font-poppins font-bold text-base text-neutral-900 dark:text-white">
            No cards saved yet
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm mx-auto">
            Add a card to manage your subscription and future payments.
          </p>
          <SettingsButton
            variant="primary"
            icon={Plus}
            className="mt-5"
            onClick={onAddNew}
            disabled={isCreatingSetupIntent}
          >
            {isCreatingSetupIntent ? "Preparing…" : "Add card"}
          </SettingsButton>
        </Card>
      )}

      {!loading && !showAddForm && cards.length > 0 && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((pm) => {
              const meta = pm.card;
              const skin = brandSkin(meta?.brand);
              const isDefault =
                pm.isDefault || pm.paymentMethodId === subscriptionDefaultPaymentMethodId;
              const isSettingDefault = settingDefaultId === pm.paymentMethodId;
              const isDeleting = deletingId === pm.paymentMethodId;
              return (
                <div
                  key={pm.paymentMethodId}
                  className={`group relative rounded-2xl overflow-hidden text-white shadow-lift dark:shadow-lift-dark ${skin.bg} ${
                    isDefault
                      ? "ring-2 ring-red-600 ring-offset-2 ring-offset-white dark:ring-offset-neutral-950"
                      : ""
                  }`}
                  style={{ aspectRatio: "1.586 / 1" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                  <div className="relative h-full p-5 flex flex-col justify-between">
                    <div className="flex items-start justify-between">
                      <div className="w-10 h-7 rounded-md bg-gradient-to-br from-yellow-300 to-yellow-600 relative overflow-hidden shadow-inner">
                        <div className="absolute inset-1 grid grid-cols-3 grid-rows-3 gap-px">
                          {Array.from({ length: 9 }).map((_, i) => (
                            <div key={i} className="bg-yellow-700/30 rounded-sm" />
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {skin.mark}
                        {isDefault && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur text-[10px] font-bold tracking-wider uppercase">
                            <Star className="w-2.5 h-2.5" strokeWidth={2.5} /> Default
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="font-mono text-lg sm:text-xl tracking-[0.18em] mt-2">
                      •••• •••• •••• {meta?.last4 ?? "••••"}
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-[9px] font-bold tracking-[0.18em] uppercase text-white/60">
                          Expires
                        </p>
                        <p className="font-poppins font-bold text-sm tracking-wider">
                          {meta ? `${String(meta.expMonth).padStart(2, "0")}/${String(meta.expYear).slice(-2)}` : "––/––"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-3 flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition bg-gradient-to-t from-black/50 to-transparent">
                    {!isDefault && (
                      <button
                        type="button"
                        onClick={() => onSetDefault(pm.paymentMethodId)}
                        disabled={settingDefaultId !== null}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur text-white text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Star className="w-3 h-3" strokeWidth={2.5} />
                        {isSettingDefault ? "Setting…" : "Set default"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDelete(pm.paymentMethodId)}
                      disabled={isDeleting}
                      aria-label="Remove card"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/15 hover:bg-red-500 backdrop-blur text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Add-card slot */}
            <button
              type="button"
              onClick={onAddNew}
              disabled={isCreatingSetupIntent}
              className="group relative rounded-2xl border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-red-500 dark:hover:border-red-500 hover:bg-red-50/40 dark:hover:bg-red-950/20 transition-all flex flex-col items-center justify-center text-center p-6 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ aspectRatio: "1.586 / 1" }}
            >
              <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-neutral-800 group-hover:bg-red-600 group-hover:text-white text-neutral-500 dark:text-neutral-400 flex items-center justify-center transition">
                <Plus className="w-5 h-5" strokeWidth={2.5} />
              </div>
              <p className="mt-3 font-poppins font-bold text-sm text-neutral-700 dark:text-neutral-300 group-hover:text-red-600 dark:group-hover:text-red-400 transition">
                {isCreatingSetupIntent ? "Preparing…" : "Add new card"}
              </p>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                Visa, Mastercard, Amex
              </p>
            </button>
          </div>

          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/50 px-4 py-3 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0 mt-0.5" strokeWidth={2} />
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Cards are tokenized and stored securely by Stripe — we only keep payment-method
              references. Removing a card detaches it from your account.{" "}
              <Link
                href="/privacy"
                className="text-red-600 dark:text-red-400 font-semibold underline underline-offset-2"
              >
                Privacy Policy
              </Link>
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default SettingsRedesignPayment;
