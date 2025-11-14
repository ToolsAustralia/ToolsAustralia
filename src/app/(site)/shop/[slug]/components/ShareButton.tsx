"use client";

import { Share2 } from "lucide-react";

interface ShareButtonProps {
  name: string;
  brand?: string;
}

export default function ShareButton({ name, brand }: ShareButtonProps) {
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: name,
        text: `Check out this ${brand ? `${brand} ` : ""}tool: ${name}`,
        url: window.location.href,
      });
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      alert("Link copied to clipboard!");
    }
  };

  return (
    <button
      onClick={handleShare}
      className="p-2 sm:p-3 rounded-lg border-2 border-gray-300 hover:border-blue-500 hover:text-blue-500 transition-all duration-300 hover:scale-105"
      aria-label="Share product"
    >
      <Share2 className="w-5 h-5 sm:w-6 sm:h-6" />
    </button>
  );
}

