"use client";

import { CreditCard, Smartphone, Shield, Lock } from "lucide-react";

interface PaymentInfo {
  method: "card" | "paypal" | "apple_pay" | "google_pay";
  cardNumber?: string;
  expiryDate?: string;
  cvv?: string;
  nameOnCard?: string;
}

interface PaymentMethodProps {
  paymentInfo: PaymentInfo;
  setPaymentInfo: React.Dispatch<React.SetStateAction<PaymentInfo>>;
  errors: Record<string, string>;
}

const paymentMethods = [
  {
    id: "card",
    name: "Credit/Debit Card",
    description: "Visa, Mastercard, American Express",
    icon: CreditCard,
    color: "blue",
  },
  {
    id: "paypal",
    name: "PayPal",
    description: "Pay with your PayPal account",
    icon: Shield,
    color: "blue",
  },
  {
    id: "apple_pay",
    name: "Apple Pay",
    description: "Touch ID or Face ID to pay",
    icon: Smartphone,
    color: "gray",
  },
  {
    id: "google_pay",
    name: "Google Pay",
    description: "Quick and secure payment",
    icon: Smartphone,
    color: "gray",
  },
];

export default function PaymentMethod({ paymentInfo, setPaymentInfo, errors }: PaymentMethodProps) {
  const handleMethodChange = (method: PaymentInfo["method"]) => {
    setPaymentInfo((prev) => ({
      ...prev,
      method,
      // Clear card details when switching methods
      ...(method !== "card" && {
        cardNumber: "",
        expiryDate: "",
        cvv: "",
        nameOnCard: "",
      }),
    }));
  };

  const handleCardInputChange = (field: keyof PaymentInfo, value: string) => {
    setPaymentInfo((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const formatCardNumber = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, "");
    // Add spaces every 4 digits
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const formatExpiryDate = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, "");
    // Add slash after 2 digits
    if (digits.length >= 2) {
      return digits.slice(0, 2) + "/" + digits.slice(2, 4);
    }
    return digits;
  };

  return (
    <div className="space-y-6">
      {/* Payment Method Selection */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Choose Payment Method</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {paymentMethods.map((method) => {
            const Icon = method.icon;
            const isSelected = paymentInfo.method === method.id;

            return (
              <label
                key={method.id}
                className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                  isSelected ? "border-red-500 bg-red-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={method.id}
                  checked={isSelected}
                  onChange={() => handleMethodChange(method.id as PaymentInfo["method"])}
                  className="sr-only"
                />
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isSelected ? "bg-red-100" : "bg-gray-100"}`}>
                    <Icon className={`w-5 h-5 ${isSelected ? "text-red-600" : "text-gray-600"}`} />
                  </div>
                  <div>
                    <div className={`font-medium ${isSelected ? "text-red-900" : "text-gray-900"}`}>{method.name}</div>
                    <div className={`text-sm ${isSelected ? "text-red-700" : "text-gray-600"}`}>
                      {method.description}
                    </div>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Card Payment Form */}
      {paymentInfo.method === "card" && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Lock className="w-4 h-4 text-green-600" />
            <span>Your payment information is encrypted and secure</span>
          </div>

          {/* Card Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Card Number *</label>
            <input
              type="text"
              value={paymentInfo.cardNumber || ""}
              onChange={(e) => handleCardInputChange("cardNumber", formatCardNumber(e.target.value))}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 ${
                errors.cardNumber ? "border-red-500 bg-red-50" : "border-gray-300 hover:border-red-400"
              }`}
              placeholder="1234 5678 9012 3456"
              maxLength={19}
            />
            {errors.cardNumber && <p className="text-red-600 text-sm mt-1">{errors.cardNumber}</p>}
          </div>

          {/* Card Holder Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Name on Card *</label>
            <input
              type="text"
              value={paymentInfo.nameOnCard || ""}
              onChange={(e) => handleCardInputChange("nameOnCard", e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 ${
                errors.nameOnCard ? "border-red-500 bg-red-50" : "border-gray-300 hover:border-red-400"
              }`}
              placeholder="John Smith"
            />
            {errors.nameOnCard && <p className="text-red-600 text-sm mt-1">{errors.nameOnCard}</p>}
          </div>

          {/* Expiry Date and CVV */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Expiry Date *</label>
              <input
                type="text"
                value={paymentInfo.expiryDate || ""}
                onChange={(e) => handleCardInputChange("expiryDate", formatExpiryDate(e.target.value))}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 ${
                  errors.expiryDate ? "border-red-500 bg-red-50" : "border-gray-300 hover:border-red-400"
                }`}
                placeholder="MM/YY"
                maxLength={5}
              />
              {errors.expiryDate && <p className="text-red-600 text-sm mt-1">{errors.expiryDate}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">CVV *</label>
              <input
                type="text"
                value={paymentInfo.cvv || ""}
                onChange={(e) => handleCardInputChange("cvv", e.target.value.replace(/\D/g, ""))}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 ${
                  errors.cvv ? "border-red-500 bg-red-50" : "border-gray-300 hover:border-red-400"
                }`}
                placeholder="123"
                maxLength={4}
              />
              {errors.cvv && <p className="text-red-600 text-sm mt-1">{errors.cvv}</p>}
            </div>
          </div>

          {/* Security Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900 mb-1">Secure Payment Processing</h4>
                <p className="text-sm text-blue-800">
                  Your payment information is encrypted and processed securely by Stripe. We never store your complete
                  card details on our servers.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alternative Payment Methods */}
      {paymentInfo.method !== "card" && (
        <div className="text-center py-8">
          <div
            className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
              paymentInfo.method === "paypal" ? "bg-blue-100" : "bg-gray-100"
            }`}
          >
            {paymentInfo.method === "paypal" ? (
              <Shield className="w-8 h-8 text-blue-600" />
            ) : (
              <Smartphone className="w-8 h-8 text-gray-600" />
            )}
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {paymentMethods.find((m) => m.id === paymentInfo.method)?.name}
          </h3>
          <p className="text-gray-600 mb-4">{paymentMethods.find((m) => m.id === paymentInfo.method)?.description}</p>
          <p className="text-sm text-gray-500">You&apos;ll be redirected to complete your payment securely</p>
        </div>
      )}
    </div>
  );
}
