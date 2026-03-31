"use client";

import React, { useState } from "react";
import DashboardSection from "./DashboardSection";
import AdminProductModal from "@/components/modals/AdminProductModal";
import AdminMajorDrawModal from "@/components/modals/AdminMajorDrawModal";
import { Trophy, Package, Megaphone, Download } from "lucide-react";

interface QuickActionsPanelProps {
  onRefreshStats: () => void;
}

export default function QuickActionsPanel({ onRefreshStats }: QuickActionsPanelProps) {
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isAdminMajorDrawModalOpen, setIsAdminMajorDrawModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleCreateProduct = async (data: {
    name: string;
    brand: string;
    description: string;
    shortDescription: string;
    price: number;
    originalPrice?: number;
    category: string;
    subcategory: string;
    sku: string;
    stock: number;
    weight: number;
    dimensions: { length: number; width: number; height: number };
    images: File[];
    uploadedImageUrls: string[];
    specifications: string;
    warranty: string;
    status: "active" | "inactive" | "draft";
    featured: boolean;
    onSale: boolean;
    freeShipping: boolean;
    tags: string;
  }) => {
    try {
      console.log("Creating product:", data);

      const productData = {
        ...data,
        images: data.uploadedImageUrls,
      };

      delete (productData as Record<string, unknown>).uploadedImageUrls;

      console.log("Product data with uploaded images:", productData);
    } catch (error) {
      console.error("Error creating product:", error);
    }
  };

  const handleExportMajorDraw = async (format: "csv" | "excel") => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/admin/major-draw/export?format=${format}`);

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `major-draw-participants-${new Date().toISOString().split("T")[0]}.${
        format === "excel" ? "xlsx" : "csv"
      }`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setIsExportModalOpen(false);
    } catch (error) {
      console.error("Export error:", error);
      alert("Failed to export data. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <DashboardSection title="Quick Actions" noPadding={false}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          {/* Create Major Draw - Primary Action */}
          <button
            onClick={() => setIsAdminMajorDrawModalOpen(true)}
            className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white py-4 flex flex-col items-center justify-center rounded-lg transition-all duration-200 shadow-sm hover:shadow-md min-h-[80px]"
          >
            <Trophy className="w-5 h-5 mb-1.5" />
            <span className="text-sm font-medium">Create Major Draw</span>
          </button>

          {/* Add Product */}
          <button
            onClick={() => setIsProductModalOpen(true)}
            className="bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 text-gray-700 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-700 hover:border-gray-300 dark:hover:border-neutral-500 py-4 flex flex-col items-center justify-center rounded-lg transition-all duration-200 shadow-sm dark:shadow-none hover:shadow-md min-h-[80px]"
          >
            <Package className="w-5 h-5 mb-1.5" />
            <span className="text-sm font-medium">Add Product</span>
          </button>

          {/* Send Broadcast */}
          <button
            className="bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 text-gray-700 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-700 hover:border-gray-300 dark:hover:border-neutral-500 py-4 flex flex-col items-center justify-center rounded-lg transition-all duration-200 shadow-sm dark:shadow-none hover:shadow-md min-h-[80px]"
          >
            <Megaphone className="w-5 h-5 mb-1.5" />
            <span className="text-sm font-medium">Send Broadcast</span>
          </button>

          {/* Export Participants */}
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 text-gray-700 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-700 hover:border-gray-300 dark:hover:border-neutral-500 py-4 flex flex-col items-center justify-center rounded-lg transition-all duration-200 shadow-sm dark:shadow-none hover:shadow-md min-h-[80px]"
          >
            <Download className="w-5 h-5 mb-1.5" />
            <span className="text-sm font-medium">Export Participants</span>
          </button>
        </div>
      </DashboardSection>

      {/* Admin Product Modal */}
      <AdminProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onSubmit={handleCreateProduct}
      />

      {/* Admin Major Draw Modal */}
      <AdminMajorDrawModal
        isOpen={isAdminMajorDrawModalOpen}
        onClose={() => setIsAdminMajorDrawModalOpen(false)}
        onSuccess={() => {
          onRefreshStats();
        }}
      />

      {/* Export Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in border border-gray-200 dark:border-neutral-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Export Major Draw Participants</h3>
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-300 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-gray-600 dark:text-neutral-400 mb-6 text-sm">
              Export all participants and their entry counts from the current major draw.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => handleExportMajorDraw("csv")}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold"
              >
                <Download className="w-5 h-5" />
                {isExporting ? "Exporting..." : "Export as CSV"}
              </button>
              <button
                onClick={() => handleExportMajorDraw("excel")}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold"
              >
                <Download className="w-5 h-5" />
                {isExporting ? "Exporting..." : "Export as Excel"}
              </button>
              <button
                onClick={() => setIsExportModalOpen(false)}
                disabled={isExporting}
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-neutral-600 text-gray-700 dark:text-neutral-200 rounded-xl hover:bg-gray-50 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
