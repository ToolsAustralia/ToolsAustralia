"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Truck, Lock, CheckCircle, AlertCircle } from "lucide-react";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import OrderSummary from "./OrderSummary";
import ShippingForm from "./ShippingForm";
import PaymentMethod from "./PaymentMethod";
import SecurityFeatures from "./SecurityFeatures";

// Mock cart data - matches the header cart items
const mockCartItems = [
  {
    id: "1",
    name: "DeWalt Cordless Drill",
    price: 299.99,
    quantity: 1,
    image: "/images/SampleProducts/dewalt1.jpg",
    brand: "DeWalt",
    model: "DCD791D2",
    weight: "3.4 lbs",
    warranty: "3 years",
  },
  {
    id: "2",
    name: "Milwaukee Impact Driver",
    price: 199.99,
    quantity: 2,
    image: "/images/SampleProducts/milwaukee1.jpg",
    brand: "Milwaukee",
    model: "2853-20",
    weight: "2.6 lbs",
    warranty: "5 years",
  },
  {
    id: "3",
    name: "Makita Circular Saw",
    price: 449.99,
    quantity: 1,
    image: "/images/SampleProducts/makita1.jpg",
    brand: "Makita",
    model: "5007MGA",
    weight: "4.2 lbs",
    warranty: "3 years",
  },
];

const mockShippingOptions = [
  {
    id: "standard",
    name: "Standard Shipping",
    description: "5-7 business days",
    price: 0,
    free: true,
  },
  {
    id: "express",
    name: "Express Shipping",
    description: "2-3 business days",
    price: 15.99,
    free: false,
  },
  {
    id: "overnight",
    name: "Overnight Shipping",
    description: "Next business day",
    price: 29.99,
    free: false,
  },
];

interface ShippingInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  apartment?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

interface PaymentInfo {
  method: "card" | "paypal" | "apple_pay" | "google_pay";
  cardNumber?: string;
  expiryDate?: string;
  cvv?: string;
  nameOnCard?: string;
}

export default function CheckoutPageClient() {
  const router = useRouter();
  const { trackInitiateCheckout } = usePixelTracking();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [shippingInfo, setShippingInfo] = useState<ShippingInfo>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    apartment: "",
    city: "",
    state: "",
    zipCode: "",
    country: "Australia",
  });
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>({
    method: "card",
  });
  const [selectedShipping, setSelectedShipping] = useState(mockShippingOptions[0]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Calculate totals with VIP Pro discount (20% off)
  const subtotal = mockCartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const vipDiscount = subtotal * 0.2; // 20% VIP Pro discount
  const discountedSubtotal = subtotal - vipDiscount;
  const shippingCost = selectedShipping.price;
  const tax = discountedSubtotal * 0.1; // 10% GST
  const total = discountedSubtotal + shippingCost + tax;

  // Track initiate checkout when component mounts
  useEffect(() => {
    trackInitiateCheckout({
      value: total,
      currency: "AUD",
      content_type: "product",
      content_ids: mockCartItems.map((item) => item.id),
      num_items: mockCartItems.reduce((sum, item) => sum + item.quantity, 0),
    });
  }, [trackInitiateCheckout, total]);

  // Handle form validation
  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 1) {
      // Validate shipping info
      if (!shippingInfo.firstName.trim()) newErrors.firstName = "First name is required";
      if (!shippingInfo.lastName.trim()) newErrors.lastName = "Last name is required";
      if (!shippingInfo.email.trim()) newErrors.email = "Email is required";
      else if (!/\S+@\S+\.\S+/.test(shippingInfo.email)) newErrors.email = "Invalid email format";
      if (!shippingInfo.phone.trim()) newErrors.phone = "Phone number is required";
      if (!shippingInfo.address.trim()) newErrors.address = "Address is required";
      if (!shippingInfo.city.trim()) newErrors.city = "City is required";
      if (!shippingInfo.state.trim()) newErrors.state = "State is required";
      if (!shippingInfo.zipCode.trim()) newErrors.zipCode = "ZIP code is required";
    }

    if (step === 2) {
      // Validate payment info
      if (paymentInfo.method === "card") {
        if (!paymentInfo.cardNumber?.trim()) newErrors.cardNumber = "Card number is required";
        if (!paymentInfo.expiryDate?.trim()) newErrors.expiryDate = "Expiry date is required";
        if (!paymentInfo.cvv?.trim()) newErrors.cvv = "CVV is required";
        if (!paymentInfo.nameOnCard?.trim()) newErrors.nameOnCard = "Name on card is required";
      }
    }

    if (step === 3) {
      // Validate terms acceptance
      if (!termsAccepted) newErrors.terms = "You must accept the terms and conditions";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle step navigation
  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 3));
    }
  };

  const handlePrevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  // Handle order completion
  const handleCompleteOrder = async () => {
    if (!validateStep(3)) return;

    setIsLoading(true);

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Redirect to success page
      router.push("/checkout/success?orderId=ORD-2024-001");
    } catch (error) {
      console.error("Order failed:", error);
      setErrors({ general: "Failed to process order. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  const steps = [
    { id: 1, title: "Shipping", icon: Truck },
    { id: 2, title: "Payment", icon: CreditCard },
    { id: 3, title: "Review", icon: CheckCircle },
  ];

  return (
    <div className="bg-gray-50 pt-[86px] sm:pt-[106px] min-h-screen-svh">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2 font-['Poppins']">Secure Checkout</h1>
          <p className="text-gray-600">Complete your order in just a few steps</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;

              return (
                <React.Fragment key={step.id}>
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                        isCompleted
                          ? "bg-green-500 border-green-500 text-white"
                          : isActive
                          ? "bg-red-500 border-red-500 text-white"
                          : "bg-white border-gray-300 text-gray-400"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span
                      className={`mt-2 text-sm font-medium ${
                        isActive || isCompleted ? "text-gray-900" : "text-gray-400"
                      }`}
                    >
                      {step.title}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`w-16 h-0.5 mx-4 ${isCompleted ? "bg-green-500" : "bg-gray-300"}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Checkout Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Shipping Information */}
            {currentStep === 1 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Truck className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 font-['Poppins']">Shipping Information</h2>
                    <p className="text-gray-600">Where should we deliver your order?</p>
                  </div>
                </div>

                <ShippingForm shippingInfo={shippingInfo} setShippingInfo={setShippingInfo} errors={errors} />

                {/* Shipping Options */}
                <div className="mt-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Shipping Method</h3>
                  <div className="space-y-3">
                    {mockShippingOptions.map((option) => (
                      <label
                        key={option.id}
                        className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                          selectedShipping.id === option.id
                            ? "border-red-500 bg-red-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="shipping"
                          value={option.id}
                          checked={selectedShipping.id === option.id}
                          onChange={() => setSelectedShipping(option)}
                          className="sr-only"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-gray-900">{option.name}</div>
                              <div className="text-sm text-gray-600">{option.description}</div>
                            </div>
                            <div className="text-right">
                              {option.free ? (
                                <span className="text-green-600 font-semibold">FREE</span>
                              ) : (
                                <span className="font-semibold text-gray-900">${option.price.toFixed(2)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Payment Method */}
            {currentStep === 2 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CreditCard className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 font-['Poppins']">Payment Method</h2>
                    <p className="text-gray-600">Choose how you&apos;d like to pay</p>
                  </div>
                </div>

                <PaymentMethod paymentInfo={paymentInfo} setPaymentInfo={setPaymentInfo} errors={errors} />
              </div>
            )}

            {/* Step 3: Review Order */}
            {currentStep === 3 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <CheckCircle className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 font-['Poppins']">Review Your Order</h2>
                    <p className="text-gray-600">Please review your order details</p>
                  </div>
                </div>

                {/* Order Summary */}
                <div className="space-y-6">
                  {/* Shipping Address */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Shipping Address</h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="font-medium text-gray-900">
                        {shippingInfo.firstName} {shippingInfo.lastName}
                      </p>
                      <p className="text-gray-600">{shippingInfo.address}</p>
                      {shippingInfo.apartment && <p className="text-gray-600">Apt {shippingInfo.apartment}</p>}
                      <p className="text-gray-600">
                        {shippingInfo.city}, {shippingInfo.state} {shippingInfo.zipCode}
                      </p>
                      <p className="text-gray-600">{shippingInfo.country}</p>
                    </div>
                  </div>

                  {/* Shipping Method */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Shipping Method</h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="font-medium text-gray-900">{selectedShipping.name}</p>
                      <p className="text-gray-600">{selectedShipping.description}</p>
                      <p className="text-gray-600">
                        {selectedShipping.free ? "FREE" : `$${selectedShipping.price.toFixed(2)}`}
                      </p>
                    </div>
                  </div>

                  {/* Terms and Conditions */}
                  <div>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        className="mt-1 w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-2 focus:ring-red-500/20"
                      />
                      <span className="text-sm text-gray-600">
                        I agree to the{" "}
                        <a href="/terms" className="text-red-600 hover:text-red-700 underline">
                          Terms and Conditions
                        </a>{" "}
                        and{" "}
                        <a href="/privacy" className="text-red-600 hover:text-red-700 underline">
                          Privacy Policy
                        </a>
                      </span>
                    </label>
                    {errors.terms && <p className="text-red-600 text-sm mt-1">{errors.terms}</p>}
                  </div>

                  {/* General Error */}
                  {errors.general && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-red-600" />
                        <p className="text-red-800">{errors.general}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between">
              <button
                onClick={handlePrevStep}
                disabled={currentStep === 1}
                className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                  currentStep === 1
                    ? "text-gray-400 cursor-not-allowed"
                    : "text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                Previous
              </button>

              {currentStep < 3 ? (
                <button
                  onClick={handleNextStep}
                  className="px-8 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-all duration-200 flex items-center gap-2"
                >
                  Continue to {steps[currentStep]?.title}
                </button>
              ) : (
                <button
                  onClick={handleCompleteOrder}
                  disabled={isLoading}
                  className="px-8 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Lock className="w-5 h-5" />
                      Complete Order - ${total.toFixed(2)}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Right Column - Order Summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <OrderSummary
                items={mockCartItems}
                subtotal={discountedSubtotal}
                originalSubtotal={subtotal}
                vipDiscount={vipDiscount}
                shippingCost={shippingCost}
                tax={tax}
                total={total}
                userMembership="VIP Pro"
              />
              <SecurityFeatures />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
