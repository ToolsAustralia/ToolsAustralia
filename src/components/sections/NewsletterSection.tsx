"use client";

import { useState } from "react";
import { Mail, Send, CheckCircle } from "lucide-react";

export default function NewsletterSection() {
  const [email, setEmail] = useState("");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);

    // Simulate API call
    setTimeout(() => {
      setIsSubscribed(true);
      setIsLoading(false);
      setEmail("");

      // Reset success state after 3 seconds
      setTimeout(() => {
        setIsSubscribed(false);
      }, 3000);
    }, 1000);
  };

  return (
    <div className="absolute top-0 left-0 right-0 z-20 -translate-y-1/2 w-full overflow-hidden">
      <div className="w-full px-3 sm:px-4 lg:px-8 lg:max-w-8xl lg:mx-auto">
        <div className="bg-gradient-to-r from-red-600 via-red-700 to-red-800 rounded-[16px] sm:rounded-[20px] p-4 sm:p-6 lg:p-8 shadow-2xl relative overflow-hidden">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-10">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Cpath d='M20 20c0-5.5-4.5-10-10-10s-10 4.5-10 10 4.5 10 10 10 10-4.5 10-10zm10 0c0-5.5-4.5-10-10-10s-10 4.5-10 10 4.5 10 10 10 10-4.5 10-10z'/%3E%3C/g%3E%3C/svg%3E")`,
              }}
            ></div>
          </div>

          <div className="relative z-10">
            <div className="flex flex-row items-center justify-between gap-2 sm:gap-4 lg:gap-8">
              {/* Left Content - Text Section */}
              <div className="text-white text-left flex-1 min-w-0">
                <h3 className="text-base sm:text-lg md:text-xl lg:text-[40px] font-bold leading-tight mb-1 sm:mb-2 lg:mb-4 font-['Poppins']">
                  Stay Up to Date About Our <span className="text-yellow-300">Latest Offers</span>
                </h3>
                <p className="hidden lg:block text-[16px] text-white/90 leading-relaxed">
                  Get exclusive access to member discounts and early product launches.
                </p>
              </div>

              {/* Right Content - Form Section */}
              <div className="flex flex-col gap-2 sm:gap-3 lg:gap-4 w-auto lg:w-96 flex-shrink-0">
                <div className="relative w-36 sm:w-44 md:w-52 lg:w-full">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter email"
                    className="w-full bg-white rounded-[10px] sm:rounded-[12px] lg:rounded-[16px] pl-10 pr-4 sm:pl-12 sm:pr-4 lg:pl-14 lg:pr-4 py-2 sm:py-2 lg:py-4 text-sm sm:text-sm lg:text-[16px] text-gray-900 placeholder-gray-500 border-0 focus:ring-2 focus:ring-yellow-300 focus:outline-none transition-all duration-200"
                    required
                  />
                </div>

                <button
                  onClick={handleSubscribe}
                  disabled={isLoading || !email}
                  className="bg-white hover:bg-gray-100 text-black font-semibold py-3 sm:py-3 lg:py-4 px-4 sm:px-5 lg:px-8 rounded-[10px] sm:rounded-[12px] lg:rounded-[16px] text-sm sm:text-sm lg:text-[16px] transition-all duration-300 flex items-center justify-center gap-2 sm:gap-2 lg:gap-3 w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 sm:w-4 sm:h-4 lg:w-5 lg:h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                      <span className="hidden lg:inline">Subscribing...</span>
                      <span className="lg:hidden">Subscribing</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                      <span className="hidden lg:inline">Subscribe to Newsletter</span>
                      <span className="lg:hidden">Subscribe</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Success Message */}
            {isSubscribed && (
              <div className="absolute inset-0 bg-red-600/95 backdrop-blur-sm rounded-[16px] sm:rounded-[20px] flex items-center justify-center z-20">
                <div className="text-center text-white px-4">
                  <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 text-yellow-300 mx-auto mb-2 sm:mb-3" />
                  <h4 className="text-[18px] sm:text-[20px] font-bold mb-1 sm:mb-2">Welcome Aboard!</h4>
                  <p className="text-white/90 text-[12px] sm:text-[14px]">
                    You&apos;re now subscribed to our newsletter.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
