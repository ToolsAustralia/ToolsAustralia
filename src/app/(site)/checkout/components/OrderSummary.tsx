"use client";

import Image from "next/image";
import { Package, Truck, CreditCard } from "lucide-react";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  brand: string;
  model: string;
}

interface OrderSummaryProps {
  items: CartItem[];
  subtotal: number;
  originalSubtotal?: number;
  vipDiscount?: number;
  shippingCost: number;
  tax: number;
  total: number;
  userMembership?: string;
}

export default function OrderSummary({
  items,
  subtotal,
  originalSubtotal,
  vipDiscount,
  shippingCost,
  tax,
  total,
  userMembership,
}: OrderSummaryProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Package className="w-6 h-6 text-blue-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-bold text-gray-900 font-['Poppins']">Order Summary</h2>
            {userMembership && (
              <span className="bg-gradient-to-r from-yellow-600 via-amber-700 to-orange-900 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
                {userMembership}
              </span>
            )}
          </div>
          <p className="text-gray-600">{items.length} item(s)</p>
        </div>
      </div>

      {/* Cart Items */}
      <div className="space-y-4 mb-6">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
              <Image src={item.image} alt={item.name} width={64} height={64} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-gray-900 text-sm line-clamp-2">{item.name}</h3>
              <p className="text-xs text-gray-500">
                {item.brand} • {item.model}
              </p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm text-gray-600">Qty: {item.quantity}</span>
                <span className="font-semibold text-gray-900">${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Price Breakdown */}
      <div className="space-y-3 border-t border-gray-200 pt-6">
        {originalSubtotal && vipDiscount && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium text-gray-500 line-through">${originalSubtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-green-600 font-medium">VIP Pro Discount (20%)</span>
              </div>
              <span className="font-medium text-green-600">-${vipDiscount.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Discounted Subtotal</span>
              <span className="font-medium text-gray-900">${subtotal.toFixed(2)}</span>
            </div>
          </>
        )}
        {!originalSubtotal && (
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span className="font-medium text-gray-900">${subtotal.toFixed(2)}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600">Shipping</span>
          </div>
          <span className="font-medium text-gray-900">
            {shippingCost === 0 ? "FREE" : `$${shippingCost.toFixed(2)}`}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-gray-600">GST (10%)</span>
          <span className="font-medium text-gray-900">${tax.toFixed(2)}</span>
        </div>

        <div className="border-t border-gray-200 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-gray-900">Total</span>
            <span className="text-xl font-bold text-gray-900">${total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Trust Indicators */}
      <div className="mt-6 space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <CreditCard className="w-4 h-4 text-green-600" />
          <span>Secure payment processing</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Package className="w-4 h-4 text-blue-600" />
          <span>Free returns within 30 days</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Truck className="w-4 h-4 text-orange-600" />
          <span>Fast and reliable shipping</span>
        </div>
      </div>

      {/* Discount Code */}
      <div className="mt-6">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Discount code"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 hover:border-red-400"
          />
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
