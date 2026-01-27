/**
 * Klaviyo Sync Button Component
 * 
 * Provides manual sync functionality for Klaviyo profiles with preview
 * Two-step modal: Preview → Execute
 */

"use client";

import React, { useState, useEffect, useRef } from "react";
import { RefreshCw, Users, CheckCircle, AlertCircle, X, Loader2 } from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent } from "@/components/modals/ui";

interface PreviewData {
  targetDraw: {
    id: string;
    name: string;
    status: string;
    activationDate: string;
  };
  cutoffDate: string;
  totalUsers: number;
  totalParticipants: number;
  skippedUsers: number;
  reductionPercentage: number;
  sampleUsers: Array<{
    userId: string;
    email: string;
    name?: string;
  }>;
}

interface SyncResult {
  processed: number;
  synced: number;
  errors: number;
  duration: number;
  errorDetails: Array<{
    userId: string;
    email: string;
    error: string;
  }>;
}

type ModalStep = "preview" | "executing" | "complete";

export default function KlaviyoSyncButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<ModalStep>("preview");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    total: number;
    processed: number;
    synced: number;
    errors: number;
    currentUserEmail?: string;
  } | null>(null);

  const handleOpen = () => {
    setIsOpen(true);
    setStep("preview");
    setPreviewData(null);
    setPreviewError(null);
    setSyncResult(null);
    setExecuteError(null);
    loadPreview();
  };

  const handleClose = () => {
    if (isExecuting) {
      // Don't allow closing during execution
      return;
    }
    setIsOpen(false);
    // Reset state after a delay to allow modal close animation
    setTimeout(() => {
      setStep("preview");
      setPreviewData(null);
      setPreviewError(null);
      setSyncResult(null);
      setExecuteError(null);
      setProgress(null);
      executeResponseRef.current = null;
    }, 300);
  };

  const loadPreview = async () => {
    setIsLoadingPreview(true);
    setPreviewError(null);

    try {
      const response = await fetch("/api/admin/klaviyo/draw-reset-preview");
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load preview");
      }

      setPreviewData(data.data);
    } catch (error) {
      console.error("Error loading preview:", error);
      setPreviewError(error instanceof Error ? error.message : "Failed to load preview");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Poll for progress updates
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const executeResponseRef = useRef<SyncResult | null>(null);

  useEffect(() => {
    if (isExecuting && step === "executing") {
      // Poll for progress every 1 second
      progressIntervalRef.current = setInterval(async () => {
        try {
          const response = await fetch("/api/admin/klaviyo/draw-reset-progress");
          const data = await response.json();

          if (data.success && data.data) {
            setProgress(data.data);
            
            // If sync is complete, stop polling and show results
            if (!data.data.isRunning && syncResult === null) {
              if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
              }
              // Use the stored result from the execute response
              if (executeResponseRef.current) {
                setSyncResult(executeResponseRef.current);
                setStep("complete");
                setIsExecuting(false);
              } else {
                // Fallback: if we don't have the result, wait a bit and check progress again
                setTimeout(() => {
                  if (executeResponseRef.current) {
                    setSyncResult(executeResponseRef.current);
                    setStep("complete");
                    setIsExecuting(false);
                  }
                }, 1000);
              }
            }
          }
        } catch (error) {
          console.error("Error fetching progress:", error);
        }
      }, 1000);
    } else {
      // Clear interval when not executing
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isExecuting, step, syncResult]);

  const handleExecute = async () => {
    setIsExecuting(true);
    setStep("executing");
    setExecuteError(null);
    setProgress(null);

    try {
      // Start the sync - it will run and we'll poll for progress
      const response = await fetch("/api/admin/klaviyo/draw-reset-execute", {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        if (response.status === 409) {
          throw new Error("Sync already in progress. Please wait for the current sync to complete.");
        }
        throw new Error(data.error || "Failed to execute sync");
      }

      // Store the result for when progress shows complete
      executeResponseRef.current = data.data;
      
      // Wait a moment for progress to initialize
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      // Check if sync completed quickly (before progress polling started)
      const quickCheck = await fetch("/api/admin/klaviyo/draw-reset-progress");
      const quickData = await quickCheck.json();
      
      if (quickData.success && quickData.data && !quickData.data.isRunning) {
        // Sync completed already
        setSyncResult(data.data);
        setStep("complete");
        setIsExecuting(false);
      }
      // Otherwise, progress polling will handle updates
    } catch (error) {
      console.error("Error executing sync:", error);
      setExecuteError(error instanceof Error ? error.message : "Failed to execute sync");
      setStep("preview"); // Go back to preview on error
      setIsExecuting(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString("en-AU", {
        timeZone: "Australia/Sydney",
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return dateString;
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white rounded-lg hover:from-[#cc0000] hover:to-[#e60000] transition-all text-xs sm:text-sm font-medium shadow-sm"
        title="Sync Klaviyo Profiles"
      >
        <RefreshCw className="w-4 h-4" />
        <span className="hidden sm:inline">Sync Klaviyo Profiles</span>
        <span className="sm:hidden">Sync</span>
      </button>

      {isOpen && (
        <ModalContainer isOpen={isOpen} onClose={handleClose} size="xl" closeOnBackdrop={!isExecuting}>
          <ModalHeader
            title={
              step === "preview"
                ? "Sync Klaviyo Profiles"
                : step === "executing"
                ? "Syncing Profiles"
                : "Sync Complete"
            }
            subtitle={
              step === "preview"
                ? "Preview users who will be synced"
                : step === "executing"
                ? "Please wait while profiles are being synced..."
                : "Sync operation completed"
            }
            onClose={handleClose}
            showLogo={false}
            showCloseButton={!isExecuting}
          />

          <ModalContent padding="lg">
            {/* Preview Step */}
            {step === "preview" && (
              <div className="space-y-4">
                {isLoadingPreview ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-[#ee0000] animate-spin mb-4" />
                    <p className="text-gray-600">Loading preview...</p>
                  </div>
                ) : previewError ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-red-900 mb-1">Error Loading Preview</h3>
                        <p className="text-sm text-red-700">{previewError}</p>
                        <button
                          onClick={loadPreview}
                          className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                        >
                          Retry
                        </button>
                      </div>
                    </div>
                  </div>
                ) : previewData ? (
                  <>
                    {/* Target Draw Info */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h3 className="font-semibold text-blue-900 mb-2">Target Draw</h3>
                      <div className="space-y-1 text-sm">
                        <p>
                          <span className="font-medium">Name:</span> {previewData.targetDraw.name}
                        </p>
                        <p>
                          <span className="font-medium">Status:</span> {previewData.targetDraw.status}
                        </p>
                        <p>
                          <span className="font-medium">Activation Date:</span>{" "}
                          {formatDate(previewData.targetDraw.activationDate)}
                        </p>
                        <p>
                          <span className="font-medium">Cutoff Date:</span> {formatDate(previewData.cutoffDate)}
                        </p>
                      </div>
                    </div>

                    {/* User Counts */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 mb-3">Users to Sync</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-600">Total Participants</p>
                          <p className="text-2xl font-bold text-gray-900">{previewData.totalParticipants.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Total Users</p>
                          <p className="text-2xl font-bold text-gray-700">{previewData.totalUsers.toLocaleString()}</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Skipping {previewData.skippedUsers.toLocaleString()} non-participants (
                        {previewData.reductionPercentage}% reduction)
                      </p>
                    </div>

                    {/* Sample Users */}
                    {previewData.sampleUsers.length > 0 && (
                      <div className="border border-gray-200 rounded-lg">
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                          <h3 className="font-semibold text-gray-900 text-sm">
                            Sample Users ({previewData.sampleUsers.length} of {previewData.totalParticipants.toLocaleString()})
                          </h3>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">Email</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">Name</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {previewData.sampleUsers.map((user) => (
                                <tr key={user.userId} className="hover:bg-gray-50">
                                  <td className="px-4 py-2 text-gray-900">{user.email}</td>
                                  <td className="px-4 py-2 text-gray-600">{user.name || "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4">
                      <button
                        onClick={handleClose}
                        className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleExecute}
                        disabled={isExecuting}
                        className="flex-1 px-4 py-2 bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white rounded-lg hover:from-[#cc0000] hover:to-[#e60000] transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Continue to Sync
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            )}

            {/* Executing Step */}
            {step === "executing" && (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <Loader2 className="w-12 h-12 text-[#ee0000] animate-spin mb-4" />
                <p className="text-lg font-semibold text-gray-900 mb-2">Syncing profiles to Klaviyo...</p>
                
                {progress && (
                  <div className="w-full max-w-md space-y-3">
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-[#ee0000] to-[#ff4444] h-3 rounded-full transition-all duration-300"
                        style={{
                          width: `${progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    
                    {/* Progress Stats */}
                    <div className="text-center space-y-1">
                      <p className="text-sm font-medium text-gray-900">
                        Processing: {progress.processed.toLocaleString()} / {progress.total.toLocaleString()} users
                      </p>
                      {progress.currentUserEmail && (
                        <p className="text-xs text-gray-600">
                          Current: {progress.currentUserEmail}
                        </p>
                      )}
                      <div className="flex items-center justify-center gap-4 text-xs text-gray-600 mt-2">
                        <span className="text-green-600">✓ Synced: {progress.synced.toLocaleString()}</span>
                        {progress.errors > 0 && (
                          <span className="text-red-600">✗ Errors: {progress.errors.toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                
                {!progress && (
                  <p className="text-sm text-gray-600">Initializing sync... Please wait.</p>
                )}
                
                <p className="text-xs text-gray-500 mt-4">This may take a few minutes. Please do not close this window.</p>
              </div>
            )}

            {/* Complete Step */}
            {step === "complete" && syncResult && (
              <div className="space-y-4">
                {executeError ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-red-900 mb-1">Error During Sync</h3>
                        <p className="text-sm text-red-700">{executeError}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-green-900 mb-2">Sync Completed Successfully</h3>
                        <div className="space-y-2 text-sm">
                          <p>
                            <span className="font-medium">Processed:</span> {syncResult.processed.toLocaleString()} users
                          </p>
                          <p>
                            <span className="font-medium">Synced:</span> {syncResult.synced.toLocaleString()} users
                          </p>
                          {syncResult.errors > 0 && (
                            <p className="text-orange-700">
                              <span className="font-medium">Errors:</span> {syncResult.errors.toLocaleString()} users
                            </p>
                          )}
                          <p>
                            <span className="font-medium">Duration:</span> {formatDuration(syncResult.duration)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error Details */}
                {syncResult.errorDetails && syncResult.errorDetails.length > 0 && (
                  <div className="border border-gray-200 rounded-lg">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                      <h3 className="font-semibold text-gray-900 text-sm">
                        Error Details ({syncResult.errorDetails.length})
                      </h3>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      <div className="divide-y divide-gray-200">
                        {syncResult.errorDetails.slice(0, 10).map((error, index) => (
                          <div key={index} className="px-4 py-2 text-sm">
                            <p className="font-medium text-gray-900">{error.email}</p>
                            <p className="text-red-600 text-xs mt-1">{error.error}</p>
                          </div>
                        ))}
                        {syncResult.errorDetails.length > 10 && (
                          <div className="px-4 py-2 text-xs text-gray-500 text-center">
                            ... and {syncResult.errorDetails.length - 10} more errors
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Close Button */}
                <div className="pt-4">
                  <button
                    onClick={handleClose}
                    className="w-full px-4 py-2 bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white rounded-lg hover:from-[#cc0000] hover:to-[#e60000] transition-all font-medium"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </ModalContent>
        </ModalContainer>
      )}
    </>
  );
}
