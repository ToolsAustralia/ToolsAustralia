"use client";

import React from "react";
import Image from "next/image";
import { Facebook, Instagram } from "lucide-react";
import { cn } from "@/utils/cn";

interface SocialLinksProps {
  className?: string;
}

export default function SocialLinksSection({ className = "" }: SocialLinksProps) {
  const socialLinks = [
    {
      id: "facebook",
      name: "Facebook",
      image: "/images/facebook-profile.webp",
      url: "https://www.facebook.com/toolsaust",
      buttonLabel: "Visit Facebook",
      Icon: Facebook,
    },
    {
      id: "instagram",
      name: "Instagram",
      image: "/images/instagram-profile.webp",
      url: "https://www.instagram.com/toolsaustralia/",
      buttonLabel: "Visit Instagram",
      Icon: Instagram,
    },
  ];

  return (
    <div className={cn("px-4 sm:px-6", className)}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="text-base xs:text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
            Follow Us
          </h3>
          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href="https://www.facebook.com/toolsaust"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-600 dark:text-gray-400 hover:text-[#1877f2] transition-colors"
              aria-label="Follow us on Facebook"
            >
              <Facebook className="w-5 h-5 sm:w-6 sm:h-6" />
            </a>
            <a
              href="https://www.instagram.com/toolsaustralia/"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-600 dark:text-gray-400 hover:text-[#e4405f] transition-colors"
              aria-label="Follow us on Instagram"
            >
              <Instagram className="w-5 h-5 sm:w-6 sm:h-6" />
            </a>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          {socialLinks.map((social) => {
            const Icon = social.Icon;
            return (
            <div
              key={social.id}
              className="rounded-xl sm:rounded-2xl overflow-hidden bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 shadow-md"
            >
              <div className="relative w-full aspect-[16/9] sm:aspect-[2/1] bg-gray-100 dark:bg-neutral-800">
                <Image
                  src={social.image}
                  alt={`${social.name} profile`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 600px"
                />
              </div>
              <a
                href={social.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 sm:py-4 px-4 bg-gray-700 dark:bg-neutral-700 hover:bg-gray-600 dark:hover:bg-neutral-600 text-white text-sm sm:text-base font-semibold transition-colors"
              >
                {social.buttonLabel}
                <Icon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              </a>
            </div>
          );
          })}
        </div>
      </div>
    </div>
  );
}
