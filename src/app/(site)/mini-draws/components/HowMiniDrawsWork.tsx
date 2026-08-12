"use client";

import { motion, useReducedMotion, useInView } from "framer-motion";
import { useRef } from "react";
import { Package, Ticket, Trophy } from "lucide-react";

const steps = [
  {
    icon: Package,
    step: 1,
    title: "Purchase a mini pack",
    body: "Buy a mini pack to get entries in active mini draws.",
    bodyDesktop: "Buy a mini pack to get entries in active mini draws.",
    linksToResults: false,
  },
  {
    icon: Ticket,
    step: 2,
    title: "Join mini draws",
    body: "Grab the mini pack that suits your goals — free entries included.",
    bodyDesktop: "Browse active draws and grab the mini pack that suits your goals — free entries included.",
    linksToResults: false,
  },
  {
    icon: Trophy,
    step: 3,
    title: "Track winners",
    body: "Check the results page to see who took home the prize.",
    bodyDesktop: "Check the results page to see who took home the prize.",
    linksToResults: true,
  },
] as const;

/** "Check the <link>results page</link> to see who took home the prize." */
function ResultsLink() {
  return (
    <a href="/draw-results" className="font-semibold text-red-600 hover:underline dark:text-red-400">
      results page
    </a>
  );
}

export default function HowMiniDrawsWork() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const prefersReduced = useReducedMotion();

  return (
    <div className="mx-auto w-full max-w-7xl px-3.5 pb-4 sm:px-6 lg:px-8 lg:py-4">
      <section
        ref={ref}
        className="rounded-[20px] border border-[#EFF0F3] bg-white px-4 py-5 lg:border-[#EAECEF] lg:px-7 lg:py-[34px] dark:border-neutral-800 dark:bg-neutral-900"
      >
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 15 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: prefersReduced ? 0 : 0.5 }}
        >
          <h2 className="font-poppins text-[17px] font-extrabold text-[#111827] dark:text-white lg:text-[26px]">
            How mini draws work
          </h2>
          <p className="mx-auto mt-1 max-w-2xl text-[12.5px] leading-[1.5] text-[#6B7280] text-pretty dark:text-neutral-400 lg:mt-1.5 lg:text-[15px]">
            <span className="lg:hidden">Buy a mini pack, join active draws, check the results.</span>
            <span className="hidden lg:inline">
              Purchase a mini pack, join active draws, and check the results when we announce winners.
            </span>
          </p>
        </motion.div>

        {/* Mobile — three horizontal rows. Centred blocks made each step read as a headline
            with a caption; a row reads as a step in a sequence, which is what it is. */}
        <div className="mt-4 flex flex-col gap-2.5 lg:hidden">
          {steps.map((step, i) => (
            <motion.div
              key={step.step}
              className="flex items-start gap-3 rounded-[14px] border border-[#F1F2F5] bg-[#FAFAFB] p-3 dark:border-neutral-800 dark:bg-neutral-950"
              initial={{ opacity: 0, y: 12 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{
                duration: prefersReduced ? 0 : 0.4,
                delay: prefersReduced ? 0 : 0.15 + i * 0.1,
              }}
            >
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-red-675 text-white shadow-[0_8px_16px_-8px_rgba(238,0,0,.7)]">
                <step.icon className="h-[19px] w-[19px]" />
                <span className="absolute -right-1.5 -top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#111827] text-[10px] font-extrabold text-white">
                  {step.step}
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13px] font-bold text-[#111827] dark:text-white">{step.title}</span>
                <span className="text-[12px] leading-[1.45] text-[#6B7280] dark:text-neutral-400">
                  {step.linksToResults ? (
                    <>
                      Check the <ResultsLink /> to see who took home the prize.
                    </>
                  ) : (
                    step.body
                  )}
                </span>
              </span>
            </motion.div>
          ))}
        </div>

        {/* Desktop — unchanged 3-across layout */}
        <div className="mt-[26px] hidden grid-cols-3 gap-7 lg:grid">
          {steps.map((step, i) => (
            <motion.div
              key={step.step}
              className="flex flex-col items-center gap-2.5 text-center"
              initial={{ opacity: 0, y: 25 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{
                duration: prefersReduced ? 0 : 0.5,
                delay: prefersReduced ? 0 : 0.2 + i * 0.15,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
            >
              <span className="relative flex h-[68px] w-[68px] items-center justify-center rounded-[18px] bg-gradient-to-br from-red-600 to-red-675 text-white shadow-[0_14px_26px_-14px_rgba(238,0,0,.8)]">
                <step.icon className="h-[30px] w-[30px]" />
                <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#111827] text-[12px] font-extrabold text-white">
                  {step.step}
                </span>
              </span>
              <span className="font-poppins text-[17px] font-extrabold text-[#111827] dark:text-white">
                {step.title}
              </span>
              <span className="max-w-[250px] text-sm leading-[1.55] text-[#6B7280] dark:text-neutral-400">
                {step.linksToResults ? (
                  <>
                    Check the <ResultsLink /> to see who took home the prize.
                  </>
                ) : (
                  step.bodyDesktop
                )}
              </span>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
