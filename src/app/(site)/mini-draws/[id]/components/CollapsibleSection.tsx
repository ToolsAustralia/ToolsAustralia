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
}

export default function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = false,
  className = "",
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const prefersReduced = useReducedMotion();

  return (
    <div className={className}>
      {/* Mobile: collapsible header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2.5 lg:hidden group"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <span className="truncate text-[14px] font-extrabold text-[#111827] dark:text-white">{title}</span>
        </div>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: prefersReduced ? 0 : 0.2 }}
          className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7280] transition-colors group-hover:bg-[#E9EAEE] dark:bg-neutral-800 dark:text-neutral-400"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </motion.span>
      </button>

      {/* Desktop: always-visible title */}
      <div className="mb-3 hidden items-center gap-2 lg:flex">
        {icon}
        <span className="text-base font-extrabold text-[#111827] dark:text-white">{title}</span>
      </div>

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
              <div className="pt-2.5">{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Desktop: always visible content */}
      <div className="hidden lg:block">{children}</div>
    </div>
  );
}
