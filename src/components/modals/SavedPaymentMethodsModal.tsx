"use client";

import React, { useState } from "react";
import { CreditCard, Trash2, Star, Plus } from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";
import { useSavedPaymentMethods, type SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";

interface SavedPaymentMethodsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPaymentMethod?: (paymentMethod: SavedPaymentMethod) => void;
  showAddNew?: boolean;
  onAddNew?: () => void;
  isAuthenticated?: boolean;
}

const SavedPaymentMethodsModal: React.FC<SavedPaymentMethodsModalProps> = ({
  isOpen,
  onClose,
  onSelectPaymentMethod,
  showAddNew = true,
  onAddNew,
  // isAuthenticated = false, // TODO: Use for authentication checks
}) => {
  const { paymentMethods, loading, error, deletePaymentMethod, setDefaultPaymentMethod } = useSavedPaymentMethods();

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  const handleDelete = async (paymentMethodId: string) => {
    if (!confirm("Are you sure you want to delete this payment method?")) {
      return;
    }

    setDeletingId(paymentMethodId);
    const success = await deletePaymentMethod(paymentMethodId);
    setDeletingId(null);

    if (!success) {
      alert("Failed to delete payment method. Please try again.");
    }
  };

  const handleSetDefault = async (paymentMethodId: string) => {
    setSettingDefaultId(paymentMethodId);
    const success = await setDefaultPaymentMethod(paymentMethodId);
    setSettingDefaultId(null);

    if (!success) {
      alert("Failed to set default payment method. Please try again.");
    }
  };

  const handleSelect = (paymentMethod: SavedPaymentMethod) => {
    onSelectPaymentMethod?.(paymentMethod);
    onClose();
  };

  const getCardBrandIcon = (brand: string) => {
    const brandLower = brand.toLowerCase();
    if (brandLower.includes("visa")) return "💳";
    if (brandLower.includes("mastercard")) return "💳";
    if (brandLower.includes("amex") || brandLower.includes("american express")) return "💳";
    return "💳";
  };

  const formatExpiryDate = (month: number, year: number) => {
    return `${month.toString().padStart(2, "0")}/${year.toString().slice(-2)}`;
  };

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl w-full mx-2 sm:mx-4 max-h-[85dvh] sm:max-h-[90dvh] overflow-hidden">
        <ModalHeader title="Payment Methods" onClose={onClose} />

        <ModalContent>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
              <p className="font-medium">Error</p>
              <p className="text-sm">{error}</p>
            </div>
          )}

          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto mb-2"></div>
              <p className="text-gray-600">Loading payment methods...</p>
            </div>
          )}

          {!loading && paymentMethods.length === 0 && (
            <div className="text-center py-12">
              <CreditCard className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Saved Payment Methods</h3>
              <p className="text-gray-600 mb-6">You haven&apos;t saved any payment methods yet.</p>
              {showAddNew && onAddNew && (
                <Button
                  onClick={onAddNew}
                  className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-3 sm:px-6 py-1.5 sm:py-3 rounded-lg sm:rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl text-xs sm:text-base"
                >
                  <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Add Payment Method</span>
                  <span className="sm:hidden">Add Card</span>
                </Button>
              )}
            </div>
          )}

          {!loading && paymentMethods.length > 0 && (
            <div className="space-y-2 sm:space-y-3">
              {paymentMethods.map((paymentMethod) => (
                <div
                  key={paymentMethod.paymentMethodId}
                  className={`border-2 rounded-xl p-3 sm:p-4 transition-all duration-200 ${
                    paymentMethod.isDefault
                      ? "border-blue-500 bg-white"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 sm:gap-4">
                      {/* Card Icon */}
                      <div className="flex items-center justify-center w-10 h-6 sm:w-12 sm:h-8 bg-gray-100 rounded-lg">
                        <span className="text-lg sm:text-xl">{getCardBrandIcon(paymentMethod.card?.brand || "")}</span>
                      </div>

                      {/* Card Details */}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 text-xs sm:text-base">
                            {paymentMethod.card?.brand?.toUpperCase() || "CARD"} •••• {paymentMethod.card?.last4}
                          </h3>
                          {paymentMethod.isDefault && (
                            <div className="flex items-center gap-1">
                              <Star className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500 fill-current" />
                              <span className="text-xs text-blue-600 font-medium">DEFAULT</span>
                            </div>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-gray-600">
                          Expires{" "}
                          {formatExpiryDate(paymentMethod.card?.expMonth || 0, paymentMethod.card?.expYear || 0)}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 sm:gap-2">
                      {onSelectPaymentMethod && (
                        <Button
                          onClick={() => handleSelect(paymentMethod)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-1 sm:px-3 py-1 sm:py-2 rounded text-xs sm:text-sm font-medium transition-colors w-8 h-6 sm:w-auto sm:h-auto"
                        >
                          Use
                        </Button>
                      )}

                      {!paymentMethod.isDefault && (
                        <Button
                          onClick={() => handleSetDefault(paymentMethod.paymentMethodId)}
                          disabled={settingDefaultId === paymentMethod.paymentMethodId}
                          className="bg-gray-600 hover:bg-gray-700 text-white px-0.5 sm:px-2 py-0.5 sm:py-1.5 rounded text-xs sm:text-sm font-medium transition-colors disabled:opacity-50 w-8 h-6 sm:w-auto sm:h-auto"
                        >
                          <span className="hidden sm:inline">
                            {settingDefaultId === paymentMethod.paymentMethodId ? "..." : "Set Default"}
                          </span>
                          <span className="sm:hidden">Set</span>
                        </Button>
                      )}

                      <Button
                        onClick={() => handleDelete(paymentMethod.paymentMethodId)}
                        disabled={deletingId === paymentMethod.paymentMethodId}
                        className="bg-red-600 hover:bg-red-700 text-white px-0.5 sm:px-3 py-0.5 sm:py-2 rounded text-xs sm:text-sm font-medium transition-colors disabled:opacity-50 w-8 h-6 sm:w-auto sm:h-auto"
                      >
                        {deletingId === paymentMethod.paymentMethodId ? (
                          <div className="animate-spin rounded-full h-2 w-2 sm:h-4 sm:w-4 border-b-2 border-white"></div>
                        ) : (
                          <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              {showAddNew && onAddNew && (
                <div className="pt-4 border-t border-gray-200">
                  <Button
                    onClick={onAddNew}
                    className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white py-3 px-6 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    Add New Payment Method
                  </Button>
                </div>
              )}
            </div>
          )}
        </ModalContent>
      </div>
    </ModalContainer>
  );
};

export default SavedPaymentMethodsModal;
