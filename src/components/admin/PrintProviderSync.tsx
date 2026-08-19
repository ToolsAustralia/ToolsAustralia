"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudDownload, Loader2, RefreshCw } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * Pull garments from the print provider into the catalogue.
 *
 * Sits ABOVE the catalogue because it is where a merch product comes from: the
 * garment is designed in their portal, then pulled in here rather than retyped.
 *
 * A sync deliberately never sets price, entries, category or active state — those
 * are commercial decisions, and a sync that reverted a price change would be a
 * silent revenue bug. So a newly pulled product lands inactive at $0 and the
 * panel says so, because otherwise it looks broken in the catalogue below.
 *
 * The provider's own product ids never reach this component. They may embed the
 * account uid, so the API returns names only and a re-sync is addressed by our
 * own stable platformProductId.
 */

interface ProviderProduct {
  name: string;
  synced: boolean;
  productId: string | null;
  platformProductId: string | null;
  syncedAt: string | null;
  isActive: boolean | null;
  price: number | null;
}

interface SyncResult {
  productId: string;
  name: string;
  created: boolean;
  variants: number;
  colourways: number;
  imagesMirrored: number;
  imagesFailed: number;
  imagesReused: number;
  uncreatedColours: string[];
}

export default function PrintProviderSync() {
  const { has } = usePermissions();
  const canEdit = has("shop.edit");

  const [products, setProducts] = useState<ProviderProduct[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [results, setResults] = useState<SyncResult[] | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/shop/print-provider");
      const body = await res.json();
      if (!res.ok || !body?.success) {
        throw new Error(body?.error || "Could not reach the print provider");
      }
      setProducts(body.products ?? []);
      setFeedback(null);
    } catch (error) {
      setProducts(null);
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Could not reach the print provider",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runSync = async (payload: { platformProductId?: string; all?: boolean }, label: string) => {
    setSyncing(label);
    setResults(null);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/shop/print-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok || !body?.success) throw new Error(body?.error || "Sync failed");

      const synced: SyncResult[] = body.results ?? [];
      setResults(synced);
      const created = synced.filter((r) => r.created).length;
      setFeedback({
        type: "success",
        message:
          created > 0
            ? `${created} new product${created === 1 ? "" : "s"} pulled in. Set a price and switch them live below.`
            : `${synced.length} product${synced.length === 1 ? "" : "s"} refreshed. Prices and live status were left as they are.`,
      });
      await load();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Sync failed",
      });
    } finally {
      setSyncing(null);
    }
  };

  const busy = syncing !== null;

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-none">
      <div className="border-b border-gray-200 p-4 dark:border-neutral-700 sm:p-6">
        <div className="flex items-start justify-between gap-3 sm:items-center">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white sm:text-xl">
              <CloudDownload className="h-5 w-5 text-red-600 dark:text-red-400" />
              Pull from printer
            </h3>
            <p className="mt-1 text-xs text-gray-600 dark:text-neutral-400 sm:text-sm">
              Garments designed in the print provider&apos;s portal, with every colour mockup
              copied to our own image host. Prices and live status stay yours.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => void load()}
              disabled={isLoading || busy}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Refresh
            </button>
            {canEdit && (products?.length ?? 0) > 0 && (
              <button
                onClick={() => void runSync({ all: true }, "__all__")}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {syncing === "__all__" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Sync all
              </button>
            )}
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`mx-4 mt-4 rounded-lg border p-3 text-sm sm:mx-6 ${
            feedback.type === "success"
              ? "border-green-300 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-300"
              : "border-red-300 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {busy && (
        <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 sm:mx-6">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          <span>
            Copying every colour mockup across. A first sync of a 51-colour garment moves about
            150 images and can take a couple of minutes — leave this tab open.
          </span>
        </div>
      )}

      <div className="p-4 sm:p-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Asking the printer what it has…
          </div>
        ) : !products || products.length === 0 ? (
          <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-neutral-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>
              Nothing visible. Only products with a design attached in the portal can be read
              through their API — a product with no linked design is invisible to us.
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {products.map((product) => (
              <div
                key={product.name}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-neutral-700"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900 dark:text-white">
                    {product.name}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-600 dark:text-neutral-400">
                    {product.synced ? (
                      <>
                        {product.isActive ? (
                          <span className="font-semibold text-green-700 dark:text-green-400">
                            Live
                          </span>
                        ) : (
                          <span className="font-semibold text-amber-700 dark:text-amber-400">
                            Not live yet
                          </span>
                        )}
                        {" · "}
                        {product.price ? `$${product.price.toFixed(2)}` : "no price set"}
                        {product.syncedAt
                          ? ` · synced ${new Date(product.syncedAt).toLocaleDateString("en-AU", {
                              day: "numeric",
                              month: "short",
                            })}`
                          : ""}
                      </>
                    ) : (
                      "Not in the catalogue yet"
                    )}
                  </p>
                </div>

                {canEdit && (
                  <button
                    onClick={() =>
                      void runSync(
                        product.platformProductId
                          ? { platformProductId: product.platformProductId }
                          : { all: true },
                        product.name
                      )
                    }
                    disabled={busy}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    {syncing === product.name ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {product.synced ? "Re-sync" : "Sync"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {results && results.length > 0 && (
          <div className="mt-4 space-y-3 border-t border-gray-200 pt-4 dark:border-neutral-700">
            {results.map((result) => (
              <div key={result.productId} className="text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-gray-900 dark:text-white">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  {result.name}
                </p>
                <p className="mt-1 text-xs text-gray-600 dark:text-neutral-400">
                  {result.variants} variants · {result.colourways} colours ·{" "}
                  {result.imagesMirrored} image{result.imagesMirrored === 1 ? "" : "s"} copied
                  {result.imagesReused > 0 ? `, ${result.imagesReused} already held` : ""}
                  {result.imagesFailed > 0 ? (
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      , {result.imagesFailed} failed
                    </span>
                  ) : (
                    ""
                  )}
                </p>
                {/* Colours the blank offers that no variant exists for. Not an error —
                    it is the list of colours still to be built in the portal. */}
                {result.uncreatedColours.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-neutral-500">
                    <span className="font-semibold">
                      {result.uncreatedColours.length} colour
                      {result.uncreatedColours.length === 1 ? "" : "s"} not created yet:
                    </span>{" "}
                    {result.uncreatedColours.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
