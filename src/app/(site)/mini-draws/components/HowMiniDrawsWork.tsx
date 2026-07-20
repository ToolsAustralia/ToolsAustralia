"use client";

import { motion, useReducedMotion, useInView } from "framer-motion";
import { useRef } from "react";
import { Package, Ticket, Trophy } from "lucide-react";

const steps = [
  {
    icon: Package,
    title: "Purchase a Mini Pack",
    description: "Buy a mini pack to get entries in active mini draws.",
    step: 1,
  },
  {
    icon: Ticket,
    title: "Join Mini Draws",
    description: "Browse active draws and grab the mini pack that suits your goals — free entries included.",
    step: 2,
  },
  {
    icon: Trophy,
    title: "Track Winners",
    description: "Check the results page to see who took home the prize.",
    href: "/draw-results",
    step: 3,
  },
];

export default function HowMiniDrawsWork() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const prefersReduced = useReducedMotion();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <section
        ref={ref}
        className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-gray-200/50 dark:border-neutral-800 px-6 py-8 sm:py-10"
      >
        {/* Section Header */}
        <motion.div
          className="text-center mb-8 sm:mb-10"
          initial={{ opacity: 0, y: 15 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: prefersReduced ? 0 : 0.5 }}
        >
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 font-poppins mb-3">
            How Mini Draws Work
          </h2>
          <p className="text-gray-600 dark:text-neutral-400 max-w-2xl mx-auto">
            Purchase a mini pack, join active draws, and check the results when we announce winners.
          </p>
        </motion.div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 relative">
          {/* Connecting Line (desktop only) */}
          <div className="hidden sm:block absolute top-10 left-[16.67%] right-[16.67%] h-[2px] z-0">
            <motion.div
              className="h-full bg-gradient-to-r from-transparent via-gray-200 dark:via-neutral-600 to-transparent"
              initial={{ scaleX: 0 }}
              animate={isInView ? { scaleX: 1 } : {}}
              transition={{ duration: prefersReduced ? 0 : 0.8, delay: 0.3 }}
            />
          </div>

          {steps.map((step, i) => (
            <motion.div
              key={step.step}
              className="text-center group relative z-10"
              initial={{ opacity: 0, y: 25 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{
                duration: prefersReduced ? 0 : 0.5,
                delay: prefersReduced ? 0 : 0.2 + i * 0.15,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
            >
              {/* Step Number + Icon */}
              <div className="relative inline-flex mb-4">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-red-600 to-red-675 rounded-2xl flex items-center justify-center shadow-lg shadow-red-600/20 group-hover:shadow-xl group-hover:shadow-red-600/30 group-hover:scale-105 transition-all duration-300">
                  <step.icon className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                </div>
                <span className="absolute -top-2 -right-2 w-6 h-6 bg-gray-900 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-md">
                  {step.step}
                </span>
              </div>

              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 font-poppins">{step.title}</h3>
              <p className="text-sm sm:text-base text-gray-600 dark:text-neutral-400 leading-relaxed max-w-xs mx-auto">
                {step.href ? (
                  <>
                    Check the{" "}
                    <a href={step.href} className="text-red-600 dark:text-red-400 hover:underline font-medium">
                      results page
                    </a>{" "}
                    to see who took home the prize.
                  </>
                ) : (
                  step.description
                )}
              </p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
