"use client";

import React, { useState } from "react";
import { Calendar, Edit, Trash2, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { usePromoBannerTexts, useDeletePromoBannerText } from "@/hooks/queries/usePromoBannerTextQueries";
import AdminPromoBannerTextModal from "@/components/modals/AdminPromoBannerTextModal";
import type { PromoBannerText } from "@/types/admin";
import { format } from "date-fns";
import { formatDisplayName } from "@/utils/display-name";

export default function PromoBannerTextList() {
  const { data, isLoading, error } = usePromoBannerTexts();
  const deleteMutation = useDeletePromoBannerText();
  const [editingText, setEditingText] = useState<PromoBannerText | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const texts = data?.data || [];

  const handleEdit = (text: PromoBannerText) => {
    setEditingText(text);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this scheduled banner image?")) {
      return;
    }

    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync(id);
    } catch (error) {
      console.error("Failed to delete banner text:", error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingText(null);
  };

  const handleModalSuccess = () => {
    // Modal will close and queries will refetch automatically
  };

  const formatSchedule = (text: PromoBannerText): string => {
    if (text.scheduleType === "one-time") {
      if (text.startDate && text.endDate) {
        const start = format(new Date(text.startDate), "MMM d, yyyy");
        const end = format(new Date(text.endDate), "MMM d, yyyy");
        return `${start} - ${end} (AEST)`;
      }
      return "Invalid date range";
    } else {
      // Recurring
      const patternLabels: Record<string, string> = {
        weekdays: "Every Weekdays (Mon-Fri)",
        weekends: "Every Weekends (Sat-Sun)",
        monday: "Every Monday",
        tuesday: "Every Tuesday",
        wednesday: "Every Wednesday",
        thursday: "Every Thursday",
        friday: "Every Friday",
        saturday: "Every Saturday",
        sunday: "Every Sunday",
      };

      const pattern = text.recurrencePattern || "";
      let schedule = patternLabels[pattern] || pattern || "No pattern set";

      if (text.startDate || text.endDate) {
        const boundaries: string[] = [];
        if (text.startDate) {
          boundaries.push(`from ${format(new Date(text.startDate), "MMM d, yyyy")}`);
        }
        if (text.endDate) {
          boundaries.push(`until ${format(new Date(text.endDate), "MMM d, yyyy")}`);
        }
        schedule += ` ${boundaries.join(" ")} (AEST)`;
      } else {
        schedule += " (indefinite, AEST)";
      }

      return schedule;
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-none">
        <div className="flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-red-600 dark:text-red-400" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-8 shadow-sm dark:border-red-900/50 dark:bg-neutral-900 dark:shadow-none">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertCircle className="h-5 w-5" />
          <span>Failed to load banner texts. Please try again.</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-none">
        {texts.length === 0 ? (
          <div className="p-8 text-center">
            <Calendar className="mx-auto mb-4 h-12 w-12 text-gray-300 dark:text-neutral-600" />
            <p className="text-gray-500 dark:text-neutral-400">No scheduled banner images</p>
            <p className="mt-1 text-sm text-gray-400 dark:text-neutral-500">
              Create a schedule to show a custom left banner image on matching dates
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-neutral-700">
            {texts.map((text) => (
              <div
                key={text.id}
                className={`p-3 sm:p-6 transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800/50 ${
                  !text.isActive ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                  <div className="flex-1">
                    <div className="flex items-start gap-3 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
                              text.isActive
                                ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200"
                                : "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400"
                            }`}
                          >
                            {text.isActive ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" />
                                Active
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-3 h-3" />
                                Inactive
                              </>
                            )}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-neutral-400">
                            {text.scheduleType === "one-time" ? "One-time" : "Recurring"}
                          </span>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 mb-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={text.imageUrl}
                            alt={text.altText || "Scheduled banner"}
                            className="h-16 w-auto max-w-[200px] rounded border border-gray-200 bg-gray-50 object-contain dark:border-neutral-600 dark:bg-neutral-800"
                          />
                          <p className="break-all text-xs text-gray-500 dark:text-neutral-400 sm:max-w-md">
                            {text.imageUrl}
                          </p>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-neutral-400 space-y-1">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            <span>{formatSchedule(text)}</span>
                          </div>
                          {text.description && (
                            <p className="mt-2 italic text-gray-500 dark:text-neutral-400">{text.description}</p>
                          )}
                          {text.createdBy && (
                            <p className="mt-2 text-xs text-gray-400 dark:text-neutral-500">
                              Created by {formatDisplayName(text.createdBy.firstName, text.createdBy.lastName)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(text)}
                      className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:text-neutral-400 dark:hover:bg-blue-950/40 dark:hover:text-blue-400"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(text.id)}
                      disabled={deletingId === text.id}
                      className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      title="Delete"
                    >
                      {deletingId === text.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <AdminPromoBannerTextModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
        editingText={editingText}
      />
    </>
  );
}

