"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search, Users } from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent, Input, Button } from "@/components/modals/ui";
import Dropdown from "@/components/modals/ui/Dropdown";
import { AUSTRALIAN_STATES } from "@/data/australianStates";
import { formatDisplayName } from "@/utils/display-name";
import { cn } from "@/utils/cn";

export type RedeemableTierId = "tradie-subscription" | "foreman-subscription" | "boss-subscription";

export interface CampaignTargetingSegmentPersisted {
  states?: string[];
  membershipTiers?: RedeemableTierId[];
  topEntriesPercent?: number;
  requiresEmailVerified: boolean;
  minInactiveDays?: number;
  maxInactiveDays?: number;
}

export interface CampaignTargetingConfirmPayload {
  includeUserIds: string[];
  segmentConfig: CampaignTargetingSegmentPersisted;
}

interface FilterUserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  state?: string;
  subscription: {
    packageId: string;
    packageName: string | null;
    isActive: boolean;
    status: string;
  } | null;
  majorDrawEntries: number;
}

const SUBSCRIPTION_STATUS_OPTIONS = [
  { value: "active", label: "Active subscription" },
  { value: "inactive", label: "Inactive / no subscription" },
  { value: "any", label: "Any (account active)" },
];

const TIER_OPTIONS: { id: RedeemableTierId; label: string; className: string }[] = [
  {
    id: "tradie-subscription",
    label: "Tradie",
    className: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  },
  {
    id: "foreman-subscription",
    label: "Foreman",
    className: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  },
  {
    id: "boss-subscription",
    label: "Boss",
    className: "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  },
];

/** Stable fallback when parent omits `initialIncludeUserIds` — avoids new [] each render breaking useEffect deps. */
const EMPTY_USER_IDS: string[] = [];

function tierBadgeClass(packageId: string | undefined): string {
  if (packageId === "tradie-subscription") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200";
  if (packageId === "foreman-subscription") return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
  if (packageId === "boss-subscription") return "bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200";
  return "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-300";
}

interface CampaignTargetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: CampaignTargetingConfirmPayload) => void;
  /** Existing segment fields from the parent form (inactive days, etc.) */
  parentSegmentDefaults?: Partial<CampaignTargetingSegmentPersisted>;
  initialIncludeUserIds?: string[];
  initialPersistedSegment?: Partial<CampaignTargetingSegmentPersisted>;
}

export default function CampaignTargetingModal({
  isOpen,
  onClose,
  onConfirm,
  parentSegmentDefaults,
  initialIncludeUserIds,
  initialPersistedSegment,
}: CampaignTargetingModalProps) {
  const resolvedInitialUserIds = initialIncludeUserIds ?? EMPTY_USER_IDS;
  const [subscriptionStatus, setSubscriptionStatus] = useState<"active" | "inactive" | "any">("active");
  const [selectedTiers, setSelectedTiers] = useState<Set<RedeemableTierId>>(new Set());
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [statesOpen, setStatesOpen] = useState(false);
  const statesRef = useRef<HTMLDivElement>(null);
  const [requiresEmailVerified, setRequiresEmailVerified] = useState(true);
  const [topPercent, setTopPercent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [previewUsers, setPreviewUsers] = useState<FilterUserRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewWarning, setPreviewWarning] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    totalCount: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
    limit: 25,
  });

  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [addingAllMatching, setAddingAllMatching] = useState(false);

  const tierListForApi = useMemo(() => Array.from(selectedTiers), [selectedTiers]);

  /** Shared filter fields for preview + bulk id fetch */
  const getFilterPayloadBase = useCallback(():
    | { ok: false; error: string }
    | {
        ok: true;
        payload: {
          subscriptionStatus: "active" | "inactive" | "any";
          membershipTiers?: RedeemableTierId[];
          states?: string[];
          requiresEmailVerified: boolean;
          topEntriesPercent?: number;
          searchQuery?: string;
        };
      } => {
    const topN = topPercent.trim() ? Number(topPercent) : undefined;
    if (topPercent.trim() && (Number.isNaN(topN!) || topN! < 1 || topN! > 100)) {
      return { ok: false, error: "Top % must be between 1 and 100" };
    }
    return {
      ok: true,
      payload: {
        subscriptionStatus,
        membershipTiers: tierListForApi.length ? tierListForApi : undefined,
        states: selectedStates.length ? selectedStates : undefined,
        requiresEmailVerified,
        topEntriesPercent: topN,
        searchQuery: searchQuery.trim() || undefined,
      },
    };
  }, [subscriptionStatus, tierListForApi, selectedStates, requiresEmailVerified, topPercent, searchQuery]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (statesRef.current && !statesRef.current.contains(e.target as Node)) setStatesOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const resetFromProps = useCallback(() => {
    setSubscriptionStatus("active");
    setSelectedTiers(new Set((initialPersistedSegment?.membershipTiers as RedeemableTierId[] | undefined) ?? []));
    setSelectedStates(initialPersistedSegment?.states ?? []);
    setRequiresEmailVerified(initialPersistedSegment?.requiresEmailVerified ?? parentSegmentDefaults?.requiresEmailVerified ?? true);
    setTopPercent(
      typeof initialPersistedSegment?.topEntriesPercent === "number"
        ? String(initialPersistedSegment.topEntriesPercent)
        : ""
    );
    setSearchQuery("");
    setPreviewUsers([]);
    setPreviewError(null);
    setPreviewWarning(null);
    setPage(1);
    setPagination((p) => ({ ...p, totalCount: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false }));
    setSelectedUserIds(new Set(resolvedInitialUserIds.map(String)));
  }, [resolvedInitialUserIds, initialPersistedSegment, parentSegmentDefaults?.requiresEmailVerified]);

  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      resetFromProps();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, resetFromProps]);

  const fetchPreview = useCallback(
    async (pageNum: number) => {
      setPreviewLoading(true);
      setPreviewError(null);
      setPreviewWarning(null);
      try {
        const base = getFilterPayloadBase();
        if (!base.ok) {
          setPreviewError(base.error);
          setPreviewLoading(false);
          return;
        }

        const body = {
          ...base.payload,
          page: pageNum,
          limit: 25,
        };

        const res = await fetch("/api/admin/monthly-coupon/target-users/filter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || "Preview failed");
        }
        setPreviewUsers(data.data.users || []);
        setPagination({
          totalCount: data.data.pagination?.totalCount ?? 0,
          totalPages: data.data.pagination?.totalPages ?? 0,
          hasNextPage: Boolean(data.data.pagination?.hasNextPage),
          hasPrevPage: Boolean(data.data.pagination?.hasPrevPage),
          limit: data.data.pagination?.limit ?? 25,
        });
        if (data.data.warning) setPreviewWarning(data.data.warning);
      } catch (e) {
        setPreviewError(e instanceof Error ? e.message : "Preview failed");
        setPreviewUsers([]);
      } finally {
        setPreviewLoading(false);
      }
    },
    [getFilterPayloadBase]
  );

  const addAllMatchingToSelection = useCallback(async () => {
    const base = getFilterPayloadBase();
    if (!base.ok) {
      setPreviewError(base.error);
      return;
    }
    setAddingAllMatching(true);
    setPreviewError(null);
    try {
      const res = await fetch("/api/admin/monthly-coupon/target-users/filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...base.payload,
          returnMatchingUserIds: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to load all matching users");
      }
      const ids: string[] = data.data.userIds || [];
      setSelectedUserIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) {
          next.add(id);
        }
        return next;
      });
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Failed to add all matching users");
    } finally {
      setAddingAllMatching(false);
    }
  }, [getFilterPayloadBase]);

  const handlePreviewAudience = () => {
    setPage(1);
    void fetchPreview(1);
  };

  const toggleTier = (id: RedeemableTierId) => {
    setSelectedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleStateCode = (code: string) => {
    setSelectedStates((prev) => {
      const set = new Set(prev);
      if (set.has(code)) set.delete(code);
      else set.add(code);
      return Array.from(set).sort();
    });
  };

  const toggleUserSelected = (id: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      previewUsers.forEach((u) => next.add(u.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedUserIds(new Set());

  const handleConfirm = () => {
    const topN = topPercent.trim() ? Number(topPercent) : undefined;
    const segmentConfig: CampaignTargetingSegmentPersisted = {
      requiresEmailVerified,
      states: selectedStates.length ? selectedStates : undefined,
      membershipTiers: tierListForApi.length ? tierListForApi : undefined,
      topEntriesPercent: typeof topN === "number" && !Number.isNaN(topN) ? topN : undefined,
      minInactiveDays: parentSegmentDefaults?.minInactiveDays,
      maxInactiveDays: parentSegmentDefaults?.maxInactiveDays,
    };
    onConfirm({
      includeUserIds: Array.from(selectedUserIds),
      segmentConfig,
    });
    onClose();
  };

  const statesSummary =
    selectedStates.length === 0 ? "States" : selectedStates.length === 1 ? selectedStates[0]! : `${selectedStates.length} states`;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="fixed" nested>
      <ModalHeader
        title="Configure campaign audience"
        subtitle="Filter by tier, state, email verification, and top major-draw entry %. Select users to pin (always included when targeting uses this audience)."
        onClose={onClose}
        showLogo={false}
      />
      <ModalContent
        padding="none"
        scrollbar="none"
        className="!overflow-hidden flex flex-col min-h-0 flex-1"
      >
        <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-neutral-800 space-y-4 shrink-0 max-h-[min(42dvh,340px)] sm:max-h-[min(46dvh,400px)] md:max-h-[min(52dvh,480px)] overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Dropdown
              label="Subscription"
              options={SUBSCRIPTION_STATUS_OPTIONS}
              value={subscriptionStatus}
              onChange={(v) => setSubscriptionStatus(v as "active" | "inactive" | "any")}
            />
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-gray-600 dark:text-neutral-400">Membership tier</span>
              <div className="flex flex-wrap gap-2">
                {TIER_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTier(t.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                      selectedTiers.has(t.id) ? t.className + " ring-2 ring-red-500/60" : "border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-600 dark:text-neutral-300"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div ref={statesRef} className="relative">
              <span className="text-xs font-medium text-gray-600 dark:text-neutral-400 block mb-1">State / territory</span>
              <button
                type="button"
                onClick={() => setStatesOpen((o) => !o)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-sm text-gray-800 dark:text-neutral-100"
              >
                {statesSummary}
                <ChevronDown className={cn("w-4 h-4 shrink-0 transition", statesOpen ? "rotate-180" : "")} />
              </button>
              {statesOpen && (
                <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg py-1">
                  {AUSTRALIAN_STATES.map((s) => (
                    <label
                      key={s.code}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-neutral-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedStates.includes(s.code)}
                        onChange={() => toggleStateCode(s.code)}
                      />
                      <span>
                        {s.code} — {s.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
            <label className="flex items-center gap-2 h-11 px-3 rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-sm text-gray-800 dark:text-neutral-200">
              <input
                type="checkbox"
                checked={requiresEmailVerified}
                onChange={(e) => setRequiresEmailVerified(e.target.checked)}
              />
              Email verified only
            </label>
            <Input
              type="number"
              min={1}
              max={100}
              value={topPercent}
              onChange={(e) => setTopPercent(e.target.value)}
              placeholder="Top % major draw entries (optional)"
            />
            <div className="flex gap-2">
              <Button type="button" variant="primary" size="md" className="flex-1" onClick={handlePreviewAudience} disabled={previewLoading}>
                {previewLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Loading…
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4 mr-2" />
                    Preview audience
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="relative">
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name or email (updates list when previewed)"
              icon={Search}
            />
          </div>

          {previewError && (
            <div className="text-sm text-red-700 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-md px-3 py-2">
              {previewError}
            </div>
          )}
          {previewWarning && (
            <div className="text-sm text-amber-800 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded-md px-3 py-2">
              {previewWarning}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="text-gray-700 dark:text-neutral-300">
              <strong>{selectedUserIds.size}</strong> user{selectedUserIds.size !== 1 ? "s" : ""} pinned
            </span>
            <button
              type="button"
              onClick={selectAllVisible}
              className="text-red-600 dark:text-red-400 font-medium hover:underline disabled:opacity-40 disabled:no-underline"
              disabled={!previewUsers.length || previewLoading || addingAllMatching}
            >
              Add visible page
            </button>
            <button
              type="button"
              onClick={() => void addAllMatchingToSelection()}
              className="text-red-600 dark:text-red-400 font-medium hover:underline disabled:opacity-40 disabled:no-underline inline-flex items-center gap-1.5"
              disabled={previewLoading || addingAllMatching}
            >
              {addingAllMatching ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Adding all…
                </>
              ) : (
                <>
                  Add all matching
                  {pagination.totalCount > 0 ? (
                    <span className="text-gray-500 dark:text-neutral-500 font-normal tabular-nums">
                      ({pagination.totalCount.toLocaleString()})
                    </span>
                  ) : null}
                </>
              )}
            </button>
            <button type="button" onClick={clearSelection} className="text-gray-600 dark:text-neutral-400 hover:underline">
              Clear all pins
            </button>
          </div>
          {pagination.totalCount === 0 && !previewLoading && previewUsers.length === 0 && (
            <p className="text-xs text-gray-500 dark:text-neutral-500">
              Run <strong>Preview audience</strong> first to see the match count, or use <strong>Add all matching</strong> to pin everyone who fits the current filters.
            </p>
          )}
        </div>

        <div className="flex min-h-[28dvh] flex-1 flex-col overflow-hidden">
          <div className="px-4 sm:px-5 pt-2 pb-1 shrink-0">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">
              Audience preview
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-5 pb-2 overscroll-contain touch-pan-y">
          {!previewUsers.length && !previewLoading && (
            <div className="py-8 sm:py-12 text-center text-gray-500 dark:text-neutral-400 text-sm">
              Set filters and click <strong>Preview audience</strong> to load users.
            </div>
          )}
          {previewUsers.length > 0 && (
            <ul className="space-y-2">
              {previewUsers.map((u) => (
                <li
                  key={u.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedUserIds.has(u.id)
                      ? "border-red-500 bg-red-50/80 dark:bg-red-950/20"
                      : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/50 hover:border-gray-300"
                  }`}
                  onClick={() => toggleUserSelected(u.id)}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedUserIds.has(u.id)}
                    onChange={() => toggleUserSelected(u.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {formatDisplayName(u.firstName, u.lastName)}
                      </span>
                      {u.subscription?.packageId && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tierBadgeClass(u.subscription.packageId)}`}>
                          {u.subscription.packageName || u.subscription.packageId}
                        </span>
                      )}
                      <span className="text-xs text-gray-500 dark:text-neutral-400">{u.state || "—"}</span>
                      <span className="text-xs text-gray-500 dark:text-neutral-400 tabular-nums">
                        Draw entries: {u.majorDrawEntries}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-neutral-400 truncate">{u.email}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          </div>

        {pagination.totalPages > 1 && (
          <div className="flex shrink-0 items-center justify-center gap-3 py-2 border-t border-gray-200 dark:border-neutral-800 px-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!pagination.hasPrevPage || previewLoading}
              onClick={() => {
                const next = Math.max(1, page - 1);
                setPage(next);
                void fetchPreview(next);
              }}
            >
              Previous
            </Button>
            <span className="text-xs text-gray-600 dark:text-neutral-400">
              Page {page} / {pagination.totalPages} ({pagination.totalCount.toLocaleString()} users)
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!pagination.hasNextPage || previewLoading}
              onClick={() => {
                const next = page + 1;
                setPage(next);
                void fetchPreview(next);
              }}
            >
              Next
            </Button>
          </div>
        )}
        </div>

        <div className="flex shrink-0 flex-col-reverse sm:flex-row gap-2 sm:justify-end px-4 sm:px-5 py-3 border-t border-gray-200 dark:border-neutral-800 bg-gray-50/80 dark:bg-neutral-950/80">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={handleConfirm}>
            Save audience ({selectedUserIds.size} pinned)
          </Button>
        </div>
      </ModalContent>
    </ModalContainer>
  );
}
