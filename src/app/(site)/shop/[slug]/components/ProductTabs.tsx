"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Star, Check, Truck, Shield, RotateCcw, Award, Clock, Info, Mail } from "lucide-react";
import { ProductData } from "@/data";
import { getContactEmail } from "@/lib/email/sender-identities";
import { FREE_SHIPPING_THRESHOLD_LABEL, FLAT_SHIPPING_RATE_LABEL } from "@/config/shop";
import { shouldShowReviews, displayableReviews, displayAverage } from "@/utils/shop/reviews";
import { useProductReviews } from "@/hooks/queries/useProductQueries";
import ProductReviewForm from "./ProductReviewForm";

/**
 * A titled panel on the Shipping & Returns tab.
 *
 * Declared at module scope, NOT inside ProductTabs: a component defined during
 * render is a new type on every render, so React unmounts and remounts the whole
 * subtree each time — which would throw away focus and any transition state in
 * these cards for no reason.
 */
function InfoCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      {/* items-center, not items-start: the heading is one line at every width
          this card is rendered at, so aligning to the text box centres the icon
          against it. */}
      <h3 className="mb-4 flex items-center gap-2.5 text-lg font-semibold text-gray-900 dark:text-neutral-100">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

/** One labelled point inside an InfoCard. */
function InfoItem({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      {icon}
      <div className="min-w-0">
        <div className="font-medium text-gray-900 dark:text-neutral-100">{title}</div>
        <div className="mt-0.5 text-sm leading-relaxed text-gray-600 dark:text-neutral-400">
          {children}
        </div>
      </div>
    </div>
  );
}

interface ProductTabsProps {
  product: ProductData;
}

export default function ProductTabs({ product }: ProductTabsProps) {
  const [activeTab, setActiveTab] = useState<"specifications" | "reviews" | "shipping">("specifications");

  // The route segment IS the product's `_id` — page.tsx resolves this page with
  // `Product.findOne({ _id: slug })`. Taken from the URL rather than the prop
  // because `ProductData` describes the static fixtures, whose identifier is `id`,
  // while the document this page actually renders carries `_id`.
  const { slug: productId } = useParams<{ slug: string }>();

  // Only four-star-and-above reviews are shown — the business rule, kept in
  // one place in utils/shop/reviews.ts. A lower review is stored exactly as
  // written and simply not rendered.
  const reviewList = displayableReviews(product.reviews);
  const showReviews = shouldShowReviews({ displayableCount: reviewList.length });
  // The headline average describes the reviews BELOW it, not Product.rating.
  // Product.rating averages every review including the hidden ones, so printing
  // it over a list of 5-star reviews would contradict the list itself.
  const shownAverage = displayAverage(reviewList);

  // Entitlement is decided server-side from the viewer's paid orders and is only
  // ever used here to choose what to draw. The tab has to survive the gate above
  // for a verified buyer, or there is nowhere to leave the first review and the
  // list can never become non-empty.
  //
  // Only fetched once a session exists: nobody signed out can be a buyer, and this
  // is a public product page, so firing it for every anonymous view would be a
  // request per pageview that can only ever answer "not_eligible".
  const { status: sessionStatus } = useSession();
  const { data: reviewsData } = useProductReviews(
    sessionStatus === "authenticated" ? productId : undefined
  );
  const reviewEligibility = reviewsData?.reviewEligibility ?? "not_eligible";
  const showReviewsTab = showReviews || reviewEligibility !== "not_eligible";
  const contactEmail = getContactEmail();

  return (
    <div className="mt-16 bg-gray-50 dark:bg-neutral-900 w-full">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="border-b border-gray-200 dark:border-neutral-800">
          <nav className="flex justify-between w-full">
            <button
              onClick={() => setActiveTab("specifications")}
              className={`flex-1 py-4 px-4 border-b-2 font-medium transition-colors text-center ${
                activeTab === "specifications"
                  ? "border-red-600 text-red-600"
                  : "border-transparent text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200"
              }`}
            >
              Specifications
            </button>
            {/* No reviews tab for a passing visitor below the gate — an empty shell
                reading "Reviews (0)" beside grey stars is worse than nothing on a
                brand-new print-to-order garment. A buyer entitled to write one is
                the exception: they get the tab so the form is reachable. */}
            {showReviewsTab && (
            <button
              onClick={() => setActiveTab("reviews")}
              className={`flex-1 py-4 px-4 border-b-2 font-medium transition-colors text-center ${
                activeTab === "reviews"
                  ? "border-red-600 text-red-600"
                  : "border-transparent text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200"
              }`}
            >
              {/* The count rides along only when the list is actually shown —
                  otherwise the label would advertise reviews this tab is not
                  displaying. */}
              Reviews{showReviews ? ` (${reviewList.length})` : ""}
              </button>
            )}
            <button
              onClick={() => setActiveTab("shipping")}
              className={`flex-1 py-4 px-4 border-b-2 font-medium transition-colors text-center ${
                activeTab === "shipping"
                  ? "border-red-600 text-red-600"
                  : "border-transparent text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200"
              }`}
            >
              Shipping & Returns
            </button>
          </nav>
        </div>

        <div className="py-8">
          {/* Specifications Tab */}
          {activeTab === "specifications" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-neutral-100 mb-4">Product Specifications</h3>
                <dl className="space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600 dark:text-neutral-400">Brand</dt>
                    <dd className="text-sm font-medium text-gray-900 dark:text-neutral-100">{product.brand}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600 dark:text-neutral-400">Category</dt>
                    <dd className="text-sm font-medium text-gray-900 dark:text-neutral-100">{product.category}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600 dark:text-neutral-400">Model</dt>
                    <dd className="text-sm font-medium text-gray-900 dark:text-neutral-100">{product.id}</dd>
                  </div>
                  {/*
                    Real specifications only.

                    This list used to hard-code Weight "2.5 kg", Dimensions
                    "30 x 20 x 15 cm", Power Source "Cordless/Battery" and Warranty
                    "3 Years" for EVERY product — so a cotton t-shirt advertised a
                    battery and a three-year warranty. The Product model has carried
                    a real `specifications` map the whole time; the template simply
                    never read it.

                    A product with no specifications now shows none, which is honest.
                    An empty row is better than an invented one.
                  */}
                  {Object.entries(product.specifications ?? {}).map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <dt className="text-sm text-gray-600 dark:text-neutral-400">{label}</dt>
                      <dd className="text-sm font-medium text-gray-900 dark:text-neutral-100">
                        {String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              {/*
                Key features come from the product's own `features[]`. The previous
                six bullets were fixed strings on every product — including
                "Manufacturer warranty included" and "Compatible with standard
                accessories", neither of which is true of apparel, and one of which
                asserts a warranty that does not exist.
              */}
              {(product.features ?? []).length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-neutral-100 mb-4">
                    Key Features
                  </h3>
                  <ul className="space-y-2">
                    {product.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-center gap-2 text-sm text-gray-600 dark:text-neutral-400"
                      >
                        <Check className="w-4 h-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Reviews Tab */}
          {activeTab === "reviews" && showReviewsTab && (
            <div className="space-y-8">
              <div className="flex flex-col lg:flex-row gap-8">
                {/* Rating Summary — an average is only worth printing next to the
                    reviews it was computed from. */}
                {showReviews && (
                <div className="lg:w-1/3">
                  <div className="bg-white dark:bg-neutral-950 rounded-xl p-6 shadow-sm border dark:border-neutral-800">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-neutral-100 mb-4">Customer Reviews</h3>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="text-4xl font-bold text-red-600">{shownAverage}</div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-5 h-5 ${
                                i < Math.floor(shownAverage) ? "text-yellow-400 fill-current" : "text-gray-300 dark:text-neutral-700"
                              }`}
                            />
                          ))}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-neutral-400">Based on {reviewList.length} {reviewList.length === 1 ? "review" : "reviews"}</div>
                      </div>
                    </div>

                  </div>
                </div>
                )}

                {/* The real reviews, plus the only way one can ever get here. The
                    list renders only when the gate above passes, so it is never
                    empty. Three invented testimonials used to sit here — named
                    reviewers, invented bodies, and a "Verified Purchase" badge on
                    each, against a product with zero reviews in the database.
                    Fabricated testimonials and false verified-purchase badges are
                    prohibited conduct under the Australian Consumer Law. Nothing
                    below claims either: the form writes what a buyer actually typed,
                    and no badge is drawn on top of it. */}
                <div className={`space-y-4 ${showReviews ? "lg:w-2/3" : "w-full"}`}>
                  <ProductReviewForm productId={productId} eligibility={reviewEligibility} />
                  {showReviews && reviewList.map((review, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {/* Only when a name genuinely exists. The reviews sub-schema
                            in models/Product.ts is { userId, rating, comment,
                            createdAt } — there is no name on it and nothing writes
                            one, so this used to print "Customer" over every real
                            review. An attributed-looking placeholder on an
                            unattributed review is the same defect as the invented
                            testimonials it replaced. */}
                        {review.reviewer && (
                          <span className="font-semibold text-gray-900 dark:text-neutral-100">
                            {review.reviewer}
                          </span>
                        )}
                        <span className="flex items-center gap-0.5">
                          {[...Array(5)].map((_, star) => (
                            <Star
                              key={star}
                              className={`h-4 w-4 ${
                                star < review.rating
                                  ? "fill-current text-yellow-400"
                                  : "text-gray-300 dark:text-neutral-700"
                              }`}
                            />
                          ))}
                        </span>
                        {(review.createdAt ?? review.date) && (
                          <span className="ml-auto text-sm text-gray-500 dark:text-neutral-400">
                            {new Date(review.createdAt ?? review.date!).toLocaleDateString("en-AU", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </span>
                        )}
                      </div>
                      {review.comment && (
                        <p className="text-gray-700 dark:text-neutral-300">{review.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Shipping Tab */}
          {activeTab === "shipping" && (
            /*
              ONE column of full-width cards — deliberately NOT two columns of cards.

              These tabs render INSIDE the product page's right-hand column (see the
              comment above <ProductTabs/> in page.tsx: they live there so the sticky
              product image has something to travel against). That column is roughly
              half the page, so the previous `lg:grid-cols-2` handed each card about
              330px. Every heading wrapped onto two lines, and because the two columns
              grew independently, a tall Returns column sat beside a short Help one
              with a large dead gap.

              Full width gives the headings room; the horizontal space is spent on the
              ITEMS inside each card instead, which is where it actually reads better.
            */
            <div className="space-y-6">
              <InfoCard icon={<Truck className="h-5 w-5 shrink-0 text-red-600" />} title="Shipping">
                {/*
                  These two lines are the ONLY shipping outcomes checkout can produce:
                  priceCart charges flatShippingRateCents below the threshold and
                  nothing at or above it. The figures are imported rather than typed —
                  this block previously promised free shipping "over $99" while the
                  code charged below $100 (so a $99.50 order was billed $10 at
                  checkout), plus Express at $15 and Same Day at $25 in three cities,
                  none of which exists anywhere in the pricing path.
                */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoItem
                    icon={<Check className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />}
                    title="Free standard shipping"
                  >
                    On orders of {FREE_SHIPPING_THRESHOLD_LABEL} or more.
                  </InfoItem>
                  <InfoItem
                    icon={<Clock className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />}
                    title="Standard shipping"
                  >
                    {FLAT_SHIPPING_RATE_LABEL} flat rate under {FREE_SHIPPING_THRESHOLD_LABEL}.
                  </InfoItem>
                </div>
              </InfoCard>

              <InfoCard
                icon={<RotateCcw className="h-5 w-5 shrink-0 text-red-600" />}
                title="Returns & exchanges"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Info, not a green tick: a tick next to "not offered" reads as
                      approval of the thing the sentence is refusing. */}
                  <InfoItem
                    icon={<Info className="mt-0.5 h-5 w-5 shrink-0 text-gray-400 dark:text-neutral-500" />}
                    title="Change of mind"
                  >
                    Each garment is printed to order in your colour and size, so we cannot
                    resell a return. Change-of-mind returns are not offered.
                  </InfoItem>
                  <InfoItem
                    icon={<Check className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />}
                    title="Faulty or wrong item"
                  >
                    Faulty, damaged, or not what you ordered? Contact us and we will replace
                    or refund it. Return postage is on us.
                  </InfoItem>
                  <InfoItem
                    icon={<Check className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />}
                    title="Your rights"
                  >
                    Nothing here limits the guarantees you have under Australian Consumer Law.
                  </InfoItem>
                </div>
              </InfoCard>

              <InfoCard
                icon={<Shield className="h-5 w-5 shrink-0 text-red-600" />}
                title="Quality & care"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* text-premium-gold, not text-gold-500 — the latter is not a colour
                      this Tailwind config defines, so the icon rendered unstyled. */}
                  <InfoItem
                    icon={<Award className="mt-0.5 h-5 w-5 shrink-0 text-premium-gold" />}
                    title="Print quality"
                  >
                    The print is made to last normal wear and washing. If it cracks or peels
                    in ordinary use, tell us and we will sort it out.
                  </InfoItem>
                  <InfoItem
                    icon={<Check className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />}
                    title="Care"
                  >
                    Wash inside out, cold, and hang to dry. That is all a printed garment
                    needs.
                  </InfoItem>
                </div>
              </InfoCard>

              {/*
                The gradient previously ended at `to-red-100` in BOTH themes — a
                near-white pink — while the body text stayed `dark:text-neutral-400`.
                In dark mode that put light grey on light pink and the card was
                effectively unreadable. Each theme now gets its own ramp.
              */}
              <section className="rounded-xl border border-red-600/20 bg-gradient-to-br from-red-50 to-white p-6 dark:border-red-500/20 dark:from-red-950/40 dark:to-neutral-950">
                <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-neutral-100">
                  Still need a hand?
                </h3>
                <p className="mb-4 text-sm text-gray-600 dark:text-neutral-400">
                  Email us and a human replies — usually within one business day.
                </p>
                {/*
                  The "Phone:" row was removed rather than filled in. It rendered
                  {contactEmail} beside a Phone label, because there is no phone number
                  anywhere in the codebase to put there — and inventing one would
                  promise a channel nobody answers.
                */}
                <a
                  href={`mailto:${contactEmail}`}
                  className="inline-flex items-center gap-2 text-sm font-medium text-red-700 underline-offset-4 hover:underline dark:text-red-400"
                >
                  <Mail className="h-4 w-4 shrink-0" />
                  {contactEmail}
                </a>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

