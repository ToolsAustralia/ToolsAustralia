"use client";

import React, { useState, useEffect } from "react";
import { MessageSquare, Building, X } from "lucide-react";

interface UnviewedSubmissionsNotificationProps {
  onDismiss?: () => void;
  onViewSubmissions?: () => void;
}

export default function UnviewedSubmissionsNotification({
  onDismiss,
  onViewSubmissions,
}: UnviewedSubmissionsNotificationProps) {
  const [visible, setVisible] = useState(false);
  const [counts, setCounts] = useState<{ contact: number; partner: number; total: number } | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/admin/submissions/unviewed-count");
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data.total > 0) {
            setCounts(data.data);
            setVisible(true);
          }
        }
      } catch (error) {
        console.error("Error fetching unviewed count:", error);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  const handleView = () => {
    setVisible(false);
    onViewSubmissions?.();
  };

  if (!visible || !counts) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
      <div className="bg-white rounded-xl shadow-2xl border-2 border-red-200 max-w-sm overflow-hidden">
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-gray-900 mb-2">Unviewed submissions</h4>
              <div className="space-y-1.5 text-sm text-gray-600">
                {counts.partner > 0 && (
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <span>{counts.partner} unread partner application{counts.partner !== 1 ? "s" : ""}</span>
                  </div>
                )}
                {counts.contact > 0 && (
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <span>{counts.contact} unread contact submission{counts.contact !== 1 ? "s" : ""}</span>
                  </div>
                )}
              </div>
              {onViewSubmissions && (
                <button
                  onClick={handleView}
                  className="mt-3 w-full px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white text-sm font-semibold rounded-lg hover:from-red-700 hover:to-red-800 transition-all"
                >
                  View submissions
                </button>
              )}
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
