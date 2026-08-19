"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ShoppingBag } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import ShopCheckoutPaymentElement from "@/components/payment/ShopCheckoutPaymentElement";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import { useKlaviyoTracking } from "@/hooks/useKlaviyoTracking";

/**
 * Shop checkout: review the cart, enter a delivery address, pay.
 *
 * Two things this screen deliberately does NOT do:
 *
 *  - It never computes or sends a price. `POST /api/shop/checkout` reads the
 *    cart from the database and prices it server-side; the figures shown here
 *    before submitting are the cart's optimistic estimate, and the ones shown
 *    after are the server's. The server's are authoritative.
 *  - It shows no entry copy. Merchandise entries are a separate, permit-gated
 *    feature (CLAUDE.md rule 11) and nothing here may imply entries are bought.
 */

const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const;

interface ServerTotals {
  subtotal: number;
  discount: number;
  shipping: number;
  gst: number;
  total: number;
}

interface AddressForm {
  firstName: string;
  lastName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  deliveryInstructions: string;
}

const EMPTY_ADDRESS: AddressForm = {
  firstName: "",
  lastName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  deliveryInstructions: "",
};

const money = (n: number) => `$${n.toFixed(2)}`;

export default function CheckoutClient() {
  const router = useRouter();
  const { items, summary, isLoading: isCartLoading } = useCart();

  const { trackInitiateCheckout } = usePixelTracking();
  // The shop-shaped Started Checkout, NOT trackKlaviyoStartedCheckout — that one
  // is the package schema and demands package_id / package_type.
  const { trackInitiateCheckout: trackKlaviyoStartedCheckout } = useKlaviyoTracking();
  const [address, setAddress] = useState<AddressForm>(EMPTY_ADDRESS);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [serverTotals, setServerTotals] = useState<ServerTotals | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<string[]>([]);

  const productItems = items.filter((i) => i.type === "product");
  const set = (k: keyof AddressForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setAddress((prev) => ({ ...prev, [k]: e.target.value }));

  const startCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setItemErrors([]);
    setIsStarting(true);

    try {
      const response = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shippingAddress: {
            firstName: address.firstName,
            lastName: address.lastName,
            phone: address.phone || undefined,
            addressLine1: address.addressLine1,
            addressLine2: address.addressLine2 || undefined,
            city: address.city,
            state: address.state,
            postalCode: address.postalCode,
            deliveryInstructions: address.deliveryInstructions || undefined,
          },
        }),
      });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        // 409 carries per-item problems — show which item, not just "failed".
        if (Array.isArray(data?.details) && data.details.some((d: unknown) => (d as { message?: string })?.message)) {
          setItemErrors(data.details.map((d: { message: string }) => d.message));
        }
        throw new Error(data?.error || "Could not start checkout");
      }

      setClientSecret(data.data.clientSecret);
      setServerTotals(data.data.totals);
      setOrderNumber(data.data.orderNumber);
      setOrderId(data.data.orderId);

      // InitiateCheckout fires HERE, not on form submit, because this is the only
      // point where server-priced totals, orderNumber and orderId all exist at
      // once. Firing on submit would also count carts the server then rejects
      // with a 409 for an unavailable variant.
      try {
        const lines = items.filter((i) => i.type === "product");
        const contentIds = lines
          .map((i) => i.sku ?? i.productId)
          .filter((id): id is string => Boolean(id));
        const unitCount = lines.reduce((n, i) => n + i.quantity, 0);

        // order_id must be snake_case: buildMetaCustomData strips the camelCase
        // orderId out, and fireFunnelEvent only reads metaCustomData.order_id.
        trackInitiateCheckout(
          {
            value: data.data.totals.total,
            currency: "AUD",
            content_type: "product",
            content_ids: contentIds,
            num_items: unitCount,
            order_id: data.data.orderNumber,
          },
          undefined,
          {
            // Just-typed billing identity, which lifts CAPI match quality. Click
            // ids and externalId are server-derived and must not be sent here.
            firstName: address.firstName,
            lastName: address.lastName,
            phone: address.phone || undefined,
            city: address.city,
            state: address.state,
            zipCode: address.postalCode,
            country: "AU",
          }
        );

        // image_url and url per line are what make an abandoned-checkout email
        // renderable; every shop Klaviyo payload before this lacked both.
        trackKlaviyoStartedCheckout({
          value: data.data.totals.total,
          currency: "AUD",
          num_items: unitCount,
          order_id: data.data.orderNumber,
          order_type: "shop",
          checkout_url: `${window.location.origin}/checkout`,
          items: lines.map((i) => ({
            product_id: i.productId,
            sku: i.sku,
            product_name: i.product?.name,
            value: i.price,
            quantity: i.quantity,
            image_url: i.product?.images?.[0],
            url: `${window.location.origin}/shop/${i.productId}`,
          })),
        });
      } catch (trackingError) {
        // Tracking must never cost a customer their checkout.
        console.error("[shop] InitiateCheckout tracking failed", trackingError);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout");
    } finally {
      setIsStarting(false);
    }
  };

  if (isCartLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-red-600 dark:text-red-400" />
      </div>
    );
  }

  if (productItems.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <ShoppingBag className="mx-auto mb-4 h-12 w-12 text-gray-300 dark:text-neutral-600" />
        <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">Your cart is empty</h1>
        <p className="mb-6 text-gray-600 dark:text-neutral-400">
          Add something from the shop to check out.
        </p>
        <Link
          href="/shop"
          className="inline-flex h-11 items-center rounded-lg bg-red-600 px-6 font-semibold text-white hover:bg-red-700"
        >
          Browse the shop
        </Link>
      </div>
    );
  }

  const totals = serverTotals ?? {
    subtotal: summary.subtotal,
    discount: summary.discount ?? 0,
    shipping: summary.shipping,
    gst: summary.tax,
    total: summary.totalAmount,
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <h1 className="mb-8 text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">Checkout</h1>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Left: address then payment */}
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
            <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">Delivery address</h2>

            <form onSubmit={startCheckout} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name" value={address.firstName} onChange={set("firstName")} required disabled={!!clientSecret} />
                <Field label="Last name" value={address.lastName} onChange={set("lastName")} required disabled={!!clientSecret} />
              </div>
              <Field label="Address" value={address.addressLine1} onChange={set("addressLine1")} required disabled={!!clientSecret} />
              <Field label="Apartment, unit, etc. (optional)" value={address.addressLine2} onChange={set("addressLine2")} disabled={!!clientSecret} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Suburb" value={address.city} onChange={set("city")} required disabled={!!clientSecret} />
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-200">State</span>
                  <select
                    value={address.state}
                    onChange={set("state")}
                    required
                    disabled={!!clientSecret}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  >
                    <option value="">Select…</option>
                    {AU_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Postcode"
                  value={address.postalCode}
                  onChange={set("postalCode")}
                  required
                  disabled={!!clientSecret}
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                />
              </div>
              <Field label="Phone (optional)" value={address.phone} onChange={set("phone")} disabled={!!clientSecret} inputMode="tel" />
              <Field label="Delivery instructions (optional)" value={address.deliveryInstructions} onChange={set("deliveryInstructions")} disabled={!!clientSecret} maxLength={280} />

              {itemErrors.length > 0 && (
                <ul role="alert" className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
                  {itemErrors.map((m) => <li key={m}>{m}</li>)}
                </ul>
              )}
              {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-200">
                  {error}
                </div>
              )}

              {!clientSecret && (
                <button
                  type="submit"
                  disabled={isStarting}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 font-semibold text-white hover:bg-gray-800 disabled:bg-gray-300 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white dark:disabled:bg-neutral-800"
                >
                  {isStarting ? <><Loader2 className="h-4 w-4 animate-spin" />Checking your cart…</> : "Continue to payment"}
                </button>
              )}
            </form>
          </section>

          {clientSecret && (
            <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
              <h2 className="mb-1 text-lg font-bold text-gray-900 dark:text-white">Payment</h2>
              {orderNumber && (
                <p className="mb-4 text-xs text-gray-500 dark:text-neutral-400">Order {orderNumber}</p>
              )}
              <ShopCheckoutPaymentElement
                clientSecret={clientSecret}
                orderId={orderId ?? ""}
                totalLabel={money(totals.total)}
                onPaid={() => router.push(`/checkout/success?orderId=${orderId}`)}
              />
            </section>
          )}
        </div>

        {/* Right: order summary. Sticky on desktop because the left column (address +
            payment element) is far taller — without it the total scrolls out of sight
            exactly when the customer is deciding whether to pay. `h-fit` stays: it keeps
            the card at content height rather than stretching down the grid row. */}
        <aside className="h-fit rounded-xl border border-gray-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900 lg:sticky lg:top-24">
          <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">Your order</h2>

          <ul className="mb-4 space-y-3">
            {productItems.map((item) => (
              <li key={`${item.productId}-${item.sku ?? ""}`} className="flex gap-3">
                {item.product?.images?.[0] && (
                  <Image src={item.product.images[0]} alt="" width={48} height={48} className="h-12 w-12 rounded-lg border border-gray-200 object-cover dark:border-neutral-700" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-neutral-100">
                    {item.product?.name ?? "Item"}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-neutral-400">
                    {item.sku && <span className="mr-1">{item.sku}</span>}× {item.quantity}
                  </p>
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-neutral-100">
                  {money(item.price * item.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="space-y-2 border-t border-gray-200 pt-4 text-sm dark:border-neutral-700">
            <Row label="Subtotal" value={money(totals.subtotal)} />
            {totals.discount > 0 && <Row label="Member discount" value={`−${money(totals.discount)}`} accent />}
            <Row label="Delivery" value={totals.shipping === 0 ? "Free" : money(totals.shipping)} />
            <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold text-gray-900 dark:border-neutral-700 dark:text-white">
              <dt>Total</dt>
              <dd>{money(totals.total)}</dd>
            </div>
            {/*
              GST is a COMPONENT of the total, never added to it. Australian
              prices are quoted inclusive, so this line reports rather than adds.
            */}
            <p className="text-right text-xs text-gray-500 dark:text-neutral-400">
              includes {money(totals.gst)} GST
            </p>
          </dl>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-600 dark:text-neutral-400">{label}</dt>
      <dd className={accent ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-gray-900 dark:text-neutral-100"}>
        {value}
      </dd>
    </div>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-200">{label}</span>
      <input
        type="text"
        {...props}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:disabled:bg-neutral-900"
      />
    </label>
  );
}
