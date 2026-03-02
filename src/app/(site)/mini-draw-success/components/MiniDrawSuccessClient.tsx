"use client";

import React from "react";
import Link from "next/link";
import { PaymentSuccessHandler } from "@/components/payment/PaymentSuccessHandler";
import { CheckCircle } from "lucide-react";

interface MiniDrawSuccessClientProps {
  searchParams: {
    payment_intent_client_secret?: string;
    payment_intent?: string;
  };
}

export default function MiniDrawSuccessClient({ searchParams: _searchParams }: MiniDrawSuccessClientProps) {
  return (
    <div className="bg-gray-50 pt-[86px] sm:pt-[106px] min-h-screen-svh">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2 font-['Poppins']">
            Mini Draw Entry Successful!
          </h1>
          <p className="text-gray-600 text-lg">
            Thank you for your purchase. Your entry has been added to the mini draw.
          </p>
        </div>

        {/* Payment Status Handler */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
          <PaymentSuccessHandler paymentType="mini-draw" successMessage="Your mini-draw entry was added successfully!">
            <div className="mt-4 space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 text-sm font-medium">
                  Your entry has been processed successfully. Good luck in the draw!
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/my-account"
                  className="inline-flex items-center justify-center px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors"
                >
                  View My Account
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center px-6 py-3 bg-gray-200 text-gray-900 font-medium rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Continue Shopping
                </Link>
              </div>
            </div>
          </PaymentSuccessHandler>
        </div>

        {/* Additional Information */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">What&apos;s Next?</h2>
          <ul className="space-y-3 text-gray-600">
            <li className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span>Your entry has been added to the mini draw</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span>You will receive a confirmation email with your entry details</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span>You can view your draw entries in the My Account section</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
