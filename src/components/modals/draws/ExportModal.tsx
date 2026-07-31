"use client";

import React, { useState } from "react";
import { FileText, Table, AlertCircle, CheckCircle, Check } from "lucide-react";
import { cn } from "@/utils/cn";
import DrawModalShell from "./DrawModalShell";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  majorDrawId: string;
  majorDrawName: string;
  totalParticipants: number;
}

type ExportFormatValue = "csv" | "excel";

interface ExportFormat {
  value: ExportFormatValue;
  label: string;
  icon: React.ReactNode;
  description: string;
  /** File extension shown on the primary button. */
  ext: string;
}

/**
 * Two format cards, per the design.
 *
 * The CSV description names randomdraws because that is what the file is FOR on
 * draw night — the admin is choosing between "the list I upload to the draw
 * service" and "the spreadsheet I read myself", not between two file formats.
 */
const EXPORT_FORMATS: ExportFormat[] = [
  {
    value: "csv",
    label: "CSV — one row per entry",
    icon: <FileText className="h-[18px] w-[18px]" />,
    description: "The format randomdraws.com.au accepts. One row per entry, so entry counts are represented.",
    ext: "CSV",
  },
  {
    value: "excel",
    label: "Excel — participant summary",
    icon: <Table className="h-[18px] w-[18px]" />,
    description: "One row per participant with totals, contact details and state.",
    ext: "XLSX",
  },
];

export default function ExportModal({
  isOpen,
  onClose,
  majorDrawId,
  majorDrawName,
  totalParticipants,
}: ExportModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormatValue>("csv");
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const handleExport = async () => {
    setIsExporting(true);
    setExportStatus("idle");
    setErrorMessage("");

    try {
      const response = await fetch(`/api/admin/major-draw/export?format=${selectedFormat}&majorDrawId=${majorDrawId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Export failed");
      }

      // Get the filename from the response headers or create one
      const contentDisposition = response.headers.get("content-disposition");
      let filename = `major-draw-${majorDrawName.replace(/[^a-zA-Z0-9]/g, "-")}-participants.${selectedFormat}`;

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) filename = filenameMatch[1];
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setExportStatus("success");

      // Close modal after a short delay
      setTimeout(() => {
        onClose();
        setExportStatus("idle");
      }, 2000);
    } catch (error) {
      console.error("Export error:", error);
      setExportStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    if (!isExporting) {
      onClose();
      setExportStatus("idle");
      setErrorMessage("");
    }
  };

  const activeFormat = EXPORT_FORMATS.find((f) => f.value === selectedFormat) ?? EXPORT_FORMATS[0];

  return (
    <DrawModalShell
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      eyebrow={`${majorDrawName} · ${totalParticipants.toLocaleString()} participants`}
      title="Export participants"
      primaryLabel={`Download ${activeFormat.ext}`}
      onPrimary={handleExport}
      isSubmitting={isExporting}
      submittingLabel="Preparing…"
      secondaryLabel="Cancel"
      onSecondary={handleClose}
    >
      <div role="radiogroup" aria-label="Export format" className="grid grid-cols-1 gap-[10px] draws:grid-cols-2">
        {EXPORT_FORMATS.map((format) => {
          const selected = format.value === selectedFormat;
          return (
            <button
              key={format.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setSelectedFormat(format.value)}
              disabled={isExporting}
              className={cn(
                "flex flex-col items-start gap-[7px] rounded-[11px] border p-[13px] text-left transition-colors",
                // The selected card gets an accent ring, per the design.
                selected
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] ring-2 ring-[var(--accent-line)]"
                  : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--accent-line)]",
                isExporting && "opacity-60"
              )}
            >
              <div className="flex w-full items-center justify-between gap-[8px]">
                <span className={selected ? "text-[var(--accent)]" : "text-[var(--text3)]"}>{format.icon}</span>
                {selected && (
                  <span
                    className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[var(--accent)] text-white"
                    aria-hidden
                  >
                    <Check className="h-[12px] w-[12px]" />
                  </span>
                )}
              </div>
              <span className="text-[13px] font-semibold text-[var(--text)]">{format.label}</span>
              <span className="text-[11.5px] leading-[1.5] text-[var(--text3)]">{format.description}</span>
            </button>
          );
        })}
      </div>

      {exportStatus === "success" && (
        <div
          role="status"
          className="mt-[12px] flex items-center gap-[8px] rounded-[9px] border border-[var(--ok-line)] bg-[var(--ok-bg)] px-[12px] py-[10px]"
        >
          <CheckCircle className="h-[16px] w-[16px] shrink-0 text-[var(--ok)]" aria-hidden />
          <p className="text-[12.5px] font-medium text-[var(--ok)]">Export downloaded. Closing this window.</p>
        </div>
      )}

      {exportStatus === "error" && (
        <div
          role="alert"
          className="mt-[12px] flex items-start gap-[8px] rounded-[9px] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-[12px] py-[10px]"
        >
          <AlertCircle className="mt-[1px] h-[16px] w-[16px] shrink-0 text-[var(--danger)]" aria-hidden />
          <div>
            <p className="text-[12.5px] font-semibold text-[var(--danger)]">Export failed</p>
            <p className="mt-[2px] text-[11.5px] leading-[1.5] text-[var(--text2)]">
              {errorMessage} — nothing has changed, retrying is safe.
            </p>
          </div>
        </div>
      )}
    </DrawModalShell>
  );
}
