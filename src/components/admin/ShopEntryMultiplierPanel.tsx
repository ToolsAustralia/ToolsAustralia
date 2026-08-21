"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Gauge, Loader2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import SelectMenu, { type SelectMenuOption } from "@/components/ui/SelectMenu";

/**
 * The merchandise entry multiplier, at three tiers.
 *
 * Most specific wins, and each tier is an absolute RATE — not a ceiling on some
 * other number:
 *
 *     product  ->  category  ->  whole shop  ->  1x
 *
 * So a product set to 3x gives 3x even when the shop-wide value is 10x, and one
 * set to 10x gives 10x even when the shop-wide value is 2x. Blank at a tier means
 * "no opinion" and falls through to the next; blank everywhere means 1x.
 *
 * THIS COPY WAS WRONG UNTIL 2026-08-21. The panel described a ceiling model
 * (`min(promo, ceiling)`, "can never lift merchandise above the packs") that the
 * resolver has never implemented — see utils/shop/entry-multiplier.ts, which
 * returns the most specific value unchanged and applies no min() anywhere. An
 * admin trusting the old copy would set a "harmless ceiling" of 10 and get a live
 * 10x rate.
 *
 * All three tiers save on ONE button, through one endpoint. Saving them
 * separately would let a page show a value that only partly landed.
 *
 * Categories and products are OFFERED, never typed. `Product.category` is free
 * text with no enum, and the catalogue already holds "Apparel" beside
 * "power-tools" — a hand-typed key would silently match nothing.
 */

interface CategoryOption {
  key: string;
  label: string;
}

interface ProductRow {
  id: string;
  name: string;
  category: string;
  multiplier: number | null;
}

interface ConfigResponse {
  multiplier: number | null;
  categoryMultipliers: Record<string, number>;
  categories: CategoryOption[];
  products: ProductRow[];
  updatedAt: string | null;
}

/** Blank = no opinion at this tier; falls through. Strings so a field can be cleared. */
interface Draft {
  multiplier: string;
  categoryMultipliers: Record<string, string>;
  productMultipliers: Record<string, string>;
}

/**
 * "" is the inherit option, and it must come first: it is the default state
 * and the one an admin reaches for to undo a mistake.
 */
const CAP_OPTIONS: SelectMenuOption[] = [
  { value: "", label: "Inherit" },
  ...Array.from({ length: 10 }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1}×`,
  })),
];

function toDraft(config: ConfigResponse): Draft {
  return {
    multiplier: config.multiplier == null ? "" : String(config.multiplier),
    categoryMultipliers: Object.fromEntries(
      config.categories.map((c) => [
        c.key,
        config.categoryMultipliers[c.key] == null ? "" : String(config.categoryMultipliers[c.key]),
      ])
    ),
    productMultipliers: Object.fromEntries(
      config.products.map((p) => [p.id, p.multiplier == null ? "" : String(p.multiplier)])
    ),
  };
}

/** Blank string -> null, so the API clears the row rather than skipping it. */
const toValue = (raw: string) => (raw.trim() === "" ? null : Number(raw));

export default function ShopEntryMultiplierPanel() {
  const { has } = usePermissions();
  const canEdit = has("shop.edit");

  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [draft, setDraft] = useState<Draft>({ multiplier: "", categoryMultipliers: {}, productMultipliers: {} });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/shop/entry-multiplier");
      const body = await res.json();
      if (!res.ok || !body?.success) throw new Error(body?.error || "Could not load the settings");
      setConfig(body.data);
      setDraft(toDraft(body.data));
      setFeedback(null);
    } catch (error) {
      setConfig(null);
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Could not load the settings",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/shop/entry-multiplier", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // MUST be the key `multiplier`. The route's Zod schema requires it and
          // strips unknown keys, so the old `cap` key made EVERY save 400 — and
          // because res.json() is untyped and this is an object literal, tsc could
          // not see it. The panel had never successfully saved anything.
          multiplier: toValue(draft.multiplier),
          categoryMultipliers: Object.fromEntries(
            Object.entries(draft.categoryMultipliers).map(([k, v]) => [k, toValue(v)])
          ),
          productMultipliers: Object.fromEntries(
            Object.entries(draft.productMultipliers).map(([k, v]) => [k, toValue(v)])
          ),
        }),
      });
      const body = await res.json();
      if (!res.ok || !body?.success) throw new Error(body?.error || "Could not save");
      setFeedback({ type: "success", message: "Ceilings saved." });
      await load();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Could not save",
      });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * SelectMenu has no `disabled` prop, so a read-only admin gets the resolved
   * text instead of an inert-looking control — which reads better than a dropdown
   * that silently does nothing.
   */
  const multiplierControl = (id: string, value: string, onChange: (next: string) => void) =>
    canEdit && !isSaving ? (
      <SelectMenu
        id={id}
        value={value}
        onChange={onChange}
        options={CAP_OPTIONS}
        className="w-36"
      />
    ) : (
      <span className="w-36 text-sm text-gray-600 dark:text-neutral-400">
        {value === "" ? "Inherit" : `${value}×`}
      </span>
    );

  const row = (
    key: string,
    label: string,
    sub: string | null,
    value: string,
    onChange: (next: string) => void
  ) => (
    <li key={key} className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm text-gray-800 dark:text-neutral-200">{label}</p>
        {sub && <p className="truncate text-xs text-gray-500 dark:text-neutral-500">{sub}</p>}
      </div>
      {multiplierControl(`multiplier-${key}`, value, onChange)}
    </li>
  );

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-none">
      <div className="border-b border-gray-200 p-4 dark:border-neutral-700 sm:p-6">
        <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white sm:text-xl">
          <Gauge className="h-5 w-5 text-red-600 dark:text-red-400" />
          Shop entry multiplier
        </h3>
        <p className="mt-1 text-xs text-gray-600 dark:text-neutral-400 sm:text-sm">
          How many free entries a merchandise line gives, as a multiple of the item&apos;s own
          included count.{" "}
          <strong className="font-semibold">Most specific wins:</strong> a product value beats its
          category, which beats the shop-wide one. Blank means inherit; blank everywhere means 1×.
        </p>
      </div>

      <div className="p-4 sm:p-6">
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-gray-600 dark:text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </p>
        ) : config ? (
          <div className="space-y-6">
            {/* Broadest first, so the page reads the way the fallback chain resolves. */}
            <section>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-neutral-700">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Whole shop</p>
                  <p className="text-xs text-gray-600 dark:text-neutral-400">
                    Applies wherever no category or product value is set.
                  </p>
                </div>
                {multiplierControl("multiplier-shop", draft.multiplier, (next) =>
                  setDraft((d) => ({ ...d, multiplier: next }))
                )}
              </div>
            </section>

            <section>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">By category</p>
              {config.categories.length === 0 ? (
                <p className="mt-1 text-xs text-gray-600 dark:text-neutral-400">
                  No categories in the catalogue yet.
                </p>
              ) : (
                <ul className="mt-1 divide-y divide-gray-200 dark:divide-neutral-700">
                  {config.categories.map((c) =>
                    row(c.key, c.label, null, draft.categoryMultipliers[c.key] ?? "", (next) =>
                      setDraft((d) => ({
                        ...d,
                        categoryMultipliers: { ...d.categoryMultipliers, [c.key]: next },
                      }))
                    )
                  )}
                </ul>
              )}
            </section>

            <section>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">By product</p>
              <p className="text-xs text-gray-600 dark:text-neutral-400">
                The same field also sits on each product&apos;s edit form — this list is here so you
                can see every multiplier at once.
              </p>
              {config.products.length === 0 ? (
                <p className="mt-1 text-xs text-gray-600 dark:text-neutral-400">
                  No products in the catalogue yet.
                </p>
              ) : (
                <ul className="mt-1 divide-y divide-gray-200 dark:divide-neutral-700">
                  {config.products.map((p) =>
                    row(p.id, p.name, p.category || "Uncategorised", draft.productMultipliers[p.id] ?? "", (next) =>
                      setDraft((d) => ({
                        ...d,
                        productMultipliers: { ...d.productMultipliers, [p.id]: next },
                      }))
                    )
                  )}
                </ul>
              )}
            </section>

            {canEdit && (
              <button
                onClick={() => void save()}
                disabled={isSaving}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isSaving ? "Saving…" : "Save multipliers"}
              </button>
            )}
          </div>
        ) : null}

        {feedback && (
          <p
            className={`mt-4 flex items-start gap-2 text-sm ${
              feedback.type === "success"
                ? "text-green-700 dark:text-green-400"
                : "text-red-700 dark:text-red-400"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            {feedback.message}
          </p>
        )}
      </div>
    </div>
  );
}
