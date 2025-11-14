"use client";

import Link from "next/link";
import Image from "next/image";
import { Facebook, Instagram } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white relative overflow-hidden w-full">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        ></div>
      </div>

      <div className="relative z-10">
        {/* Main Footer Content */}
        <div className="w-full px-3 sm:px-4 lg:px-4 pt-20 sm:pt-24 lg:pt-32 pb-8 sm:pb-10 lg:pb-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 sm:gap-8 lg:gap-12">
            {/* Company Info */}
            <div className="lg:col-span-2">
              <div className="mb-6 sm:mb-8">
                <div className="relative h-12 sm:h-14 lg:h-16 w-36 sm:w-44 lg:w-48 mb-4 sm:mb-6 mx-auto md:mx-0">
                  <Image
                    src="/images/Tools Australia Logo/White-Black Logo.png"
                    alt="Tools Australia Logo"
                    fill
                    className="object-contain"
                    sizes="192px"
                  />
                </div>
                <p className="text-gray-300 text-xs sm:text-sm lg:text-[16px] leading-relaxed mb-3 sm:mb-4 max-w-sm">
                  Equipping professionals with premium tools and exclusive member benefits. Your trusted partner for
                  quality, reliability, and exceptional service.
                </p>
                <p className="text-gray-500 text-[10px] sm:text-[11px] lg:text-[12px] mb-3 sm:mb-4">
                  ABN:54 690 397 061 | ACN: 690 397 061 | License: TP/04720
                </p>
              </div>
            </div>

            {/* Quick Links Row - Quick Links, Support, Legal */}
            <div className="md:col-span-2 lg:col-span-3 grid grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
              {/* Quick Links */}
              <div>
                <h4 className="text-white font-bold text-sm sm:text-base lg:text-[18px] mb-4 sm:mb-5 lg:mb-6 tracking-wide text-center md:text-left">
                  Quick Links
                </h4>
                <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                  <Link
                    href="/"
                    className="block text-gray-300 hover:text-white transition-colors duration-200 text-xs sm:text-sm lg:text-[15px] text-center md:text-left"
                  >
                    Home
                  </Link>
                  <Link
                    href="/shop"
                    className="block text-gray-300 hover:text-white transition-colors duration-200 text-xs sm:text-sm lg:text-[15px] text-center md:text-left"
                  >
                    Shop
                  </Link>
                  <Link
                    href="/mini-draws"
                    className="block text-gray-300 hover:text-white transition-colors duration-200 text-xs sm:text-sm lg:text-[15px] text-center md:text-left"
                  >
                    Mini Draws
                  </Link>
                  <Link
                    href="/my-account"
                    className="block text-gray-300 hover:text-white transition-colors duration-200 text-xs sm:text-sm lg:text-[15px] text-center md:text-left"
                  >
                    My Account
                  </Link>
                  <Link
                    href="/promotional/giveaway"
                    className="block text-gray-300 hover:text-white transition-colors duration-200 text-xs sm:text-sm lg:text-[15px] text-center md:text-left"
                  >
                    Promotions
                  </Link>
                </div>
              </div>

              {/* Customer Support */}
              <div>
                <h4 className="text-white font-bold text-sm sm:text-base lg:text-[18px] mb-4 sm:mb-5 lg:mb-6 tracking-wide text-center md:text-left">
                  Support
                </h4>
                <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                  <Link
                    href="/faq"
                    className="block text-gray-300 hover:text-white transition-colors duration-200 text-xs sm:text-sm lg:text-[15px] text-center md:text-left"
                  >
                    FAQs
                  </Link>
                  <Link
                    href="/contact"
                    className="block text-gray-300 hover:text-white transition-colors duration-200 text-xs sm:text-sm lg:text-[15px] text-center md:text-left"
                  >
                    Contact
                  </Link>
                </div>
              </div>

              {/* Legal & Resources */}
              <div>
                <h4 className="text-white font-bold text-sm sm:text-base lg:text-[18px] mb-4 sm:mb-5 lg:mb-6 tracking-wide text-center md:text-left">
                  Legal
                </h4>
                <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                  <Link
                    href="/privacy"
                    className="block text-gray-300 hover:text-white transition-colors duration-200 text-xs sm:text-sm lg:text-[15px] text-center md:text-left"
                  >
                    Privacy Policy
                  </Link>
                  <Link
                    href="/terms"
                    className="block text-gray-300 hover:text-white transition-colors duration-200 text-xs sm:text-sm lg:text-[15px] text-center md:text-left"
                  >
                    Terms and Conditions
                  </Link>
                  <Link
                    href="/competition-terms/major-giveaway"
                    className="block text-gray-300 hover:text-white transition-colors duration-200 text-xs sm:text-sm lg:text-[15px] text-center md:text-left"
                  >
                    Competition Terms (Major Giveaway)
                  </Link>
                  <Link
                    href="/competition-terms/mini-draw"
                    className="block text-gray-300 hover:text-white transition-colors duration-200 text-xs sm:text-sm lg:text-[15px] text-center md:text-left"
                  >
                    Competition Terms (Mini Draw)
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="border-t border-gray-700">
          <div className="w-full px-3 sm:px-4 lg:px-4 py-6 sm:py-7 lg:py-8">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-4 sm:gap-5 lg:gap-6">
              {/* Payment Methods */}
              <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
                <span className="text-gray-400 text-xs sm:text-sm lg:text-[14px] font-medium">We Accept:</span>
                <div className="flex items-center gap-0 sm:gap-2 lg:gap-3">
                  {/* VISA Logo */}
                  <div className="relative w-10 h-6 sm:w-12 sm:h-8 lg:w-14 lg:h-9 rounded overflow-hidden flex items-center justify-center">
                    <Image
                      src="/paymentGateway/VISA-logo.png"
                      alt="VISA"
                      fill
                      className="object-contain p-0.5"
                      sizes="56px"
                    />
                  </div>

                  {/* MasterCard Logo */}
                  <div className="relative w-10 h-6 sm:w-12 sm:h-8 lg:w-14 lg:h-9 rounded overflow-hidden flex items-center justify-center">
                    <Image
                      src="/paymentGateway/MasterCard-logo.png"
                      alt="MasterCard"
                      fill
                      className="object-contain p-0.5"
                      sizes="56px"
                    />
                  </div>

                  {/* AMEX Logo */}
                  <div className="relative w-12 h-8 sm:w-14 sm:h-10 lg:w-16 lg:h-12 rounded overflow-hidden flex items-center justify-center">
                    <Image
                      src="/paymentGateway/Amex-logo.png"
                      alt="American Express"
                      fill
                      className="object-contain p-0.5"
                      sizes="70px"
                    />
                  </div>

                  {/* Apple Pay Logo */}
                  <div className="relative w-12 h-8 sm:w-14 sm:h-10 lg:w-16 lg:h-12 rounded overflow-hidden flex items-center justify-center">
                    <Image
                      src="/paymentGateway/ApplePay-logo-white.png"
                      alt="Apple Pay"
                      fill
                      className="object-contain p-0.5"
                      sizes="70px"
                    />
                  </div>
                </div>
              </div>

              {/* Social Media Icons */}
              <div className="flex items-center gap-3 sm:gap-4 lg:gap-5">
                <span className="text-gray-400 text-xs sm:text-sm lg:text-[14px] font-medium">Follow Us:</span>
                <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
                  <Link
                    href="https://facebook.com/toolsaustralia"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 bg-gray-700 hover:bg-blue-600 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110"
                    aria-label="Follow us on Facebook"
                  >
                    <Facebook size={16} className="sm:w-5 sm:h-5 lg:w-5 lg:h-5" />
                  </Link>
                  <Link
                    href="https://instagram.com/toolsaustralia"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 bg-gray-700 hover:bg-gradient-to-r hover:from-purple-500 hover:to-pink-500 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110"
                    aria-label="Follow us on Instagram"
                  >
                    <Instagram size={16} className="sm:w-5 sm:h-5 lg:w-5 lg:h-5" />
                  </Link>
                </div>
              </div>

              {/* Copyright */}
              <div className="text-center lg:text-right">
                <p className="text-gray-400 text-xs sm:text-sm lg:text-[14px]">
                  © 2025 Tools Australia Pty Ltd. All Rights Reserved
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
