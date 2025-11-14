"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  CheckCircle,
  Package,
  Truck,
  Mail,
  Phone,
  Download,
  ArrowRight,
  Calendar,
  MapPin,
  CreditCard,
} from "lucide-react";

interface CheckoutSuccessClientProps {
  orderId: string;
}

// Mock order data - matches the cart items from header/checkout
const mockOrderData = {
  id: "ORD-2024-001",
  date: "2024-01-15",
  status: "confirmed",
  total: 1199.97,
  items: [
    {
      id: "1",
      name: "DeWalt Cordless Drill",
      price: 299.99,
      quantity: 1,
      image: "/images/SampleProducts/dewalt1.jpg",
      brand: "DeWalt",
    },
    {
      id: "2",
      name: "Milwaukee Impact Driver",
      price: 199.99,
      quantity: 2,
      image: "/images/SampleProducts/milwaukee1.jpg",
      brand: "Milwaukee",
    },
    {
      id: "3",
      name: "Makita Circular Saw",
      price: 449.99,
      quantity: 1,
      image: "/images/SampleProducts/makita1.jpg",
      brand: "Makita",
    },
  ],
  shipping: {
    method: "Express Shipping",
    estimatedDelivery: "2024-01-17",
    address: {
      name: "John Smith",
      street: "123 Main Street",
      city: "Sydney",
      state: "NSW",
      zipCode: "2000",
      country: "Australia",
    },
  },
  payment: {
    method: "Visa ending in 4242",
    amount: 1199.97,
  },
};

export default function CheckoutSuccessClient({ orderId }: CheckoutSuccessClientProps) {
  // Use mock data for now
  const order = mockOrderData;

  return (
    <div className="bg-gray-50 pt-[86px] sm:pt-[106px] min-h-screen-svh">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2 font-['Poppins']">Order Confirmed!</h1>
          <p className="text-gray-600 text-lg">Thank you for your purchase. We&apos;re getting your order ready.</p>
          <div className="mt-4 inline-block bg-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-medium">
            Order ID: {orderId}
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Order Details */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 font-['Poppins']">Order Details</h2>
                <p className="text-gray-600">Items in your order</p>
              </div>
            </div>

            <div className="space-y-4">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-16 h-16 bg-white rounded-lg overflow-hidden flex-shrink-0">
                    <Image
                      src={item.image}
                      alt={item.name}
                      width={64}
                      height={64}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 text-sm line-clamp-2">{item.name}</h3>
                    <p className="text-xs text-gray-500">{item.brand}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm text-gray-600">Qty: {item.quantity}</span>
                      <span className="font-semibold text-gray-900">${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex items-center justify-between text-lg font-semibold">
                <span>Total Paid:</span>
                <span className="text-green-600">${order.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Shipping & Payment Info */}
          <div className="space-y-6">
            {/* Shipping Information */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Truck className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 font-['Poppins']">Shipping Information</h3>
                  <p className="text-gray-600 text-sm">Delivery details</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    <strong>{order.shipping.method}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    Estimated delivery:{" "}
                    <strong>{new Date(order.shipping.estimatedDelivery).toLocaleDateString()}</strong>
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div className="text-sm text-gray-600">
                    <div>
                      <strong>{order.shipping.address.name}</strong>
                    </div>
                    <div>{order.shipping.address.street}</div>
                    <div>
                      {order.shipping.address.city}, {order.shipping.address.state} {order.shipping.address.zipCode}
                    </div>
                    <div>{order.shipping.address.country}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Information */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CreditCard className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 font-['Poppins']">Payment Information</h3>
                  <p className="text-gray-600 text-sm">Payment details</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Payment Method:</span>
                  <span className="text-sm font-medium text-gray-900">{order.payment.method}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Amount Paid:</span>
                  <span className="text-sm font-medium text-gray-900">${order.payment.amount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Status:</span>
                  <span className="text-sm font-medium text-green-600">Paid</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4 font-['Poppins']">What&apos;s Next?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <Mail className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <h3 className="font-semibold text-gray-900 mb-1">Email Confirmation</h3>
              <p className="text-sm text-gray-600">You&apos;ll receive an order confirmation email shortly</p>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <Package className="w-8 h-8 text-orange-600 mx-auto mb-2" />
              <h3 className="font-semibold text-gray-900 mb-1">Processing</h3>
              <p className="text-sm text-gray-600">We&apos;re preparing your order for shipment</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <Truck className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <h3 className="font-semibold text-gray-900 mb-1">Shipping</h3>
              <p className="text-sm text-gray-600">You&apos;ll get tracking info when your order ships</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/my-account"
            className="inline-flex items-center justify-center px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-all duration-200"
          >
            View Order Details
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>

          <Link
            href="/shop"
            className="inline-flex items-center justify-center px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-all duration-200"
          >
            Continue Shopping
          </Link>

          <button className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-all duration-200">
            <Download className="w-4 h-4 mr-2" />
            Download Receipt
          </button>
        </div>

        {/* Support Information */}
        <div className="text-center mt-8 p-6 bg-gray-100 rounded-2xl">
          <h3 className="font-semibold text-gray-900 mb-2">Need Help?</h3>
          <p className="text-gray-600 mb-4">
            If you have any questions about your order, our support team is here to help.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="tel:+61412345678"
              className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <Phone className="w-4 h-4" />
              +61 4XX XXX XXX
            </a>
            <a
              href="mailto:hello@toolsaustralia.com.au"
              className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <Mail className="w-4 h-4" />
              hello@toolsaustralia.com.au
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
