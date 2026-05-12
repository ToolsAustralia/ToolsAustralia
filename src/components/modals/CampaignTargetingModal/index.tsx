"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModalContainer, ModalHeader, ModalContent } from "@/components/modals/ui";
import SubscriptionStatusFilter from "./SubscriptionStatusFilter";
import TierMultiSelect from "./TierMultiSelect";
import StatesMultiSelect from "./StatesMultiSelect";
import TopPercentEmailVerifiedControls from "./TopPercentEmailVerifiedControls";
import UserSearchInput from "./UserSearchInput";
import SelectionToolbar from "./SelectionToolbar";
import PreviewList from "./PreviewList";
import PaginationControls from "./PaginationControls";
import Footer from "./Footer";
import type {
  CampaignTargetingConfirmPayload,
  CampaignTargetingSegmentPersisted,
  FilterUserRow,
  PaginationState,
  RedeemableTierId,
  SubscriptionStatusValue,
} from "./types";

export type { RedeemableTierId, CampaignTargetingSegmentPersisted, CampaignTargetingConfirmPayload } from "./types";

/** Stable fallback when parent omits `initialIncludeUserIds` — avoids new [] each render breaking useEffect deps. */
const EMPTY_USER_IDS: string[] = [];

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
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatusValue>("active");
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
  const [pagination, setPagination] = useState<PaginationState>({
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
          subscriptionStatus: SubscriptionStatusValue;
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
            <SubscriptionStatusFilter value={subscriptionStatus} onChange={setSubscriptionStatus} />
            <TierMultiSelect selected={selectedTiers} onToggle={toggleTier} />
            <StatesMultiSelect
              selected={selectedStates}
              isOpen={statesOpen}
              onToggleOpen={() => setStatesOpen((o) => !o)}
              onToggleState={toggleStateCode}
              containerRef={statesRef}
            />
          </div>

          <TopPercentEmailVerifiedControls
            requiresEmailVerified={requiresEmailVerified}
            onRequiresEmailVerifiedChange={setRequiresEmailVerified}
            topPercent={topPercent}
            onTopPercentChange={setTopPercent}
            onPreview={handlePreviewAudience}
            previewLoading={previewLoading}
          />

          <UserSearchInput value={searchQuery} onChange={setSearchQuery} />

          <SelectionToolbar
            selectedCount={selectedUserIds.size}
            totalCount={pagination.totalCount}
            hasPreviewUsers={previewUsers.length > 0}
            previewLoading={previewLoading}
            addingAllMatching={addingAllMatching}
            previewError={previewError}
            previewWarning={previewWarning}
            showEmptyHint={pagination.totalCount === 0 && !previewLoading && previewUsers.length === 0}
            onAddVisible={selectAllVisible}
            onAddAllMatching={() => void addAllMatchingToSelection()}
            onClearSelection={clearSelection}
          />
        </div>

        <div className="flex min-h-[28dvh] flex-1 flex-col overflow-hidden">
          <div className="px-4 sm:px-5 pt-2 pb-1 shrink-0">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">
              Audience preview
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-5 pb-2 overscroll-contain touch-pan-y">
            <PreviewList
              users={previewUsers}
              selectedUserIds={selectedUserIds}
              previewLoading={previewLoading}
              onToggleUser={toggleUserSelected}
            />
          </div>

          <PaginationControls
            page={page}
            totalPages={pagination.totalPages}
            totalCount={pagination.totalCount}
            hasPrevPage={pagination.hasPrevPage}
            hasNextPage={pagination.hasNextPage}
            previewLoading={previewLoading}
            onPrev={() => {
              const next = Math.max(1, page - 1);
              setPage(next);
              void fetchPreview(next);
            }}
            onNext={() => {
              const next = page + 1;
              setPage(next);
              void fetchPreview(next);
            }}
          />
        </div>

        <Footer
          selectedCount={selectedUserIds.size}
          onCancel={onClose}
          onConfirm={handleConfirm}
        />
      </ModalContent>
    </ModalContainer>
  );
}
