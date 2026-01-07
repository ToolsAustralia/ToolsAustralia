"use client";

import React, { useState } from "react";
import { Calendar, Edit, Trash2, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { usePromoBannerTexts, useDeletePromoBannerText } from "@/hooks/queries/usePromoBannerTextQueries";
import AdminPromoBannerTextModal from "@/components/modals/AdminPromoBannerTextModal";
import type { PromoBannerText } from "@/types/admin";
import { format } from "date-fns";

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
    if (!confirm("Are you sure you want to delete this scheduled banner text?")) {
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

      let schedule = patternLabels[text.recurrencePattern || ""] || text.recurrencePattern;

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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-red-600" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-red-200 p-8">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <span>Failed to load banner texts. Please try again.</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {texts.length === 0 ? (
          <div className="p-8 text-center">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No scheduled banner texts</p>
            <p className="text-sm text-gray-400 mt-1">Create a new scheduled text to display custom messages</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {texts.map((text) => (
              <div
                key={text.id}
                className={`p-4 sm:p-6 hover:bg-gray-50 transition-colors ${
                  !text.isActive ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-start gap-3 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                              text.isActive
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-600"
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
                          <span className="text-xs text-gray-500">
                            {text.scheduleType === "one-time" ? "One-time" : "Recurring"}
                          </span>
                        </div>
                        <h4 className="text-lg font-semibold text-gray-900 mb-2">{text.text}</h4>
                        <div className="text-sm text-gray-600 space-y-1">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            <span>{formatSchedule(text)}</span>
                          </div>
                          {text.description && (
                            <p className="text-gray-500 italic mt-2">{text.description}</p>
                          )}
                          {text.createdBy && (
                            <p className="text-xs text-gray-400 mt-2">
                              Created by {text.createdBy.firstName} {text.createdBy.lastName}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(text)}
                      className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(text.id)}
                      disabled={deletingId === text.id}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
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

