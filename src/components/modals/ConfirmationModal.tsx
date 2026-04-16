"use client";

import React, { useState } from "react";
import { AlertTriangle, CheckCircle, ArrowUp, ArrowDown, XCircle, Trash2 } from "lucide-react";
import { Button, ModalContainer } from "./ui";

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  type: "upgrade" | "downgrade" | "cancel" | "warning" | "delete";
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
    // ✅ NEW: Deletion details for user deletion confirmation
    deletionDetails?: {
      majorDrawEntries: number;
      miniDrawEntries: number;
      affiliateCommissions: number;
      paymentEvents: number;
      orders: number;
      winners: number;
      referralEvents: {
        asReferrer: number;
        asInvitee: number;
        total: number;
      };
      ticketEntries: number;
      warnings: {
        hasActiveSubscription: boolean;
        isWinner: boolean;
        winnerDraws?: Array<{ drawName: string; drawType: "major" | "mini" }>;
      };
    };
    // Email confirmation for deletions
    requireEmailConfirmation?: boolean;
    userEmail?: string;
  };
  /** When set, user must check the box before Confirm is enabled (e.g. payment method removal risk). */
  requireCheckboxToConfirm?: {
    label: string;
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
  requireCheckboxToConfirm,
}) => {
  // Email confirmation state for deletions
  const [emailConfirmation, setEmailConfirmation] = useState("");
  const [riskCheckbox, setRiskCheckbox] = useState(false);

  // Reset email confirmation when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      setEmailConfirmation("");
      setRiskCheckbox(false);
    }
  }, [isOpen]);
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
      case "delete":
        return <Trash2 className="w-5 h-5 text-red-600" />;
      default:
        return <CheckCircle className="w-5 h-5 text-blue-600" />;
    }
  };

  const getButtonStyle = () => {
    switch (type) {
      case "upgrade":
        return "bg-green-600 hover:bg-green-700 text-white";
      case "downgrade":
        return "border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-600/60 dark:text-orange-400 dark:hover:bg-orange-950/40";
      case "cancel":
        return "border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/40";
      case "warning":
        return "border-yellow-300 text-yellow-600 hover:bg-yellow-50 dark:border-yellow-600/60 dark:text-yellow-400 dark:hover:bg-yellow-950/40";
      case "delete":
        return "bg-red-600 hover:bg-red-700 text-white";
      default:
        return "bg-blue-600 hover:bg-blue-700 text-white";
    }
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      height="auto"
      className="max-h-[90dvh] !max-w-sm sm:!max-w-md rounded-xl sm:rounded-xl shadow-2xl"
      nestedSecondary
    >
      <div className="relative flex flex-col max-h-[90dvh] overflow-hidden w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-neutral-700">
          <div className="flex items-center gap-3">
            {getIcon()}
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-neutral-100">{title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-300 transition-colors p-1">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Main message */}
          <p className="text-sm sm:text-base text-gray-700 dark:text-neutral-200 leading-relaxed">{message}</p>

          {requireCheckboxToConfirm && (
            <label className="flex items-start gap-2 cursor-pointer text-sm text-gray-800 dark:text-neutral-200">
              <input
                type="checkbox"
                className="mt-1 rounded border-gray-300 dark:border-neutral-600"
                checked={riskCheckbox}
                onChange={(e) => setRiskCheckbox(e.target.checked)}
              />
              <span>{requireCheckboxToConfirm.label}</span>
            </label>
          )}

          {/* Details section */}
          {details && (
            <div className="space-y-3">
              {/* Package info */}
              {details.packageName && details.price && (
                <div className="bg-gray-50 dark:bg-neutral-800/90 rounded-lg p-3 sm:p-4 border border-transparent dark:border-neutral-700">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-neutral-100">{details.packageName}</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-neutral-100">${details.price}/month</span>
                  </div>
                </div>
              )}

              {/* Benefits */}
              {details.benefits && details.benefits.length > 0 && (
                <div className="bg-green-50 dark:bg-green-950/35 rounded-lg p-3 sm:p-4 border border-green-100 dark:border-green-900/50">
                  <h4 className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">You&apos;ll get:</h4>
                  <ul className="text-sm text-green-700 dark:text-green-300 space-y-1">
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
                <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-3 sm:p-4 border border-purple-200 dark:border-purple-900/50">
                  <h4 className="text-sm font-medium text-purple-800 dark:text-purple-200 mb-3 flex items-center gap-2">
                    <ArrowUp className="w-4 h-4" />
                    Upgrade Proration Details
                  </h4>

                  {/* Package Comparison */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-white dark:bg-neutral-900/90 rounded-lg p-2 border border-purple-100 dark:border-purple-900/40">
                      <div className="text-xs text-purple-600 dark:text-purple-300 font-medium mb-1">Current Plan</div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{details.proration.fromPackage.name}</div>
                      <div className="text-xs text-gray-600 dark:text-neutral-400">${details.proration.fromPackage.price}/month</div>
                      <div className="text-xs text-gray-600 dark:text-neutral-400">
                        {details.proration.fromPackage.entriesPerMonth} entries
                      </div>
                    </div>
                    <div className="bg-white dark:bg-neutral-900/90 rounded-lg p-2 border border-purple-100 dark:border-purple-900/40">
                      <div className="text-xs text-purple-600 dark:text-purple-300 font-medium mb-1">New Plan</div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{details.proration.toPackage.name}</div>
                      <div className="text-xs text-gray-600 dark:text-neutral-400">${details.proration.toPackage.price}/month</div>
                      <div className="text-xs text-gray-600 dark:text-neutral-400">{details.proration.toPackage.entriesPerMonth} entries</div>
                    </div>
                  </div>

                  {/* Proration Amount */}
                  <div className="bg-white dark:bg-neutral-900/90 rounded-lg p-3 border border-purple-100 dark:border-purple-900/40">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-neutral-100">Prorated Amount Today:</span>
                      <span className="text-lg font-bold text-green-600 dark:text-green-400">
                        ${details.proration.prorationAmount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-neutral-100">Prorated Entries:</span>
                      <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        {details.proration.proratedEntries} entries
                      </span>
                    </div>
                    {details.proration.billingInfo && (
                      <div className="pt-2 border-t border-purple-100 dark:border-purple-900/40">
                        <div className="text-xs text-purple-600 dark:text-purple-300 mb-1">Next Billing Cycle:</div>
                        <div className="text-sm text-gray-700 dark:text-neutral-200">
                          ${details.proration.billingInfo.nextBillingAmount}/month starting{" "}
                          {details.proration.billingInfo.nextBillingDate}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Deletion Details */}
              {details?.deletionDetails && (
                <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 sm:p-4 border border-red-200 dark:border-red-900/50">
                  <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    What Will Be Deleted
                  </h4>
                  <div className="space-y-2 text-sm">
                    {details.deletionDetails.majorDrawEntries > 0 && (
                      <div className="flex justify-between text-red-700 dark:text-red-300">
                        <span>Major Draw Entries:</span>
                        <span className="font-semibold">{details.deletionDetails.majorDrawEntries}</span>
                      </div>
                    )}
                    {details.deletionDetails.miniDrawEntries > 0 && (
                      <div className="flex justify-between text-red-700 dark:text-red-300">
                        <span>Mini Draw Entries:</span>
                        <span className="font-semibold">{details.deletionDetails.miniDrawEntries}</span>
                      </div>
                    )}
                    {details.deletionDetails.affiliateCommissions > 0 && (
                      <div className="flex justify-between text-red-700 dark:text-red-300">
                        <span>Affiliate Commissions:</span>
                        <span className="font-semibold">{details.deletionDetails.affiliateCommissions}</span>
                      </div>
                    )}
                    {details.deletionDetails.paymentEvents > 0 && (
                      <div className="flex justify-between text-red-700 dark:text-red-300">
                        <span>Payment Events:</span>
                        <span className="font-semibold">{details.deletionDetails.paymentEvents}</span>
                      </div>
                    )}
                    {details.deletionDetails.orders > 0 && (
                      <div className="flex justify-between text-red-700 dark:text-red-300">
                        <span>Orders:</span>
                        <span className="font-semibold">{details.deletionDetails.orders}</span>
                      </div>
                    )}
                    {details.deletionDetails.winners > 0 && (
                      <div className="flex justify-between text-red-700 dark:text-red-300">
                        <span>Winner Records:</span>
                        <span className="font-semibold">{details.deletionDetails.winners}</span>
                      </div>
                    )}
                    {details.deletionDetails.referralEvents.total > 0 && (
                      <div className="flex justify-between text-red-700 dark:text-red-300">
                        <span>Referral Events:</span>
                        <span className="font-semibold">{details.deletionDetails.referralEvents.total}</span>
                      </div>
                    )}
                    {details.deletionDetails.ticketEntries > 0 && (
                      <div className="flex justify-between text-red-700 dark:text-red-300">
                        <span>Ticket Entries:</span>
                        <span className="font-semibold">{details.deletionDetails.ticketEntries}</span>
                      </div>
                    )}
                  </div>

                  {/* Warnings */}
                  {(details.deletionDetails.warnings.hasActiveSubscription ||
                    details.deletionDetails.warnings.isWinner) && (
                    <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-900/50">
                      <div className="text-xs font-semibold text-red-800 dark:text-red-200 mb-2">⚠️ Warnings:</div>
                      {details.deletionDetails.warnings.hasActiveSubscription && (
                        <div className="text-xs text-red-700 dark:text-red-300 mb-1">
                          • User has an active subscription (will be canceled)
                        </div>
                      )}
                      {details.deletionDetails.warnings.isWinner && (
                        <div className="text-xs text-red-700 dark:text-red-300">
                          • User is a winner in:{" "}
                          {details.deletionDetails.warnings.winnerDraws
                            ?.map((draw) => `${draw.drawName} (${draw.drawType})`)
                            .join(", ") || "Unknown"}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Email Confirmation Input for Deletions */}
              {details?.requireEmailConfirmation && details?.userEmail && (
                <div className="bg-red-50 dark:bg-red-950/25 rounded-lg p-3 sm:p-4 border border-red-200 dark:border-red-900/50">
                  <label className="block text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                    Type the user&apos;s email to confirm deletion:
                  </label>
                  <input
                    type="email"
                    value={emailConfirmation}
                    onChange={(e) => setEmailConfirmation(e.target.value)}
                    placeholder={details.userEmail}
                    className="w-full px-3 py-2 rounded-md text-sm text-gray-900 dark:text-neutral-100 placeholder:text-gray-500 dark:placeholder:text-neutral-500 bg-white dark:bg-neutral-900 border border-red-300 dark:border-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-600"
                  />
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
            disabled={
              isLoading ||
              !!(details?.requireEmailConfirmation && details?.userEmail && emailConfirmation !== details.userEmail) ||
              !!(requireCheckboxToConfirm && !riskCheckbox)
            }
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </ModalContainer>
  );
};

export default ConfirmationModal;
