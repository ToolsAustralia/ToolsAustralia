"use client";

import { useState } from "react";
import { Star, Check, Truck, Shield, RotateCcw, Package, Award, Clock } from "lucide-react";
import { ProductData } from "@/data";

interface ProductTabsProps {
  product: ProductData;
}

export default function ProductTabs({ product }: ProductTabsProps) {
  const [activeTab, setActiveTab] = useState<"specifications" | "reviews" | "shipping">("specifications");

  return (
    <div className="mt-16 bg-gray-50 w-full">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="border-b border-gray-200">
          <nav className="flex justify-between w-full">
            <button
              onClick={() => setActiveTab("specifications")}
              className={`flex-1 py-4 px-4 border-b-2 font-medium transition-colors text-center ${
                activeTab === "specifications"
                  ? "border-[#ee0000] text-[#ee0000]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Specifications
            </button>
            <button
              onClick={() => setActiveTab("reviews")}
              className={`flex-1 py-4 px-4 border-b-2 font-medium transition-colors text-center ${
                activeTab === "reviews"
                  ? "border-[#ee0000] text-[#ee0000]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Reviews ({product.reviews?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab("shipping")}
              className={`flex-1 py-4 px-4 border-b-2 font-medium transition-colors text-center ${
                activeTab === "shipping"
                  ? "border-[#ee0000] text-[#ee0000]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
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
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Product Specifications</h3>
                <dl className="space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Brand</dt>
                    <dd className="text-sm font-medium text-gray-900">{product.brand}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Category</dt>
                    <dd className="text-sm font-medium text-gray-900">{product.category}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Model</dt>
                    <dd className="text-sm font-medium text-gray-900">{product.id}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Weight</dt>
                    <dd className="text-sm font-medium text-gray-900">2.5 kg</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Dimensions</dt>
                    <dd className="text-sm font-medium text-gray-900">30 x 20 x 15 cm</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Power Source</dt>
                    <dd className="text-sm font-medium text-gray-900">Cordless/Battery</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Warranty</dt>
                    <dd className="text-sm font-medium text-gray-900">3 Years</dd>
                  </div>
                </dl>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Features</h3>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-green-500" />
                    Professional grade quality
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-green-500" />
                    Durable construction
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-green-500" />
                    Easy to use design
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-green-500" />
                    Long-lasting performance
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-green-500" />
                    Manufacturer warranty included
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-green-500" />
                    Compatible with standard accessories
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Reviews Tab */}
          {activeTab === "reviews" && (
            <div className="space-y-8">
              <div className="flex flex-col lg:flex-row gap-8">
                {/* Rating Summary */}
                <div className="lg:w-1/3">
                  <div className="bg-white rounded-xl p-6 shadow-sm border">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Reviews</h3>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="text-4xl font-bold text-[#ee0000]">{product.rating}</div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-5 h-5 ${
                                i < Math.floor(product.rating || 0) ? "text-yellow-400 fill-current" : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                        <div className="text-sm text-gray-600">Based on {product.reviews?.length || 0} reviews</div>
                      </div>
                    </div>

                    {/* Rating Breakdown */}
                    <div className="space-y-2">
                      {[5, 4, 3, 2, 1].map((rating) => (
                        <div key={rating} className="flex items-center gap-2">
                          <span className="text-sm text-gray-600 w-2">{rating}</span>
                          <Star className="w-3 h-3 text-yellow-400 fill-current" />
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-[#ee0000] h-2 rounded-full"
                              style={{
                                width: `${
                                  rating === 5 ? 60 : rating === 4 ? 25 : rating === 3 ? 10 : rating === 2 ? 3 : 2
                                }%`,
                              }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-600 w-8">
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
                  <div className="bg-white rounded-xl p-6 shadow-sm border">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">John D.</span>
                          <span className="text-sm text-gray-500">Verified Purchase</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />
                          ))}
                        </div>
                      </div>
                      <span className="text-sm text-gray-500">2 weeks ago</span>
                    </div>
                    <h4 className="font-medium text-gray-900 mb-2">Excellent quality tool!</h4>
                    <p className="text-gray-600 text-sm leading-relaxed">
                      This tool exceeded my expectations. The build quality is outstanding and it performs exactly as
                      advertised. I&apos;ve been using it for professional work and it handles everything I throw at it.
                      Highly recommended!
                    </p>
                  </div>

                  {/* Sample Review 2 */}
                  <div className="bg-white rounded-xl p-6 shadow-sm border">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">Sarah M.</span>
                          <span className="text-sm text-gray-500">Verified Purchase</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {[...Array(4)].map((_, i) => (
                            <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />
                          ))}
                          <Star className="w-4 h-4 text-gray-300" />
                        </div>
                      </div>
                      <span className="text-sm text-gray-500">1 month ago</span>
                    </div>
                    <h4 className="font-medium text-gray-900 mb-2">Great value for money</h4>
                    <p className="text-gray-600 text-sm leading-relaxed">
                      Good quality tool at a reasonable price. Does exactly what it&apos;s supposed to do. The only
                      minor complaint is that it&apos;s slightly heavier than I expected, but that&apos;s probably due
                      to the solid construction.
                    </p>
                  </div>

                  {/* Sample Review 3 */}
                  <div className="bg-white rounded-xl p-6 shadow-sm border">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">Mike R.</span>
                          <span className="text-sm text-gray-500">Verified Purchase</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />
                          ))}
                        </div>
                      </div>
                      <span className="text-sm text-gray-500">3 weeks ago</span>
                    </div>
                    <h4 className="font-medium text-gray-900 mb-2">Professional grade quality</h4>
                    <p className="text-gray-600 text-sm leading-relaxed">
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
                <div className="bg-white rounded-xl p-6 shadow-sm border">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Truck className="w-5 h-5 text-[#ee0000]" />
                    Shipping Information
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900">Free Standard Shipping</div>
                        <div className="text-sm text-gray-600">On orders over $99 (3-5 business days)</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Clock className="w-5 h-5 text-blue-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900">Express Shipping</div>
                        <div className="text-sm text-gray-600">$15 flat rate (1-2 business days)</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Package className="w-5 h-5 text-purple-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900">Same Day Delivery</div>
                        <div className="text-sm text-gray-600">Available in Sydney, Melbourne, Brisbane ($25)</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm border">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <RotateCcw className="w-5 h-5 text-[#ee0000]" />
                    Returns & Exchanges
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900">30-Day Return Policy</div>
                        <div className="text-sm text-gray-600">Return unused items in original packaging</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900">Free Return Shipping</div>
                        <div className="text-sm text-gray-600">We cover return shipping costs</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900">Easy Returns Process</div>
                        <div className="text-sm text-gray-600">Print return label from your account</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-white rounded-xl p-6 shadow-sm border">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-[#ee0000]" />
                    Warranty & Support
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Award className="w-5 h-5 text-gold-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900">Manufacturer Warranty</div>
                        <div className="text-sm text-gray-600">3-year warranty on all {product.brand} products</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900">Expert Support</div>
                        <div className="text-sm text-gray-600">Technical support from our tool specialists</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900">Repair Services</div>
                        <div className="text-sm text-gray-600">Authorized repair centers nationwide</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-[#ee0000]/10 to-red-100 rounded-xl p-6 border border-[#ee0000]/20">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Need Help?</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Our customer service team is here to help with any questions about shipping, returns, or product
                    support.
                  </p>
                  <div className="space-y-2">
                    <div className="text-sm">
                      <span className="font-medium text-gray-900">Phone:</span>
                      <span className="text-gray-600 ml-2">1800-TOOLS-AU</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-medium text-gray-900">Email:</span>
                      <span className="text-gray-600 ml-2">hello@toolsaustralia.com.au</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-medium text-gray-900">Hours:</span>
                      <span className="text-gray-600 ml-2">Mon-Fri 8AM-6PM AEST</span>
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

