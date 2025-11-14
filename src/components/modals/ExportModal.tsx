"use client";

import React, { useState } from "react";
import { Download, FileText, Table, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  majorDrawId: string;
  majorDrawName: string;
  totalParticipants: number;
}

interface ExportFormat {
  value: "csv" | "excel";
  label: string;
  icon: React.ReactNode;
  description: string;
}

const EXPORT_FORMATS: ExportFormat[] = [
  {
    value: "csv",
    label: "CSV File",
    icon: <FileText className="w-5 h-5" />,
    description: "Comma-separated values, compatible with Excel and Google Sheets",
  },
  {
    value: "excel",
    label: "Excel File",
    icon: <Table className="w-5 h-5" />,
    description: "Native Excel format with formatting and multiple sheets",
  },
];

export default function ExportModal({
  isOpen,
  onClose,
  majorDrawId,
  majorDrawName,
  totalParticipants,
}: ExportModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<"csv" | "excel">("csv");
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
        headers: {
          "Content-Type": "application/json",
        },
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

  return (
    <ModalContainer isOpen={isOpen} onClose={handleClose} size="lg" height="fixed">
      <ModalHeader
        title="Export Participants"
        subtitle={`Export participants for: ${majorDrawName}`}
        onClose={handleClose}
      />

      <ModalContent>
        <div className="space-y-6">
          {/* Export Info */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center gap-3">
              <Download className="w-6 h-6 text-blue-600" />
              <div>
                <h3 className="font-semibold text-blue-900">Export Details</h3>
                <p className="text-sm text-blue-700">
                  This will export all {totalParticipants.toLocaleString()} participants from the selected major draw.
                </p>
              </div>
            </div>
          </div>

          {/* Format Selection */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Export Format *</label>
            <div className="grid gap-3">
              {EXPORT_FORMATS.map((format) => (
                <div
                  key={format.value}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    selectedFormat === format.value
                      ? "border-red-500 bg-red-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setSelectedFormat(format.value)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        selectedFormat === format.value ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {format.icon}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{format.label}</h4>
                      <p className="text-sm text-gray-600">{format.description}</p>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border-2 ${
                        selectedFormat === format.value ? "border-red-500 bg-red-500" : "border-gray-300"
                      }`}
                    >
                      {selectedFormat === format.value && (
                        <div className="w-full h-full rounded-full bg-white scale-50" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Export Status */}
          {exportStatus === "success" && (
            <div className="p-4 bg-green-50 border-2 border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-green-800">
                  Export completed successfully! File is downloading...
                </span>
              </div>
            </div>
          )}

          {exportStatus === "error" && (
            <div className="p-4 bg-red-50 border-2 border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <div>
                  <span className="text-sm font-medium text-red-800">Export failed</span>
                  {errorMessage && <p className="text-sm text-red-700 mt-1">{errorMessage}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isExporting}>
              Cancel
            </Button>
             <Button
               type="button"
               onClick={handleExport}
               disabled={isExporting}
               icon={isExporting ? Loader2 : Download}
             >
               {isExporting ? "Exporting..." : "Export Participants"}
             </Button>
          </div>
        </div>
      </ModalContent>
    </ModalContainer>
  );
}
