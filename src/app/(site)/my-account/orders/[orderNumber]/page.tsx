"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useOrderQuery } from "@/hooks/queries/useOrdersQueries";

const STATUSES = ["pending", "processing", "shipped", "delivered"] as const;

export default function OrderDetailPage() {
  const params = useParams<{ orderNumber: string }>();
  const { data: order, isLoading, error } = useOrderQuery(params.orderNumber);

  if (isLoading) return <p className="p-8">Loading…</p>;
  if (error || !order) return <p className="p-8">Order not found.</p>;

  const currentStep = Math.max(
    0,
    STATUSES.indexOf(order.status as (typeof STATUSES)[number]),
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <Link href="/my-account/orders" className="text-sm underline">
          ← Back to orders
        </Link>
        <h1 className="text-2xl font-bold mt-2">Order #{order.orderNumber}</h1>
        <p className="text-sm text-gray-500">
          {new Date(order.createdAt).toLocaleString("en-AU")}
        </p>
      </div>

      {/* Status timeline */}
      <div className="flex justify-between" data-testid="order-status-timeline">
        {STATUSES.map((s, i) => (
          <div
            key={s}
            className={`flex-1 text-center text-xs uppercase ${
              i <= currentStep ? "font-semibold" : "text-gray-400"
            }`}
          >
            {s}
          </div>
        ))}
      </div>

      {/* Items */}
      <section>
        <h2 className="font-semibold mb-3">Items</h2>
        <ul className="space-y-2">
          {order.products.map((p, idx) => (
            <li key={idx} className="flex justify-between text-sm">
              <span>
                {p.quantity} × {String(p.product)}
              </span>
              <span>${(p.price * p.quantity).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Address */}
      <section>
        <h2 className="font-semibold mb-3">Shipping to</h2>
        <p className="text-sm leading-6">
          {order.shippingAddress.firstName} {order.shippingAddress.lastName}
          <br />
          {order.shippingAddress.addressLine1 ?? order.shippingAddress.address}
          <br />
          {order.shippingAddress.addressLine2 && (
            <>
              {order.shippingAddress.addressLine2}
              <br />
            </>
          )}
          {order.shippingAddress.city} {order.shippingAddress.state} {order.shippingAddress.postalCode}
          <br />
          {order.shippingAddress.country}
          <br />
          {order.shippingAddress.phone}
        </p>
      </section>

      {/* Tracking */}
      {order.trackingNumber && (
        <section>
          <h2 className="font-semibold mb-1">Tracking</h2>
          <a
            href={`https://auspost.com.au/mypost/track/details/${order.trackingNumber}`}
            target="_blank"
            rel="noreferrer"
            className="underline text-sm"
            data-testid="order-tracking-link"
          >
            {order.trackingNumber} (track on AusPost)
          </a>
        </section>
      )}

      {/* Help */}
      <p className="text-sm text-gray-500">
        Need help?{" "}
        <Link href="/my-account/support" className="underline">
          Contact support
        </Link>
        .
      </p>
    </div>
  );
}
