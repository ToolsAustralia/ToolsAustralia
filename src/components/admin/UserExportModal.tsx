/**
 * User Export Modal Component
 * 
 * Modal for exporting filtered users with customizable field selection.
 * Allows admins to select which user fields to include in the export.
 */

"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Download,
  FileText,
  Table,
  Loader2,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Trophy,
  Users,
} from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent, Button, Checkbox } from "@/components/modals/ui";
import type { UserFilters } from "@/types/admin";
import {
  EXPORT_FIELDS,
  getFieldsByGroup,
  getDefaultFields,
  type FieldGroup,
} from "@/services/admin/userExportFields";

interface UserExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: UserFilters;
  totalUsers?: number; // Optional: estimated total users matching filters
}

interface ExportFormat {
  value: "csv" | "excel";
  label: string;
  icon: React.ReactNode;
  description: string;
  extension: string;
}

export type ExportSegment = "all" | "top20MajorDraw";

const EXPORT_SEGMENTS: { value: ExportSegment; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: "all",
    label: "All filtered users",
    description: "Export users matching your current filters",
    icon: <Users className="w-5 h-5" />,
  },
  {
    value: "top20MajorDraw",
    label: "Top 20% major draw entry holders",
    description: "Export the top 20% of users with the most entries in the active major draw",
    icon: <Trophy className="w-5 h-5" />,
  },
];

const EXPORT_FORMATS: ExportFormat[] = [
  {
    value: "csv",
    label: "CSV File",
    icon: <FileText className="w-5 h-5" />,
    description: "Comma-separated values, compatible with Excel and Google Sheets",
    extension: "csv",
  },
  {
    value: "excel",
    label: "Excel File",
    icon: <Table className="w-5 h-5" />,
    description: "Native Excel format with formatting and multiple sheets",
    extension: "xlsx",
  },
];

/**
 * Get filter summary text for display
 */
function getFilterSummary(filters: UserFilters): string {
  const parts: string[] = [];

  if (filters.search) {
    parts.push(`Search: "${filters.search}"`);
  }
  if (filters.subscriptionStatus) {
    parts.push(`Subscription: ${filters.subscriptionStatus}`);
  }
  if (filters.autoRenew) {
    parts.push(`Auto-renew: ${filters.autoRenew}`);
  }
  if (filters.membershipPackage) {
    parts.push(`Package: ${filters.membershipPackage}`);
  }
  if (filters.role) {
    parts.push(`Role: ${filters.role}`);
  }

  return parts.length > 0 ? parts.join(", ") : "All users";
}

/**
 * Group display names
 */
const GROUP_NAMES: Record<FieldGroup, string> = {
  basic: "Basic Information",
  status: "Account Status",
  dates: "Dates",
  subscription: "Subscription Details",
  financial: "Financial",
  entries: "Entries & Rewards",
};

export default function UserExportModal({ isOpen, onClose, filters, totalUsers }: UserExportModalProps) {
  const [selectedSegment, setSelectedSegment] = useState<ExportSegment>("all");
  const [selectedFormat, setSelectedFormat] = useState<"csv" | "excel">("csv");
  const [selectedFields, setSelectedFields] = useState<string[]>(() => getDefaultFields());
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Set<FieldGroup>>(new Set(["basic", "subscription", "financial", "entries"]));

  // Get fields grouped by category
  const fieldsByGroup = useMemo(() => getFieldsByGroup(), []);

  // Filter summary
  const filterSummary = useMemo(() => getFilterSummary(filters), [filters]);

  // Check if all fields in a group are selected
  const isGroupSelected = (group: FieldGroup): boolean => {
    const groupFields = fieldsByGroup[group];
    return groupFields.every((field) => selectedFields.includes(field.key));
  };

  // Check if any fields in a group are selected
  const isGroupPartiallySelected = (group: FieldGroup): boolean => {
    const groupFields = fieldsByGroup[group];
    return groupFields.some((field) => selectedFields.includes(field.key)) && !isGroupSelected(group);
  };

  // Toggle group selection
  const toggleGroup = (group: FieldGroup) => {
    const groupFields = fieldsByGroup[group];
    const allSelected = isGroupSelected(group);

    if (allSelected) {
      // Deselect all fields in group
      setSelectedFields((prev) => prev.filter((key) => !groupFields.some((field) => field.key === key)));
    } else {
      // Select all fields in group
      const newFields = [...selectedFields];
      groupFields.forEach((field) => {
        if (!newFields.includes(field.key)) {
          newFields.push(field.key);
        }
      });
      setSelectedFields(newFields);
    }
  };

  // Toggle field selection
  const toggleField = (fieldKey: string) => {
    setSelectedFields((prev) => {
      if (prev.includes(fieldKey)) {
        return prev.filter((key) => key !== fieldKey);
      } else {
        return [...prev, fieldKey];
      }
    });
  };

  // Toggle group expansion
  const toggleGroupExpansion = (group: FieldGroup) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  // Reset to defaults
  const resetToDefaults = () => {
    setSelectedFields(getDefaultFields());
  };

  // Select all fields
  const selectAll = () => {
    setSelectedFields(EXPORT_FIELDS.map((field) => field.key));
  };

  // Deselect all fields
  const deselectAll = () => {
    setSelectedFields([]);
  };

  // Handle export
  const handleExport = async () => {
    if (selectedFields.length === 0) {
      setErrorMessage("Please select at least one field to export");
      setExportStatus("error");
      return;
    }

    setIsExporting(true);
    setExportStatus("idle");
    setErrorMessage("");

    try {
      // Build query parameters
      const params = new URLSearchParams();
      params.set("format", selectedFormat);
      params.set("fields", selectedFields.join(","));

      if (selectedSegment === "top20MajorDraw") {
        params.set("segment", "top20MajorDraw");
      }
      if (filters.search) params.set("search", filters.search);
      if (filters.subscriptionStatus) params.set("subscriptionStatus", filters.subscriptionStatus);
      if (filters.autoRenew) params.set("autoRenew", filters.autoRenew);
      if (filters.membershipPackage) params.set("membershipPackage", filters.membershipPackage);
      if (filters.role) params.set("role", filters.role);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);

      const response = await fetch(`/api/admin/users/export?${params.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Export failed" }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Get filename from response headers
      const contentDisposition = response.headers.get("content-disposition");
      let filename = `users-export-${new Date().toISOString().split("T")[0]}.${selectedFormat === "excel" ? "xlsx" : "csv"}`;

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
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
      setErrorMessage(error instanceof Error ? error.message : "Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  // Handle close
  const handleClose = () => {
    if (!isExporting) {
      onClose();
      setExportStatus("idle");
      setErrorMessage("");
    }
  };

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedSegment("all");
      setSelectedFields(getDefaultFields());
      setSelectedFormat("csv");
      setExportStatus("idle");
      setErrorMessage("");
      setIsExporting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={handleClose} size="2xl" height="fixed">
      <ModalHeader
        title="Export Users"
        subtitle={
          selectedSegment === "top20MajorDraw"
            ? "Export the top 20% of users with the most entries in the active major draw"
            : `Export filtered users: ${filterSummary}${totalUsers !== undefined ? ` (${totalUsers} users)` : ""}`
        }
        onClose={handleClose}
      />

      <ModalContent padding="md" className="flex flex-col gap-4">
        {/* Segment Selection */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700">Export Segment</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {EXPORT_SEGMENTS.map((seg) => (
              <button
                key={seg.value}
                onClick={() => setSelectedSegment(seg.value)}
                disabled={isExporting}
                className={`p-3 rounded-lg border-2 transition-all ${
                  selectedSegment === seg.value ? "border-red-500 bg-red-50" : "border-gray-200 hover:border-gray-300 bg-white"
                } ${isExporting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="flex items-start gap-3">
                  <div className={selectedSegment === seg.value ? "text-red-600" : "text-gray-400"}>
                    {seg.icon}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-gray-900">{seg.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{seg.description}</div>
                  </div>
                  {selectedSegment === seg.value && <CheckCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Format Selection */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700">Export Format</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {EXPORT_FORMATS.map((format) => (
              <button
                key={format.value}
                onClick={() => setSelectedFormat(format.value)}
                disabled={isExporting}
                className={`p-3 rounded-lg border-2 transition-all ${
                  selectedFormat === format.value
                    ? "border-red-500 bg-red-50"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                } ${isExporting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`${selectedFormat === format.value ? "text-red-600" : "text-gray-400"}`}>
                    {format.icon}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-gray-900">{format.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{format.description}</div>
                  </div>
                  {selectedFormat === format.value && (
                    <CheckCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Field Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-gray-700">Select Fields to Export</label>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                disabled={isExporting}
                className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Select All
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={deselectAll}
                disabled={isExporting}
                className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Deselect All
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={resetToDefaults}
                disabled={isExporting}
                className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reset to Defaults
              </button>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-96 overflow-y-auto">
            {(Object.keys(fieldsByGroup) as FieldGroup[]).map((group) => {
              const groupFields = fieldsByGroup[group];
              const isExpanded = expandedGroups.has(group);
              const isSelected = isGroupSelected(group);
              const isPartiallySelected = isGroupPartiallySelected(group);

              return (
                <div key={group}>
                  {/* Group Header */}
                  <button
                    onClick={() => toggleGroupExpansion(group)}
                    disabled={isExporting}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleGroup(group);
                        }}
                        disabled={isExporting}
                        className="p-0.5 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-red-600" />
                        ) : isPartiallySelected ? (
                          <div className="w-4 h-4 border-2 border-red-600 bg-red-100 rounded" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                      <span className="font-medium text-gray-900">{GROUP_NAMES[group]}</span>
                      <span className="text-xs text-gray-500">({groupFields.length})</span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </button>

                  {/* Group Fields */}
                  {isExpanded && (
                    <div className="bg-gray-50 p-2 space-y-1">
                      {groupFields.map((field) => (
                        <label
                          key={field.key}
                          className="flex items-center gap-2 p-2 rounded hover:bg-white transition-colors cursor-pointer"
                        >
                          <Checkbox
                            checked={selectedFields.includes(field.key)}
                            onChange={() => toggleField(field.key)}
                            disabled={isExporting}
                          />
                          <span className="text-sm text-gray-700 flex-1">{field.displayName}</span>
                          {field.isComputed && (
                            <span className="text-xs text-gray-500 italic">(calculated)</span>
                          )}
                          {field.isDefault && (
                            <span className="text-xs text-blue-600 font-medium">(default)</span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {selectedFields.length === 0 && (
            <div className="text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Please select at least one field to export
            </div>
          )}
        </div>

        {/* Status Messages */}
        {exportStatus === "error" && errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {errorMessage}
          </div>
        )}

        {exportStatus === "success" && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            Export completed successfully! Your download should start shortly.
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
          <Button
            onClick={handleClose}
            disabled={isExporting}
            variant="secondary"
            className="min-w-[100px]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || selectedFields.length === 0}
            className="min-w-[150px] flex items-center justify-center gap-2"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export {selectedFormat === "excel" ? "Excel" : "CSV"}
              </>
            )}
          </Button>
        </div>
      </ModalContent>
    </ModalContainer>
  );
}

