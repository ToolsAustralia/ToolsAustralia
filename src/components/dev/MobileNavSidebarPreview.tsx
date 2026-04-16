"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";

/**
 * Dev-only: mimics the site mobile nav drawer (header sidebar) for overlay QA
 * without mounting the full Header.
 */
export default function MobileNavSidebarPreview({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] lg:hidden" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-fade-in"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div
        className="absolute top-0 left-0 h-full w-80 max-w-[85vw] bg-white dark:bg-neutral-900 z-10 shadow-2xl flex flex-col sidebar-slide-in"
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation preview"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-neutral-700 bg-gradient-to-r from-red-600 to-red-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 flex items-center justify-center relative">
              <Image
                src="/images/Tools Australia Logo/Social Media Profile_Primary.webp"
                alt="Tools Australia"
                width={40}
                height={40}
                className="object-contain rounded-full"
              />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">Tools Australia</h2>
              <p className="text-white/80 text-sm">Drawer preview (dev)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 text-white/80 hover:text-white hover:bg-white/20 rounded-full transition-colors flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {[
            { href: "/shop", label: "Shop" },
            { href: "/mini-draws", label: "Mini draws" },
            { href: "/rewards", label: "Rewards" },
            { href: "/my-account", label: "My account" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-800 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-800"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
