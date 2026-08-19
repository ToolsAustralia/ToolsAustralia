"use client";

import { useState } from "react";
import { Star, Check, Truck, Shield, RotateCcw, Award, Clock } from "lucide-react";
import { ProductData } from "@/data";
import { getContactEmail } from "@/lib/email/sender-identities";
import { FREE_SHIPPING_THRESHOLD_LABEL, FLAT_SHIPPING_RATE_LABEL } from "@/config/shop";
import { shouldShowReviews } from "@/utils/shop/reviews";

interface ProductTabsProps {
  product: ProductData;
}

export default function ProductTabs({ product }: ProductTabsProps) {
  const [activeTab, setActiveTab] = useState<"specifications" | "reviews" | "shipping">("specifications");

  // Reviews appear only with at least one real review AND a 4-star average.
  // Below either bar there is no tab at all, rather than an empty shell.
  const reviewList = Array.isArray(product.reviews) ? product.reviews : [];
  const showReviews = shouldShowReviews({
    rating: product.rating,
    reviewCount: reviewList.length,
  });
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
            {/* No reviews tab at all below the gate — an empty shell reading
                "Reviews (0)" beside grey stars is worse than nothing on a
                brand-new print-to-order garment. */}
            {showReviews && (
            <button
              onClick={() => setActiveTab("reviews")}
              className={`flex-1 py-4 px-4 border-b-2 font-medium transition-colors text-center ${
                activeTab === "reviews"
                  ? "border-red-600 text-red-600"
                  : "border-transparent text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200"
              }`}
            >
              Reviews ({reviewList.length})
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
          {activeTab === "reviews" && showReviews && (
            <div className="space-y-8">
              <div className="flex flex-col lg:flex-row gap-8">
                {/* Rating Summary */}
                <div className="lg:w-1/3">
                  <div className="bg-white dark:bg-neutral-950 rounded-xl p-6 shadow-sm border dark:border-neutral-800">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-neutral-100 mb-4">Customer Reviews</h3>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="text-4xl font-bold text-red-600">{product.rating}</div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-5 h-5 ${
                                i < Math.floor(product.rating || 0) ? "text-yellow-400 fill-current" : "text-gray-300 dark:text-neutral-700"
                              }`}
                            />
                          ))}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-neutral-400">Based on {reviewList.length} {reviewList.length === 1 ? "review" : "reviews"}</div>
                      </div>
                    </div>

                  </div>
                </div>

                {/* The real reviews. Rendered only when the gate above passes, so
                    this list is never empty. Three invented testimonials used to sit
                    here — named reviewers, invented bodies, and a "Verified Purchase"
                    badge on each, against a product with zero reviews in the database.
                    Fabricated testimonials and false verified-purchase badges are
                    prohibited conduct under the Australian Consumer Law. */}
                <div className="lg:w-2/3 space-y-4">
                  {reviewList.map((review, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-semibold text-gray-900 dark:text-neutral-100">
                          {review.reviewer || "Customer"}
                        </span>
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="bg-white dark:bg-neutral-950 rounded-xl p-6 shadow-sm border dark:border-neutral-800">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-neutral-100 mb-4 flex items-center gap-2">
                    <Truck className="w-5 h-5 text-red-600" />
                    Shipping Information
                  </h3>
                  <div className="space-y-4">
                    {/*
                      These two lines are the ONLY shipping outcomes checkout can
                      produce: priceCart charges flatShippingRateCents below the
                      threshold and nothing at or above it. The figures are imported
                      rather than typed — this block previously promised free
                      shipping "over $99" while the code charged below $100 (so a
                      $99.50 order was billed $10 at checkout), plus Express at $15
                      and Same Day at $25 in three cities, neither of which exists
                      anywhere in the pricing path.
                    */}
                    <div className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-neutral-100">Free Standard Shipping</div>
                        <div className="text-sm text-gray-600 dark:text-neutral-400">
                          On orders of {FREE_SHIPPING_THRESHOLD_LABEL} or more
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Clock className="w-5 h-5 text-blue-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-neutral-100">Standard Shipping</div>
                        <div className="text-sm text-gray-600 dark:text-neutral-400">
                          {FLAT_SHIPPING_RATE_LABEL} flat rate on orders under {FREE_SHIPPING_THRESHOLD_LABEL}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-neutral-950 rounded-xl p-6 shadow-sm border dark:border-neutral-800">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-neutral-100 mb-4 flex items-center gap-2">
                    <RotateCcw className="w-5 h-5 text-red-600" />
                    Returns & Exchanges
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-neutral-100">Change of mind</div>
                        <div className="text-sm text-gray-600 dark:text-neutral-400">Printed to order in your chosen colour and size, so we cannot resell a returned garment. Change-of-mind returns are not offered.</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-neutral-100">Faulty or wrong item</div>
                        <div className="text-sm text-gray-600 dark:text-neutral-400">If a garment arrives faulty, damaged or not what you ordered, contact us and we will replace it or refund it. Return postage is on us.</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-neutral-100">Your rights</div>
                        <div className="text-sm text-gray-600 dark:text-neutral-400">Nothing here limits the guarantees you have under Australian Consumer Law.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-white dark:bg-neutral-950 rounded-xl p-6 shadow-sm border dark:border-neutral-800">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-neutral-100 mb-4 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-red-600" />
                    Warranty & Support
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Award className="w-5 h-5 text-gold-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-neutral-100">Print quality</div>
                        <div className="text-sm text-gray-600 dark:text-neutral-400">The print is made to last normal wear and washing. If it cracks or peels in ordinary use, tell us and we will sort it out.</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-neutral-100">Talk to a person</div>
                        <div className="text-sm text-gray-600 dark:text-neutral-400">Email us and a human replies — no ticket queue.</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-neutral-100">Care</div>
                        <div className="text-sm text-gray-600 dark:text-neutral-400">Wash inside out, cold, and hang to dry. That is all a printed garment needs.</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-red-600/10 to-red-100 rounded-xl p-6 border border-red-600/20">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-neutral-100 mb-3">Need Help?</h3>
                  <p className="text-sm text-gray-600 dark:text-neutral-400 mb-4">
                    Our customer service team is here to help with any questions about shipping, returns, or product
                    support.
                  </p>
                  <div className="space-y-2">
                    <div className="text-sm">
                      <span className="font-medium text-gray-900 dark:text-neutral-100">Phone:</span>
                      <span className="text-gray-600 dark:text-neutral-400 ml-2">{contactEmail}</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-medium text-gray-900 dark:text-neutral-100">Email:</span>
                      <span className="text-gray-600 dark:text-neutral-400 ml-2">{contactEmail}</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-medium text-gray-900 dark:text-neutral-100">Hours:</span>
                      <span className="text-gray-600 dark:text-neutral-400 ml-2">We reply within one business day</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

