"use client";

/**
 * Report Problem Modal
 * 
 * Allows users to report errors they encountered, with optional notes.
 * Displays error context information and provides a form for user feedback.
 * 
 * Features:
 * - Displays error message (read-only)
 * - Optional textarea for user notes
 * - Shows what information will be sent (transparency)
 * - Handles submission with loading states
 * - Shows success/error feedback
 * - Rate limiting feedback
 */

import React, { useState } from "react";
import { ModalContainer, ModalHeader, ModalContent, Button, Textarea } from "./ui";
import { ErrorContext } from "@/types/error-reporting";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

interface ReportProblemModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorContext: ErrorContext;
}

export default function ReportProblemModal({
  isOpen,
  onClose,
  errorContext,
}: ReportProblemModalProps) {
  const [userNotes, setUserNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const { showToast } = useToast();

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (!isOpen) {
      setUserNotes("");
      setSubmitError(null);
      setSubmitSuccess(false);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/error-reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          errorContext,
          userNotes: userNotes.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = data.retryAfterSeconds || 60;
          const retryAfterMinutes = Math.ceil(retryAfter / 60);
          setSubmitError(
            `You've submitted too many error reports. Please wait ${retryAfterMinutes} minute(s) before submitting again.`
          );
          return;
        }

        // Handle other errors
        setSubmitError(data.message || data.error || "Failed to submit error report. Please try again.");
        return;
      }

      if (data.success) {
        setSubmitSuccess(true);
        showToast({
          type: "success",
          title: "Report Submitted",
          message: "Thank you for reporting this issue. We'll look into it.",
          duration: 5000,
        });

        // Close modal after a short delay
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setSubmitError(data.message || "Failed to submit error report. Please try again.");
      }
    } catch (error) {
      console.error("Error submitting report:", error);
      setSubmitError("Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format error message for display
  const displayErrorMessage = errorContext.errorMessage || "An error occurred";

  // Get browser info display
  const _browserInfoDisplay = errorContext.browserInfo
    ? `${errorContext.browserInfo.name || "Unknown"} ${errorContext.browserInfo.version || ""} on ${errorContext.browserInfo.os || "Unknown OS"}`
    : "Unknown";

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="lg">
      <ModalHeader
        title="Report a Problem"
        subtitle="Help us improve by reporting this error"
        onClose={onClose}
      />

      <ModalContent className="p-6">
        {submitSuccess ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-600 mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Thank You!</h3>
            <p className="text-gray-600">
              Your error report has been submitted successfully. We&apos;ll review it and work on a fix.
            </p>
          </div>
        ) : (
          <>
            {/* Error Message Display */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Error Message
              </label>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-900 break-words">{displayErrorMessage}</p>
                </div>
              </div>
            </div>

           

            {/* User Notes */}
            <div className="mb-6">
              <label htmlFor="userNotes" className="block text-sm font-medium text-gray-700 mb-2">
                Additional Details (Optional)
              </label>
              <Textarea
                id="userNotes"
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                placeholder="Describe what you were doing when this error occurred, or any other relevant information..."
                rows={4}
                maxLength={2000}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                {userNotes.length}/2000 characters
              </p>
            </div>

            {/* Submit Error */}
            {submitError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-900">{submitError}</p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
                className="min-w-[100px]"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="min-w-[100px]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Report"
                )}
              </Button>
            </div>
          </>
        )}
      </ModalContent>
    </ModalContainer>
  );
}

