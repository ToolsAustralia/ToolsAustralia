"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  /** Hide the title on desktop (lg:) — useful when children have their own heading */
  hideDesktopTitle?: boolean;
}

export default function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = false,
  className = "",
  hideDesktopTitle = false,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const prefersReduced = useReducedMotion();

  return (
    <div className={className}>
      {/* Mobile: collapsible header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-3 lg:hidden group"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {title}
          </span>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: prefersReduced ? 0 : 0.2 }}
          className="w-6 h-6 rounded-full bg-gray-100 dark:bg-neutral-800 group-hover:bg-gray-200 dark:group-hover:bg-neutral-700 flex items-center justify-center flex-shrink-0 transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5 text-gray-500 dark:text-neutral-400" />
        </motion.div>
      </button>

      {/* Desktop: always-visible title (optional) */}
      {!hideDesktopTitle && (
        <div className="hidden lg:flex items-center gap-2 mb-3">
          {icon}
          <span className="text-base font-semibold text-gray-900 dark:text-white">{title}</span>
        </div>
      )}

      {/* Mobile: animated collapsible content */}
      <div className="lg:hidden">
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={prefersReduced ? {} : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={prefersReduced ? {} : { height: 0, opacity: 0 }}
              transition={{
                duration: prefersReduced ? 0 : 0.3,
                ease: [0.4, 0, 0.2, 1],
              }}
              className="overflow-hidden"
            >
              <div className="pt-3">{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Desktop: always visible content */}
      <div className="hidden lg:block">{children}</div>
    </div>
  );
}
