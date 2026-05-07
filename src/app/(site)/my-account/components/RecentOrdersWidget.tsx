"use client";
import Link from "next/link";
import { useOrdersQuery } from "@/hooks/queries/useOrdersQueries";

export default function RecentOrdersWidget() {
  const { data: orders } = useOrdersQuery();
  const recent = (orders ?? []).slice(0, 3);
  if (recent.length === 0) return null;

  return (
    <section className="border rounded-lg p-5">
      <div className="flex justify-between items-baseline mb-3">
        <h2 className="font-semibold">Recent orders</h2>
        <Link href="/my-account/orders" className="text-sm underline">
          View all
        </Link>
      </div>
      <ul className="space-y-2">
        {recent.map((o) => (
          <li
            key={o._id}
            className="flex justify-between text-sm gap-3 flex-wrap"
          >
            <Link
              href={`/my-account/orders/${o.orderNumber}`}
              className="underline"
            >
              #{o.orderNumber}
            </Link>
            <span className="text-gray-500">
              {new Date(o.createdAt).toLocaleDateString("en-AU")}
            </span>
            <span>${o.totalAmount.toFixed(2)}</span>
            <span className="uppercase text-xs">{o.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
