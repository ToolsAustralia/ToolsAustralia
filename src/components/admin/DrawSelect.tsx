"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ChevronDown, Search, Trophy } from "lucide-react";
import { cn } from "@/utils/cn";
import { Z_INDEX } from "@/constants/z-index";

export interface DrawSelectOption {
  id: string;
  name: string;
  imageUrl?: string;
  status: string;
}

interface DrawSelectProps {
  options: DrawSelectOption[];
  value: string;
  onChange: (id: string) => void;
  disabledIds?: string[];
  loading?: boolean;
  placeholder: string;
  label: string;
  error?: string;
}

const STATUS_BADGE_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  queued: "bg-blue-100 text-blue-700",
  frozen: "bg-amber-100 text-amber-700",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE_STYLES[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide", cls)}>
      {status}
    </span>
  );
}

function ImageOrTrophy({ src, alt }: { src?: string; alt: string }) {
  if (src) {
    return (
      <span className="relative inline-flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
        <Image src={src} alt={alt} fill sizes="32px" className="object-cover" />
      </span>
    );
  }
  return (
    <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 dark:border-neutral-700 bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400">
      <Trophy size={16} />
    </span>
  );
}

export function DrawSelect({
  options,
  value,
  onChange,
  disabledIds = [],
  loading = false,
  placeholder,
  label,
  error,
}: DrawSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const disabledSet = useMemo(() => new Set(disabledIds), [disabledIds]);

  const selected = useMemo(
    () => options.find((o) => o.id === value),
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  // Reset highlight + query when filter changes or panel opens/closes
  useEffect(() => {
    setHighlight(0);
  }, [query, isOpen]);

  useEffect(() => {
    if (!isOpen) setQuery("");
  }, [isOpen]);

  // Compute and track trigger position for the portaled panel
  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPanelRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  // Outside click — check both the trigger wrapper AND the portaled panel
  useEffect(() => {
    if (!isOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const inWrapper = wrapperRef.current?.contains(target);
      const inPanel = panelRef.current?.contains(target);
      if (!inWrapper && !inPanel) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [isOpen]);

  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      // Defer focus to next microtask so the portal child exists
      const id = window.setTimeout(() => searchRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [isOpen]);

  const pick = useCallback(
    (id: string) => {
      if (disabledSet.has(id) && id !== value) return;
      onChange(id);
      setIsOpen(false);
      setQuery("");
    },
    [disabledSet, onChange, value]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt) pick(opt.id);
    }
  };

  const stale = value && !selected;

  const panel = isOpen && mounted && panelRect ? (
    <div
      ref={panelRef}
      onKeyDown={onKeyDown}
      style={{
        position: "fixed",
        top: panelRect.top,
        left: panelRect.left,
        width: panelRect.width,
        zIndex: Z_INDEX.TOAST_LOADING,
      }}
      className="overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl"
    >
      <div className="flex items-center gap-2 border-b border-gray-100 dark:border-neutral-800 px-2 py-1.5">
        <Search size={14} className="text-gray-400 dark:text-neutral-500" />
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="w-full bg-transparent text-sm text-gray-900 dark:text-neutral-100 outline-none placeholder:text-gray-400 dark:placeholder:text-neutral-500"
        />
      </div>
      <div className="max-h-72 overflow-y-auto bg-white dark:bg-neutral-900">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-gray-500 dark:text-neutral-400">
            {options.length === 0 ? "No draws found." : "No matches for your search."}
          </p>
        ) : (
          filtered.map((opt, i) => {
            const isDisabled = disabledSet.has(opt.id) && opt.id !== value;
            const isSelected = opt.id === value;
            const isHighlighted = i === highlight;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => pick(opt.id)}
                onMouseEnter={() => setHighlight(i)}
                disabled={isDisabled}
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors",
                  !isSelected && !isHighlighted && "bg-white dark:bg-neutral-900",
                  isHighlighted && !isDisabled && !isSelected && "bg-blue-50 dark:bg-neutral-800",
                  isSelected && "bg-blue-100 dark:bg-blue-900 font-medium",
                  isDisabled && "cursor-not-allowed opacity-40"
                )}
              >
                <ImageOrTrophy src={opt.imageUrl} alt={opt.name} />
                <span className="min-w-0 flex-1 truncate text-gray-900 dark:text-neutral-100">{opt.name}</span>
                <StatusBadge status={opt.status} />
              </button>
            );
          })
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="w-full" ref={wrapperRef} onKeyDown={onKeyDown}>
      {label && (
        <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-neutral-300">
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        disabled={loading && options.length === 0}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border bg-white dark:bg-neutral-900 px-2 py-1.5 text-left text-sm shadow-sm transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60",
          error
            ? "border-red-400 focus-within:border-red-500"
            : stale
            ? "border-amber-400"
            : "border-gray-300 dark:border-neutral-700 focus-within:border-blue-500"
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {selected ? (
            <>
              <ImageOrTrophy src={selected.imageUrl} alt={selected.name} />
              <span className="min-w-0 flex-1 truncate font-medium text-gray-900 dark:text-neutral-100">{selected.name}</span>
              <StatusBadge status={selected.status} />
            </>
          ) : stale ? (
            <>
              <ImageOrTrophy alt="Unknown draw" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-amber-700 dark:text-amber-400">
                Unknown draw …{value.slice(-4)}
              </span>
            </>
          ) : (
            <>
              <ImageOrTrophy alt="No selection" />
              <span className="min-w-0 flex-1 truncate text-gray-500 dark:text-neutral-400">{loading ? "Loading…" : placeholder}</span>
            </>
          )}
        </span>
        <ChevronDown size={16} className="flex-shrink-0 text-gray-400 dark:text-neutral-500" />
      </button>

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {panel && createPortal(panel, document.body)}
    </div>
  );
}

export default DrawSelect;
