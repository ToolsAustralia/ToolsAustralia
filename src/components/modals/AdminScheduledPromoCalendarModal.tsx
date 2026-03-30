"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Calendar, ChevronLeft, ChevronRight, Loader2, Paintbrush } from "lucide-react";
import {
  ModalContainer,
  ModalHeader,
  ModalContent,
  Button,
  FormSection,
  Input,
  Textarea,
} from "./ui";
import {
  ScheduledPromoMonthGrid,
  type BrushMode,
} from "@/components/admin/scheduled-promo-calendar/ScheduledPromoMonthGrid";
import { useApplyScheduledPromoMonth, useScheduledPromos } from "@/hooks/queries/useScheduledPromoQueries";
import type { ScheduledPromoType, ScheduledPromoMultiplier } from "@/types/admin";
import {
  buildMonthWeekGrid,
  buildPaintedDaysForMonthFromPromos,
  type CalendarPaintValue,
  type ScheduledPromoCalendarDay,
} from "@/utils/promo/scheduled-promo-calendar";
import { createAESTDateAsUTC } from "@/utils/common/timezone";

const AEST = "Australia/Sydney";

const PACKAGE_TYPES: { value: ScheduledPromoType; label: string }[] = [
  { value: "membership-packages", label: "Membership packages" },
  { value: "one-time-packages", label: "One-time packages" },
  { value: "mini-packages", label: "Mini draw packages" },
];

const MULTIPLIERS: ScheduledPromoMultiplier[] = [2, 3, 5, 10];

function getCurrentAestYearMonth(): { year: number; month: number } {
  const now = new Date();
  return {
    year: parseInt(formatInTimeZone(now, AEST, "yyyy"), 10),
    month: parseInt(formatInTimeZone(now, AEST, "M"), 10),
  };
}

function monthTitle(year: number, month: number): string {
  const ref = createAESTDateAsUTC(year, month, 1, 12, 0);
  return formatInTimeZone(ref, AEST, "MMMM yyyy");
}

type AdminScheduledPromoCalendarModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export default function AdminScheduledPromoCalendarModal({
  isOpen,
  onClose,
  onSuccess,
}: AdminScheduledPromoCalendarModalProps) {
  const initialYm = getCurrentAestYearMonth();
  const [year, setYear] = useState(initialYm.year);
  const [month, setMonth] = useState(initialYm.month);
  const [selectedType, setSelectedType] = useState<ScheduledPromoType>("membership-packages");
  const [applyToAllTypes, setApplyToAllTypes] = useState(false);
  const [brush, setBrush] = useState<BrushMode>(10);
  const [days, setDays] = useState<ScheduledPromoCalendarDay[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [applyError, setApplyError] = useState<string | null>(null);

  const isPaintingRef = useRef(false);
  const brushRef = useRef<BrushMode>(brush);

  useEffect(() => {
    brushRef.current = brush;
  }, [brush]);

  const { data: promos = [], isLoading: promosLoading } = useScheduledPromos({ isActive: true });

  const hydrateFromServer = useCallback(() => {
    const list = promos.filter((p) => p.type === selectedType && p.isActive && !p.deletedAt);
    setDays(buildPaintedDaysForMonthFromPromos(year, month, list));
  }, [promos, selectedType, year, month]);

  useEffect(() => {
    if (!isOpen) return;
    hydrateFromServer();
  }, [isOpen, hydrateFromServer]);

  useEffect(() => {
    if (!isOpen) return;
    const endPaint = () => {
      isPaintingRef.current = false;
    };
    window.addEventListener("pointerup", endPaint);
    window.addEventListener("pointercancel", endPaint);
    return () => {
      window.removeEventListener("pointerup", endPaint);
      window.removeEventListener("pointercancel", endPaint);
    };
  }, [isOpen]);

  const weekRows = useMemo(() => buildMonthWeekGrid(year, month), [year, month]);
  const paintMap = useMemo(() => new Map(days.map((d) => [d.dateKey, d.multiplier])), [days]);

  const applyPaintToKey = useCallback((dateKey: string) => {
    const value: CalendarPaintValue = brushRef.current === "clear" ? null : brushRef.current;
    setDays((prev) => prev.map((d) => (d.dateKey === dateKey ? { ...d, multiplier: value } : d)));
  }, []);

  const handleCellPointerDown = useCallback(
    (dateKey: string) => {
      isPaintingRef.current = true;
      applyPaintToKey(dateKey);
    },
    [applyPaintToKey]
  );

  const handleCellPointerEnter = useCallback(
    (dateKey: string) => {
      if (isPaintingRef.current) applyPaintToKey(dateKey);
    },
    [applyPaintToKey]
  );

  const shiftMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  };

  const applyMutation = useApplyScheduledPromoMonth();

  const handleApply = async () => {
    setApplyError(null);
    const types: ScheduledPromoType[] = applyToAllTypes
      ? ["membership-packages", "one-time-packages", "mini-packages"]
      : [selectedType];
    const payloadDays = days.map((d) => ({ dateKey: d.dateKey, multiplier: d.multiplier }));
    try {
      for (const t of types) {
        await applyMutation.mutateAsync({
          type: t,
          year,
          month,
          days: payloadDays,
          name: campaignName.trim() || undefined,
          description: campaignDescription.trim() || undefined,
        });
      }
      onSuccess?.();
      onClose();
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : "Failed to apply calendar");
    }
  };

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl">
      <ModalHeader title="Schedule promos — month grid" onClose={onClose} showLogo={false} />

      <ModalContent>
        <div className="space-y-6">
          <p className="text-sm text-gray-600">
            Paint entry multipliers per civil day in <strong>Australia/Sydney</strong>. Existing phases that overlap this
            month are reconciled (trimmed, split, or cleared). Days marked &quot;—&quot; leave no scheduled promo for that
            day (toggle / alternating rules apply).
          </p>

          {applyError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{applyError}</div>
          )}

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="flex-1 space-y-4">
              <FormSection title="Package type">
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as ScheduledPromoType)}
                  disabled={applyToAllTypes || applyMutation.isPending}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500"
                >
                  {PACKAGE_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={applyToAllTypes}
                    onChange={(e) => setApplyToAllTypes(e.target.checked)}
                    disabled={applyMutation.isPending}
                    className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                  Apply the same grid to all three package types
                </label>
              </FormSection>

              <FormSection title="Brush">
                <div className="flex flex-wrap gap-2">
                  {MULTIPLIERS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setBrush(m)}
                      disabled={applyMutation.isPending}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                        brush === m ? "border-red-600 bg-red-600 text-white" : "border-gray-200 bg-white text-gray-800"
                      }`}
                    >
                      {m}x
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setBrush("clear")}
                    disabled={applyMutation.isPending}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                      brush === "clear"
                        ? "border-gray-700 bg-gray-800 text-white"
                        : "border-gray-200 bg-white text-gray-800"
                    }`}
                  >
                    Gap
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Click or drag across days. &quot;Gap&quot; removes the scheduled override for that day.
                </p>
              </FormSection>

              <FormSection title="Labels (optional)">
                <Input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. March variable multipliers"
                  maxLength={200}
                  disabled={applyMutation.isPending}
                />
                <div className="mt-3">
                  <Textarea
                    value={campaignDescription}
                    onChange={(e) => setCampaignDescription(e.target.value)}
                    placeholder="Internal notes (applied to each created phase)"
                    rows={2}
                    maxLength={500}
                    disabled={applyMutation.isPending}
                  />
                </div>
              </FormSection>
            </div>

            <div className="flex-1 min-w-0 rounded-xl border border-gray-200 bg-gray-50/80 p-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-gray-900">
                  <Calendar className="h-5 w-5 text-red-600" />
                  <span className="font-semibold">{monthTitle(year, month)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    disabled={applyMutation.isPending}
                    className="rounded-lg border border-gray-200 bg-white p-2 text-gray-700 hover:bg-gray-50"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const n = getCurrentAestYearMonth();
                      setYear(n.year);
                      setMonth(n.month);
                    }}
                    disabled={applyMutation.isPending}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    disabled={applyMutation.isPending}
                    className="rounded-lg border border-gray-200 bg-white p-2 text-gray-700 hover:bg-gray-50"
                    aria-label="Next month"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => hydrateFromServer()}
                    disabled={applyMutation.isPending || promosLoading}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Reload
                  </button>
                </div>
              </div>

              {promosLoading && days.length === 0 ? (
                <div className="flex justify-center py-12 text-gray-500 text-sm">Loading schedule…</div>
              ) : (
                <ScheduledPromoMonthGrid
                  weekRows={weekRows}
                  paintByKey={paintMap}
                  onCellPointerDown={handleCellPointerDown}
                  onCellPointerEnter={handleCellPointerEnter}
                />
              )}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="md" onClick={onClose} disabled={applyMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => void handleApply()}
              disabled={applyMutation.isPending || days.length === 0}
              className="inline-flex items-center justify-center gap-2"
            >
              {applyMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Applying…
                </>
              ) : (
                <>
                  <Paintbrush className="h-4 w-4" />
                  Apply month
                </>
              )}
            </Button>
          </div>
        </div>
      </ModalContent>
    </ModalContainer>
  );
}
