"use client";

import React from "react";
import { AlertTriangle, CheckCircle, ArrowUp, ArrowDown, XCircle } from "lucide-react";
import { Button } from "./ui";

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  type: "upgrade" | "downgrade" | "cancel" | "warning";
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  isLoading?: boolean;
  details?: {
    packageName: string;
    price?: number;
    benefits?: string[];
    warnings?: string[];
    info?: string[];
    // ✅ NEW: Proration details for upgrades
    proration?: {
      fromPackage: { name: string; price: number; entriesPerMonth: number };
      toPackage: { name: string; price: number; entriesPerMonth: number };
      prorationAmount: number;
      proratedEntries: number;
      billingInfo?: {
        currentBillingDate: string;
        nextBillingDate: string;
        nextBillingAmount: number;
        billingDateStays: boolean;
      };
    };
  };
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  type,
  title,
  message,
  confirmText,
  cancelText = "Cancel",
  isLoading = false,
  details,
}) => {
  const getIcon = () => {
    switch (type) {
      case "upgrade":
        return <ArrowUp className="w-5 h-5 text-green-600" />;
      case "downgrade":
        return <ArrowDown className="w-5 h-5 text-orange-600" />;
      case "cancel":
        return <XCircle className="w-5 h-5 text-red-600" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      default:
        return <CheckCircle className="w-5 h-5 text-blue-600" />;
    }
  };

  const getButtonStyle = () => {
    switch (type) {
      case "upgrade":
        return "bg-green-600 hover:bg-green-700 text-white";
      case "downgrade":
        return "border-orange-300 text-orange-600 hover:bg-orange-50";
      case "cancel":
        return "border-red-300 text-red-600 hover:bg-red-50";
      case "warning":
        return "border-yellow-300 text-yellow-600 hover:bg-yellow-50";
      default:
        return "bg-blue-600 hover:bg-blue-700 text-white";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg sm:rounded-xl shadow-2xl w-full max-w-sm sm:max-w-md mx-auto max-h-[90dvh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            {getIcon()}
            <h3 className="text-lg sm:text-xl font-bold text-gray-900">{title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Main message */}
          <p className="text-sm sm:text-base text-gray-700 leading-relaxed">{message}</p>

          {/* Details section */}
          {details && (
            <div className="space-y-3">
              {/* Package info */}
              {details.packageName && details.price && (
                <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{details.packageName}</span>
                    <span className="text-lg font-bold text-gray-900">${details.price}/month</span>
                  </div>
                </div>
              )}

              {/* Benefits */}
              {details.benefits && details.benefits.length > 0 && (
                <div className="bg-green-50 rounded-lg p-3 sm:p-4">
                  <h4 className="text-sm font-medium text-green-800 mb-2">You&apos;ll get:</h4>
                  <ul className="text-sm text-green-700 space-y-1">
                    {details.benefits.map((benefit, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <CheckCircle className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Proration Details */}
              {details.proration && (
                <div className="bg-purple-50 rounded-lg p-3 sm:p-4 border border-purple-200">
                  <h4 className="text-sm font-medium text-purple-800 mb-3 flex items-center gap-2">
                    <ArrowUp className="w-4 h-4" />
                    Upgrade Proration Details
                  </h4>

                  {/* Package Comparison */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-white rounded-lg p-2 border border-purple-100">
                      <div className="text-xs text-purple-600 font-medium mb-1">Current Plan</div>
                      <div className="text-sm font-semibold text-gray-900">{details.proration.fromPackage.name}</div>
                      <div className="text-xs text-gray-600">${details.proration.fromPackage.price}/month</div>
                      <div className="text-xs text-gray-600">
                        {details.proration.fromPackage.entriesPerMonth} entries
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-2 border border-purple-100">
                      <div className="text-xs text-purple-600 font-medium mb-1">New Plan</div>
                      <div className="text-sm font-semibold text-gray-900">{details.proration.toPackage.name}</div>
                      <div className="text-xs text-gray-600">${details.proration.toPackage.price}/month</div>
                      <div className="text-xs text-gray-600">{details.proration.toPackage.entriesPerMonth} entries</div>
                    </div>
                  </div>

                  {/* Proration Amount */}
                  <div className="bg-white rounded-lg p-3 border border-purple-100">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-900">Prorated Amount Today:</span>
                      <span className="text-lg font-bold text-green-600">
                        ${details.proration.prorationAmount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-900">Prorated Entries:</span>
                      <span className="text-lg font-bold text-blue-600">
                        {details.proration.proratedEntries} entries
                      </span>
                    </div>
                    {details.proration.billingInfo && (
                      <div className="pt-2 border-t border-purple-100">
                        <div className="text-xs text-purple-600 mb-1">Next Billing Cycle:</div>
                        <div className="text-sm text-gray-700">
                          ${details.proration.billingInfo.nextBillingAmount}/month starting{" "}
                          {details.proration.billingInfo.nextBillingDate}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 sm:gap-3 p-4 sm:p-6 pt-0">
          <Button onClick={onClose} variant="secondary" className="flex-1 text-sm sm:text-base" disabled={isLoading}>
            {cancelText}
          </Button>
          <Button
            onClick={onConfirm}
            variant="secondary"
            className={`flex-1 text-sm sm:text-base ${getButtonStyle()}`}
            loading={isLoading}
            disabled={isLoading}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
