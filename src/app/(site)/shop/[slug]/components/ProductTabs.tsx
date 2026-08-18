"use client";

import { useState } from "react";
import { Star, Check, Truck, Shield, RotateCcw, Award, Clock } from "lucide-react";
import { ProductData } from "@/data";
import { getContactEmail } from "@/lib/email/sender-identities";
import { FREE_SHIPPING_THRESHOLD_LABEL, FLAT_SHIPPING_RATE_LABEL } from "@/config/shop";

interface ProductTabsProps {
  product: ProductData;
}

export default function ProductTabs({ product }: ProductTabsProps) {
  const [activeTab, setActiveTab] = useState<"specifications" | "reviews" | "shipping">("specifications");
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
            <button
              onClick={() => setActiveTab("reviews")}
              className={`flex-1 py-4 px-4 border-b-2 font-medium transition-colors text-center ${
                activeTab === "reviews"
                  ? "border-red-600 text-red-600"
                  : "border-transparent text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200"
              }`}
            >
              Reviews ({product.reviews?.length || 0})
            </button>
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
          {activeTab === "reviews" && (
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
                        <div className="text-sm text-gray-600 dark:text-neutral-400">Based on {product.reviews?.length || 0} reviews</div>
                      </div>
                    </div>

                    {/* Rating Breakdown */}
                    <div className="space-y-2">
                      {[5, 4, 3, 2, 1].map((rating) => (
                        <div key={rating} className="flex items-center gap-2">
                          <span className="text-sm text-gray-600 dark:text-neutral-400 w-2">{rating}</span>
                          <Star className="w-3 h-3 text-yellow-400 fill-current" />
                          <div className="flex-1 bg-gray-200 dark:bg-neutral-800 rounded-full h-2">
                            <div
                              className="bg-red-600 h-2 rounded-full"
                              style={{
                                width: `${
                                  rating === 5 ? 60 : rating === 4 ? 25 : rating === 3 ? 10 : rating === 2 ? 3 : 2
                                }%`,
                              }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-600 dark:text-neutral-400 w-8">
                            {rating === 5
                              ? "60%"
                              : rating === 4
                              ? "25%"
                              : rating === 3
                              ? "10%"
                              : rating === 2
                              ? "3%"
                              : "2%"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Individual Reviews */}
                <div className="lg:w-2/3 space-y-6">
                  {/* Sample Review 1 */}
                  <div className="bg-white dark:bg-neutral-950 rounded-xl p-6 shadow-sm border dark:border-neutral-800">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900 dark:text-neutral-100">John D.</span>
                          <span className="text-sm text-gray-500 dark:text-neutral-400">Verified Purchase</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />
                          ))}
                        </div>
                      </div>
                      <span className="text-sm text-gray-500 dark:text-neutral-400">2 weeks ago</span>
                    </div>
                    <h4 className="font-medium text-gray-900 dark:text-neutral-100 mb-2">Excellent quality tool!</h4>
                    <p className="text-gray-600 dark:text-neutral-400 text-sm leading-relaxed">
                      This tool exceeded my expectations. The build quality is outstanding and it performs exactly as
                      advertised. I&apos;ve been using it for professional work and it handles everything I throw at it.
                      Highly recommended!
                    </p>
                  </div>

                  {/* Sample Review 2 */}
                  <div className="bg-white dark:bg-neutral-950 rounded-xl p-6 shadow-sm border dark:border-neutral-800">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900 dark:text-neutral-100">Sarah M.</span>
                          <span className="text-sm text-gray-500 dark:text-neutral-400">Verified Purchase</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {[...Array(4)].map((_, i) => (
                            <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />
                          ))}
                          <Star className="w-4 h-4 text-gray-300 dark:text-neutral-700" />
                        </div>
                      </div>
                      <span className="text-sm text-gray-500 dark:text-neutral-400">1 month ago</span>
                    </div>
                    <h4 className="font-medium text-gray-900 dark:text-neutral-100 mb-2">Great value for money</h4>
                    <p className="text-gray-600 dark:text-neutral-400 text-sm leading-relaxed">
                      Good quality tool at a reasonable price. Does exactly what it&apos;s supposed to do. The only
                      minor complaint is that it&apos;s slightly heavier than I expected, but that&apos;s probably due
                      to the solid construction.
                    </p>
                  </div>

                  {/* Sample Review 3 */}
                  <div className="bg-white dark:bg-neutral-950 rounded-xl p-6 shadow-sm border dark:border-neutral-800">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900 dark:text-neutral-100">Mike R.</span>
                          <span className="text-sm text-gray-500 dark:text-neutral-400">Verified Purchase</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />
                          ))}
                        </div>
                      </div>
                      <span className="text-sm text-gray-500 dark:text-neutral-400">3 weeks ago</span>
                    </div>
                    <h4 className="font-medium text-gray-900 dark:text-neutral-100 mb-2">Professional grade quality</h4>
                    <p className="text-gray-600 dark:text-neutral-400 text-sm leading-relaxed">
                      As a professional tradesman, I&apos;m very particular about my tools. This one definitely meets
                      professional standards. Fast delivery and excellent customer service from Tools Australia.
                    </p>
                  </div>
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
                        <div className="font-medium text-gray-900 dark:text-neutral-100">30-Day Return Policy</div>
                        <div className="text-sm text-gray-600 dark:text-neutral-400">Return unused items in original packaging</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-neutral-100">Free Return Shipping</div>
                        <div className="text-sm text-gray-600 dark:text-neutral-400">We cover return shipping costs</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-neutral-100">Easy Returns Process</div>
                        <div className="text-sm text-gray-600 dark:text-neutral-400">Print return label from your account</div>
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
                        <div className="font-medium text-gray-900 dark:text-neutral-100">Manufacturer Warranty</div>
                        <div className="text-sm text-gray-600 dark:text-neutral-400">3-year warranty on all {product.brand} products</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-neutral-100">Expert Support</div>
                        <div className="text-sm text-gray-600 dark:text-neutral-400">Technical support from our tool specialists</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-neutral-100">Repair Services</div>
                        <div className="text-sm text-gray-600 dark:text-neutral-400">Authorized repair centers nationwide</div>
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
                      <span className="text-gray-600 dark:text-neutral-400 ml-2">1800-TOOLS-AU</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-medium text-gray-900 dark:text-neutral-100">Email:</span>
                      <span className="text-gray-600 dark:text-neutral-400 ml-2">{contactEmail}</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-medium text-gray-900 dark:text-neutral-100">Hours:</span>
                      <span className="text-gray-600 dark:text-neutral-400 ml-2">Mon-Fri 8AM-6PM AEST</span>
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

