"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/contexts/CartContext";
import { useSession } from "next-auth/react";
import { ShopCheckoutPaymentElement } from "@/components/payment/ShopCheckoutPaymentElement";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import { useKlaviyoTracking } from "@/hooks/useKlaviyoTracking";
import Dropdown from "@/components/modals/ui/Dropdown";
import {
  ChevronLeft,
  ChevronDown,
  Mail,
  MapPin,
  CreditCard,
  Truck,
  ShieldCheck,
  Lock,
} from "lucide-react";

const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const;
type AuState = (typeof AU_STATES)[number];

const AU_STATE_OPTIONS = AU_STATES.map((s) => ({ value: s, label: s }));

const PLACEHOLDER_IMG = "/images/SampleProducts/dewalt1.jpg";

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-[13px] text-gray-900 placeholder:text-gray-400 transition-colors focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 sm:px-3.5 sm:py-2.5 sm:text-sm";

const labelCls =
  "mb-1 block text-xs font-medium text-gray-600 dark:text-neutral-400 sm:mb-1.5 sm:text-sm sm:text-gray-700 sm:dark:text-neutral-300";

interface SectionCardProps {
  step: number;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  disabled?: boolean;
}

function SectionCard({ step, title, icon, children, disabled }: SectionCardProps) {
  return (
    <section
      className={`scroll-mt-[120px] rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-opacity dark:border-neutral-800 dark:bg-neutral-950 sm:p-6 ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <div className="mb-3 flex items-center gap-2.5 sm:mb-4 sm:gap-3">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-red-50 text-xs font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-400 sm:h-8 sm:w-8 sm:text-sm">
          {step}
        </span>
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-neutral-100 sm:text-lg">
          <span className="hidden text-gray-500 dark:text-neutral-400 sm:inline-flex">
            {icon}
          </span>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

interface OrderSummaryContentProps {
  productItems: ReturnType<typeof useCart>["items"];
  summary: ReturnType<typeof useCart>["summary"];
  scrollItems?: boolean;
}

function OrderSummaryContent({ productItems, summary, scrollItems }: OrderSummaryContentProps) {
  return (
    <>
      <ul
        className={`space-y-3 ${
          scrollItems ? "no-scrollbar max-h-[360px] overflow-y-auto pr-1" : ""
        }`}
      >
        {productItems.map((i) => {
          const img = i.product?.images?.[0] ?? PLACEHOLDER_IMG;
          return (
            <li key={i.productId} className="flex gap-3">
              <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-neutral-800 dark:bg-neutral-900 sm:h-16 sm:w-16">
                <Image
                  src={img}
                  alt={i.product?.name ?? "Product"}
                  fill
                  className="object-contain p-1"
                  sizes="64px"
                />
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-900 px-1 text-[11px] font-semibold text-white">
                  {i.quantity}
                </span>
              </div>
              <div className="flex flex-1 items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-[13px] font-medium text-gray-900 dark:text-neutral-100 sm:text-sm">
                    {i.product?.name ?? "Item"}
                  </p>
                  {i.product?.brand && (
                    <p className="mt-0.5 text-[11px] text-gray-500 dark:text-neutral-500 sm:text-xs">
                      {i.product.brand}
                    </p>
                  )}
                </div>
                <p className="whitespace-nowrap text-[13px] font-semibold text-gray-900 dark:text-neutral-100 sm:text-sm">
                  ${(i.price * i.quantity).toFixed(2)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 space-y-1.5 border-t border-gray-200 pt-3 text-[13px] dark:border-neutral-800 sm:mt-5 sm:space-y-2 sm:pt-4 sm:text-sm">
        <div className="flex justify-between text-gray-600 dark:text-neutral-400">
          <span>Subtotal</span>
          <span>${summary.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between text-gray-600 dark:text-neutral-400">
          <span className="flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" />
            Shipping
          </span>
          <span>
            {summary.shipping === 0 ? (
              <span className="font-medium text-green-600 dark:text-green-400">Free</span>
            ) : (
              `$${summary.shipping.toFixed(2)}`
            )}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between border-t border-gray-200 pt-3 dark:border-neutral-800 sm:mt-4 sm:pt-4">
        <span className="text-sm font-semibold text-gray-900 dark:text-neutral-100 sm:text-base">
          Total
        </span>
        <span className="text-lg font-bold text-gray-900 dark:text-neutral-100 sm:text-xl">
          ${summary.totalAmount.toFixed(2)}{" "}
          <span className="text-[11px] font-medium text-gray-500 dark:text-neutral-500 sm:text-xs">
            AUD
          </span>
        </span>
      </div>
      <p className="mt-1 text-right text-[11px] text-gray-500 dark:text-neutral-500 sm:text-xs">
        Includes ${summary.gstIncluded.toFixed(2)} GST
      </p>
    </>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, summary } = useCart();
  const { data: session } = useSession();
  const { trackInitiateCheckout, trackAddPaymentInfo } = usePixelTracking();
  const { trackInitiateCheckout: trackKlaviyoStartedCheckout } = useKlaviyoTracking();

  const productItems = items.filter((i) => i.type === "product");

  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);

  const [form, setForm] = useState({
    firstName: session?.user?.firstName ?? "",
    lastName: session?.user?.lastName ?? "",
    email: session?.user?.email ?? "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "" as AuState | "",
    postalCode: "",
    deliveryInstructions: "",
  });

  const formValid = useMemo(() => {
    const required = [
      form.firstName,
      form.lastName,
      form.email,
      form.phone,
      form.addressLine1,
      form.city,
      form.state,
      form.postalCode,
    ];
    return (
      required.every((v) => v.trim().length > 0) && /^[0-9]{4}$/.test(form.postalCode)
    );
  }, [form]);

  // Empty-cart redirect
  useEffect(() => {
    if (productItems.length === 0) {
      router.replace("/shop");
    }
  }, [productItems.length, router]);

  // InitiateCheckout / Started Checkout — fire once on first non-empty render
  const [hasFiredInitiate, setHasFiredInitiate] = useState(false);
  useEffect(() => {
    if (!hasFiredInitiate && productItems.length > 0) {
      const value = productItems.reduce((s, i) => s + i.price * i.quantity, 0);
      trackInitiateCheckout({
        value,
        currency: "AUD",
        contentIds: productItems.map((i) => i.productId!),
        numItems: productItems.reduce((s, i) => s + i.quantity, 0),
      });
      trackKlaviyoStartedCheckout({
        value,
        currency: "AUD",
        numItems: productItems.reduce((s, i) => s + i.quantity, 0),
        items: productItems.map((i) => ({
          productId: i.productId!,
          productName: i.product?.name ?? "",
          quantity: i.quantity,
          price: i.price,
        })),
      });
      setHasFiredInitiate(true);
    }
  }, [hasFiredInitiate, productItems, trackInitiateCheckout, trackKlaviyoStartedCheckout]);

  if (productItems.length === 0) return null;

  const itemCount = productItems.reduce((s, i) => s + i.quantity, 0);

  const itemsForPayment = productItems.map((i) => ({
    productId: i.productId!,
    quantity: i.quantity,
  }));

  const shippingAddress = {
    firstName: form.firstName,
    lastName: form.lastName,
    email: form.email,
    phone: form.phone,
    addressLine1: form.addressLine1,
    addressLine2: form.addressLine2 || undefined,
    city: form.city,
    state: form.state || "VIC",
    postalCode: form.postalCode,
    country: "Australia",
    deliveryInstructions: form.deliveryInstructions || undefined,
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-32 pt-[86px] dark:bg-neutral-950 sm:pb-40 sm:pt-[106px]">
      <div className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-8 lg:px-8">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <Link
            href="/shop"
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 sm:text-sm"
          >
            <ChevronLeft className="h-4 w-4" />
            Continue shopping
          </Link>
          <h1 className="mt-2 text-xl font-bold text-gray-900 dark:text-neutral-100 sm:text-3xl">
            Checkout
          </h1>
          <p className="mt-0.5 hidden text-sm text-gray-500 dark:text-neutral-400 sm:mt-1 sm:block">
            Complete your purchase. All payments are processed securely.
          </p>
        </div>

        {/* Mobile-only collapsible order summary (shown above form) */}
        <div className="lg:hidden">
          <button
            type="button"
            onClick={() => setMobileSummaryOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
            aria-expanded={mobileSummaryOpen}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-neutral-100">
              <ChevronDown
                className={`h-4 w-4 text-gray-500 transition-transform duration-200 dark:text-neutral-400 ${
                  mobileSummaryOpen ? "rotate-180" : ""
                }`}
              />
              {mobileSummaryOpen ? "Hide" : "Show"} order summary
              <span className="text-xs font-normal text-gray-500 dark:text-neutral-500">
                ({itemCount} {itemCount === 1 ? "item" : "items"})
              </span>
            </span>
            <span className="text-base font-bold text-gray-900 dark:text-neutral-100">
              ${summary.totalAmount.toFixed(2)}
            </span>
          </button>
          {mobileSummaryOpen && (
            <div className="mt-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
              <OrderSummaryContent productItems={productItems} summary={summary} />
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:gap-6 lg:mt-0 lg:grid-cols-[1fr_380px] lg:items-start">
          {/* Left column: form sections */}
          <div className="space-y-4 sm:space-y-5">
            <SectionCard
              step={1}
              title="Contact"
              icon={<Mail className="h-4 w-4" />}
            >
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                <div>
                  <label className={labelCls} htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={inputCls}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="phone">
                    Phone
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="0400 000 000"
                    className={inputCls}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              step={2}
              title="Shipping address"
              icon={<MapPin className="h-4 w-4" />}
            >
              <div className="space-y-3 sm:space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                  <div>
                    <label className={labelCls} htmlFor="firstName">
                      First name
                    </label>
                    <input
                      id="firstName"
                      autoComplete="given-name"
                      className={inputCls}
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="lastName">
                      Last name
                    </label>
                    <input
                      id="lastName"
                      autoComplete="family-name"
                      className={inputCls}
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls} htmlFor="addressLine1">
                    Address
                  </label>
                  <input
                    id="addressLine1"
                    autoComplete="address-line1"
                    placeholder="Street address"
                    className={inputCls}
                    value={form.addressLine1}
                    onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
                  />
                </div>

                <div>
                  <label className={labelCls} htmlFor="addressLine2">
                    Apartment / suite{" "}
                    <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    id="addressLine2"
                    autoComplete="address-line2"
                    placeholder="Unit, level, building"
                    className={inputCls}
                    value={form.addressLine2}
                    onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <label className={labelCls} htmlFor="city">
                      Suburb
                    </label>
                    <input
                      id="city"
                      autoComplete="address-level2"
                      className={inputCls}
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>State</label>
                    <Dropdown
                      options={AU_STATE_OPTIONS}
                      value={form.state}
                      onChange={(v) => setForm({ ...form, state: v as AuState | "" })}
                      placeholder="Select…"
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="postalCode">
                      Postcode
                    </label>
                    <input
                      id="postalCode"
                      inputMode="numeric"
                      maxLength={4}
                      autoComplete="postal-code"
                      placeholder="3000"
                      className={inputCls}
                      value={form.postalCode}
                      onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls} htmlFor="deliveryInstructions">
                    Delivery instructions{" "}
                    <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    id="deliveryInstructions"
                    placeholder="Leave at front door, etc."
                    className={inputCls}
                    value={form.deliveryInstructions}
                    onChange={(e) =>
                      setForm({ ...form, deliveryInstructions: e.target.value })
                    }
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              step={3}
              title="Payment"
              icon={<CreditCard className="h-4 w-4" />}
              disabled={!formValid}
            >
              {formValid ? (
                <ShopCheckoutPaymentElement
                  items={itemsForPayment}
                  shippingAddress={shippingAddress}
                  totalAmount={summary.totalAmount}
                  onPaymentInfoEntered={() =>
                    trackAddPaymentInfo({
                      value: summary.totalAmount,
                      currency: "AUD",
                    })
                  }
                />
              ) : (
                <div className="flex items-start gap-2.5 rounded-lg bg-gray-50 p-3 text-[13px] text-gray-600 dark:bg-neutral-900 dark:text-neutral-400 sm:text-sm">
                  <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400 dark:text-neutral-500" />
                  <p>Fill in your contact and shipping details to continue.</p>
                </div>
              )}
            </SectionCard>

            {/* Mobile-only trust strip below form */}
            <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-neutral-500 lg:hidden">
              <ShieldCheck className="h-4 w-4 text-green-600" />
              <span>Encrypted &amp; processed by Stripe</span>
            </div>
          </div>

          {/* Right column: order summary + trust (desktop only) */}
          <aside className="hidden lg:sticky lg:top-[120px] lg:block lg:self-start">
            <div className="space-y-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 sm:p-6">
                <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-neutral-100">
                  Order summary
                </h2>
                <OrderSummaryContent productItems={productItems} summary={summary} scrollItems />
              </div>

              {/* Trust signals */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-neutral-300">
                  <ShieldCheck className="h-4 w-4 text-green-600" />
                  Secure checkout
                </div>
                <p className="mb-3 text-xs text-gray-500 dark:text-neutral-400">
                  Your payment is encrypted and processed by Stripe. We never see or
                  store your card details.
                </p>
                <div className="rounded-lg bg-white p-2">
                  <Image
                    src="/images/safe-checkout-stripe.webp"
                    alt="Guaranteed safe & secure checkout powered by Stripe"
                    width={600}
                    height={160}
                    className="h-auto w-full"
                  />
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
