"use client";

import { useMemo, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { Minus, Plus } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useUserContext } from "@/contexts/UserContext";
import { resolveShopDiscountPercent } from "@/utils/shop/member-discount";
import { priceCart, centsToDollars, dollarsToCents } from "@/utils/shop/pricing";
import { useSession } from "next-auth/react";
import SignInToBuyModal from "@/components/modals/SignInToBuyModal";
import ShopCheckoutPaymentElement from "@/components/payment/ShopCheckoutPaymentElement";
import SuccessScreen from "@/components/loading/SuccessScreen";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import {
  readCheckoutAddressDraft,
  writeCheckoutAddressDraft,
  clearCheckoutAddressDraft,
} from "@/utils/shop/checkout-address-draft";
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

/**
 * The chosen variant as a person reads it — "Black · 2XL".
 *
 * Colour before size, matching the order-history list and the confirmation email, so
 * one purchase never reads as two different variants on two screens. Empty when the
 * line has no variant (a product without options, or a line added before the labels
 * were snapshotted), and the caller falls back to the sku.
 */
const variantLabel = (item: { colour?: string; size?: string }) =>
  [item.colour, item.size].filter(Boolean).join(" · ");

export default function CheckoutClient() {
  const router = useRouter();
  const {
    items,
    summary,
    isLoading: isCartLoading,
    updateCartItem,
    removeFromCart,
  } = useCart();
  const { userData } = useUserContext();

  // A guest could previously fill in their entire delivery address and only
  // then be told "Unauthorized" in a red box — the 401 body from the checkout
  // route, rendered raw. Ask up front instead, in the same sheet the product
  // page uses, and never send them to /login and back.
  const { status: sessionStatus } = useSession();
  const [showSignIn, setShowSignIn] = useState(false);

  useEffect(() => {
    // `loading` is not `signed out`; acting on it would flash the sheet at
    // every signed-in customer before the session resolves.
    if (sessionStatus === "unauthenticated") setShowSignIn(true);
    if (sessionStatus === "authenticated") setShowSignIn(false);
  }, [sessionStatus]);
  const { trackInitiateCheckout } = usePixelTracking();
  // The shop-shaped Started Checkout, NOT trackKlaviyoStartedCheckout — that one
  // is the package schema and demands package_id / package_type.
  const { trackInitiateCheckout: trackKlaviyoStartedCheckout } = useKlaviyoTracking();
  const [address, setAddress] = useState<AddressForm>(EMPTY_ADDRESS);
  /**
   * Guards the prefill so it runs ONCE and can never overwrite typing.
   *
   * `userData` arrives asynchronously, so a naive effect keyed on it would re-run and
   * stomp whatever the customer had already entered the moment the query refetched.
   */
  const [prefilled, setPrefilled] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [customerSessionClientSecret, setCustomerSessionClientSecret] = useState<string | null>(null);
  /** Set the moment Stripe confirms; drives the success interstitial. */
  const [paid, setPaid] = useState(false);
  const [serverTotals, setServerTotals] = useState<ServerTotals | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<string[]>([]);

  /*
    PREFILL, in priority order:
      1. the sessionStorage DRAFT — what this person was typing before they refreshed;
         it is newer than anything stored, and losing it is the thing that annoys.
      2. `userData.shippingAddress` — where their last PAID order went.
      3. their profile first/last name, so even a first-time buyer types less.

    Runs once (`prefilled`), because userData resolves asynchronously and a re-run
    would overwrite live typing on every refetch.
  */
  useEffect(() => {
    if (prefilled) return;
    // Wait for the session to settle: prefilling from a half-loaded userData would
    // fill some fields and then never fill the rest.
    if (sessionStatus === "loading") return;

    const saved = userData?.shippingAddress;
    const draft = readCheckoutAddressDraft();
    if (!saved && !draft && !userData) return;

    setAddress((current) => ({
      ...current,
      firstName: draft?.firstName ?? saved?.firstName ?? userData?.firstName ?? current.firstName,
      lastName: draft?.lastName ?? saved?.lastName ?? userData?.lastName ?? current.lastName,
      // `mobile` is the account's own number — the last fallback, after a draft and
      // after the number used on the last delivery. Someone who has given us a mobile
      // should not type it again to have a courier call them.
      phone: draft?.phone ?? saved?.phone ?? userData?.mobile ?? current.phone,
      addressLine1: draft?.addressLine1 ?? saved?.addressLine1 ?? current.addressLine1,
      addressLine2: draft?.addressLine2 ?? saved?.addressLine2 ?? current.addressLine2,
      city: draft?.city ?? saved?.city ?? current.city,
      state: draft?.state ?? saved?.state ?? current.state,
      postalCode: draft?.postalCode ?? saved?.postalCode ?? current.postalCode,
      deliveryInstructions:
        draft?.deliveryInstructions ?? saved?.deliveryInstructions ?? current.deliveryInstructions,
    }));
    setPrefilled(true);
  }, [prefilled, sessionStatus, userData]);

  // Keep the draft in step with the form, so a refresh at the card step restores it.
  // Only after the prefill has run — writing before it would persist the empty form
  // over a real draft and defeat the whole point.
  useEffect(() => {
    if (!prefilled) return;
    writeCheckoutAddressDraft(address);
  }, [address, prefilled]);


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
      setCustomerSessionClientSecret(data.data.customerSessionClientSecret ?? null);
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

  /*
    Before the server prices the cart, the member discount is computed HERE.

    CartContext deliberately leaves `summary.discount` at 0 — it has no session
    and cannot know the tier. That was fine when the summary was only a badge,
    but on checkout it meant the customer saw the undiscounted total right up
    until they pressed Continue to payment, at which point it dropped. A total
    that changes after you commit to paying is the wrong moment to be surprised.

    serverTotals still WINS the moment it exists: the server prices from the
    catalogue and is the only figure the PaymentIntent is built from. This is a
    preview that happens to agree, not a second source of truth.
  */
  const previewDiscount = useMemo(() => {
    const percent = resolveShopDiscountPercent(userData ?? {});
    if (percent <= 0) return 0;
    const priced = priceCart(
      productItems.map((i) => ({ priceCents: dollarsToCents(i.price), quantity: i.quantity })),
      { shopDiscountPercent: percent }
    );
    return centsToDollars(priced.discountCents);
  }, [productItems, userData]);

  if (isCartLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-red-600 dark:text-red-400" />
      </div>
    );
  }

  if (productItems.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 pb-20 pt-[calc(var(--app-header-h)+4rem)] text-center sm:pt-[calc(var(--app-header-h-lg)+4rem)]">
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
    discount: previewDiscount,
    shipping: summary.shipping,
    gst: summary.tax,
    total: Math.max(0, summary.totalAmount - previewDiscount),
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-8 pt-[calc(var(--app-header-h)+1.5rem)] sm:pb-12 sm:pt-[calc(var(--app-header-h-lg)+2rem)]">
      <h1 className="mb-8 text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">Checkout</h1>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Left: address then payment */}
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
            <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">Delivery address</h2>

            <form onSubmit={startCheckout} className="space-y-3 sm:space-y-4">
              {/* Paired at EVERY width, not just sm+. Nine full-width rows stacked on a
                  phone turned a short form into a scroll, and a first/last name pair is
                  legible in half a 390px viewport. */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <Field label="First name" value={address.firstName} onChange={set("firstName")} required disabled={!!clientSecret} />
                <Field label="Last name" value={address.lastName} onChange={set("lastName")} required disabled={!!clientSecret} />
              </div>
              <Field label="Address" value={address.addressLine1} onChange={set("addressLine1")} required disabled={!!clientSecret} />
              <Field label="Apartment, unit, etc. (optional)" value={address.addressLine2} onChange={set("addressLine2")} disabled={!!clientSecret} />
              {/* Suburb takes the full row on a phone (names run long), with State and
                  Postcode paired beneath it; all three sit on one row from sm up. */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                <Field wrapperClassName="col-span-2 sm:col-span-1" label="Suburb" value={address.city} onChange={set("city")} required disabled={!!clientSecret} />
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
                customerSessionClientSecret={customerSessionClientSecret}
                orderId={orderId ?? ""}
                /*
                  The address the customer already gave us, handed to Stripe as billing
                  details so PaymentElement can hide its own address block. Country is
                  hard-coded AU: the delivery form only accepts Australian states and a
                  4-digit Australian postcode, so anything else would be a lie.
                */
                billingDetails={{
                  name: `${address.firstName} ${address.lastName}`.trim() || undefined,
                  phone: address.phone || undefined,
                  address: {
                    line1: address.addressLine1,
                    line2: address.addressLine2 || undefined,
                    city: address.city,
                    state: address.state,
                    postal_code: address.postalCode,
                    country: "AU",
                  },
                }}
                totalLabel={money(totals.total)}
                /*
                  Confirm -> success breakdown -> success page.

                  The jump straight to /checkout/success was abrupt: the customer
                  pressed Pay and the page simply changed, with no moment that said
                  the payment landed. SuccessScreen (the same component the
                  membership and pack flows use) holds for three seconds with the
                  order's own figures, then navigates.

                  The ORDER is still finalised by the Stripe webhook — this is
                  acknowledgement of the payment, not of fulfilment, and the
                  success page it lands on is what reads the finished order.
                */
                onPaid={() => {
                  // The durable copy now lives on the user document — finalizeShopOrder
                  // writes it on the paid order — so the session draft has done its job.
                  clearCheckoutAddressDraft();
                  setPaid(true);
                }}
              />
            </section>
          )}
        </div>

        {/* Right: order summary. Sticky on desktop because the left column (address +
            payment element) is far taller — without it the total scrolls out of sight
            exactly when the customer is deciding whether to pay. `h-fit` stays: it keeps
            the card at content height rather than stretching down the grid row. */}
        <aside className="h-fit rounded-xl border border-gray-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900 lg:sticky lg:top-24">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Your order</h2>
            {!clientSecret && (
              <Link
                href="/shop"
                className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
              >
                Add more items
              </Link>
            )}
          </div>

          {/*
            The cart stays editable until the PaymentIntent exists, and is frozen
            after. Changing quantities once Stripe holds an amount would leave the
            customer paying the old total for a different cart — the intent is
            created from server-priced lines at Continue, and nothing re-prices it.
          */}
          {clientSecret && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
              Your order is locked while payment is open. Cancel and return to the shop to
              change it.
            </p>
          )}

          <ul className="mb-4 space-y-3">
            {productItems.map((item) => (
              <li key={`${item.productId}-${item.sku ?? ""}`} className="flex gap-3">
                {/*
                  The image and the name link to the product page.

                  Two jobs: a customer double-checking what they picked should not have to
                  find it again from the shop, and the product page is where the VARIANT
                  picker lives — the colourway swatches with their own photography and the
                  size grid. Reproducing that here would be a second picker to keep in step
                  with the first, for a garment that can carry 383 variants.
                */}
                {item.product?.images?.[0] && (
                  <Link
                    href={`/shop/${item.productId}`}
                    className="shrink-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                  >
                    <Image src={item.product.images[0]} alt="" width={48} height={48} className="h-12 w-12 rounded-lg border border-gray-200 object-cover dark:border-neutral-700" />
                  </Link>
                )}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/shop/${item.productId}`}
                    className="block truncate text-sm font-medium text-gray-900 hover:underline dark:text-neutral-100"
                  >
                    {item.product?.name ?? "Item"}
                  </Link>
                  {/*
                    "Black · 2XL", not "ajrAx-2XL-Bot8043-BAC-2_11". The sku is an internal
                    string and was being shown to the customer for want of anything better;
                    the labels are now snapshotted onto the cart line at add-to-cart. Falls
                    back to the sku for lines added before that existed.
                  */}
                  {(variantLabel(item) || item.sku) && (
                    <p className="truncate text-xs text-gray-500 dark:text-neutral-400">
                      {variantLabel(item) || item.sku}
                      {!clientSecret && (
                        <>
                          {" · "}
                          <Link
                            href={`/shop/${item.productId}`}
                            className="font-medium text-red-600 hover:underline dark:text-red-400"
                          >
                            Change
                          </Link>
                        </>
                      )}
                    </p>
                  )}
                  {clientSecret ? (
                    <p className="text-xs text-gray-500 dark:text-neutral-400">× {item.quantity}</p>
                  ) : (
                    <div className="mt-1 flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        onClick={() =>
                          item.quantity <= 1
                            ? void (item.productId && removeFromCart(item.productId, "product", item.sku))
                            : void updateCartItem({ productId: item.productId, sku: item.sku, quantity: item.quantity - 1 })
                        }
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="min-w-[1.5rem] text-center text-xs font-semibold text-gray-900 dark:text-neutral-100">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() => void updateCartItem({ productId: item.productId, sku: item.sku, quantity: item.quantity + 1 })}
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void (item.productId && removeFromCart(item.productId, "product", item.sku))}
                        className="ml-1 text-xs font-medium text-gray-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  )}
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
      {paid && (
        <SuccessScreen
          title="Payment received"
          subtitle={`Order ${orderNumber ?? ""} — we are getting it ready.`}
          benefits={[
            { text: `${money(totals.total)} paid`, icon: "tag", highlight: true },
            {
              text: `${productItems.reduce((n, i) => n + i.quantity, 0)} item${
                productItems.reduce((n, i) => n + i.quantity, 0) === 1 ? "" : "s"
              }`,
              icon: "gift",
            },
            ...(totals.discount > 0
              ? [{ text: `${money(totals.discount)} member discount applied`, icon: "star" as const }]
              : []),
          ]}
          autoCloseDelay={3000}
          onAutoClose={() => router.push(`/checkout/success?orderId=${orderId}`)}
        />
      )}

      {showSignIn && (
        <SignInToBuyModal
          isOpen={showSignIn}
          onClose={() => setShowSignIn(false)}
          intent="finish your order"
        />
      )}
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
  wrapperClassName,
  ...props
}: {
  label: string;
  /**
   * Class for the LABEL wrapper, not the input. The input's own className is fixed
   * by this component so every field looks identical; a caller only needs to control
   * how the cell sits in its grid (`col-span-2`).
   */
  wrapperClassName?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`block ${wrapperClassName ?? ""}`}>
      <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-200">{label}</span>
      <input
        type="text"
        {...props}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:disabled:bg-neutral-900"
      />
    </label>
  );
}
