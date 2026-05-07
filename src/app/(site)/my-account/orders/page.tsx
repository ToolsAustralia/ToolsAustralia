"use client";
import Link from "next/link";
import { useOrdersQuery } from "@/hooks/queries/useOrdersQueries";

export default function OrdersPage() {
  const { data: orders, isLoading } = useOrdersQuery();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">My Orders</h1>
      {isLoading && <p>Loading…</p>}
      {!isLoading && (orders?.length ?? 0) === 0 && (
        <p>
          No orders yet — visit the{" "}
          <Link href="/shop" className="underline">
            shop
          </Link>
          .
        </p>
      )}
      {(orders?.length ?? 0) > 0 && (
        <ul className="space-y-4">
          {orders!.map((o) => (
            <li
              key={o._id}
              className="border rounded-lg p-4 flex justify-between items-center"
            >
              <div>
                <p className="font-semibold">#{o.orderNumber}</p>
                <p className="text-sm text-gray-500">
                  {new Date(o.createdAt).toLocaleDateString("en-AU")} · {o.products.length} item
                  {o.products.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">${o.totalAmount.toFixed(2)} AUD</p>
                <p className="text-xs uppercase tracking-wide text-gray-500">{o.status}</p>
              </div>
              <Link
                href={`/my-account/orders/${o.orderNumber}`}
                className="ml-4 underline"
              >
                View
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
