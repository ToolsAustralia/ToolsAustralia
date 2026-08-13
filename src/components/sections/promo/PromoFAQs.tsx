"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronRight } from "lucide-react";

import { FAQSection, FAQItem } from "@/components/ui";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { openSupportChat } from "@/lib/support-chat/widget-events";
import { COBBER_AVATAR } from "@/components/support-chat/cobberAccent";

/**
 * Copy note (CLAUDE.md rule 11): a pack/membership is what a customer BUYS; the entries it
 * carries are a FREE INCLUSION. Every answer below says "free entries" — never "entries you
 * buy", never odds/chance framing.
 */
const faqs: FAQItem[] = [
  {
    id: "1",
    question: "How do I enter the giveaway?",
    answer:
      "Simply purchase any One Time Package or Membership from our website. A One Time Package will specifically enter you with one time free entries into the giveaway and a membership will automatically enter you into all of our giveaways.",
  },
  {
    id: "2",
    question: "When will the winner be announced?",
    answer:
      "The winner is announced live on our Facebook page on the draw date. We also contact the winner directly via phone and email. Make sure to follow us on social media for live updates!",
  },
  {
    id: "4",
    question: "How does it work?",
    answer:
      "Select a one time package or register a membership with Tools Australia and you will gain access to our business partners and you will automatically be given free entries into the giveaway.",
  },
  {
    id: "5",
    question: "How does the giveaway get drawn?",
    answer:
      "All winners are selected through a government-certified digital system called Randomdraws.com. This comes with a certificate after each draw for full transparency!",
  },
  {
    id: "6",
    question: "Who can enter the draw?",
    answer:
      "All states and territories in Australia are eligible except for ACT and SA, due to permit restrictions. Please consult your state government's eligibility criteria before making a purchase. Customers must read and understand this before making a purchase, and it is up to the customer to determine whether they are eligible to enter.",
  },
  {
    id: "7",
    question: "What if I'm already a member?",
    answer:
      "As a member, you accumulate free entries for the Major Giveaway with your subscription. For mini draws, only Mini Pack purchases count. You can also purchase one-time or other packages which include free entries for the major giveaway.",
  },
  {
    id: "8",
    question: "How will I receive my prize if I win?",
    answer:
      "We will organise the prize delivery after winner confirmation. We'll contact you within 24 hours of the draw to arrange delivery details. All prizes are delivered free of charge Australia-wide.",
  },
  {
    id: "9",
    question: "How do I contact support?",
    answer: "Reach us at support@toolsaustralia.com.au — we're here to help!",
  },
];

/**
 * Mobile accordion (design handoff, 2026-08-13).
 *
 * The shared `FAQSection` is built for a wide, centred column — on a phone its card
 * chrome and category header ate most of the fold before the first question. This is the
 * same corpus in a flat, edge-to-edge list, closed by an "Ask Cobber" row so the dead end
 * of "my question isn't here" lands on the support chat instead of nothing.
 *
 * Cobber opens through `openSupportChat()` (the shared window-event contract) rather than
 * a second chat implementation — one panel, one chat state, wherever it is opened from.
 */
function PromoFAQsMobile() {
  const theme = usePromoTheme();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="bg-white px-3.5 py-6 dark:bg-neutral-950 lg:hidden">
      {/* Same title the desktop `FAQSection` uses, so the two layouts don't name the same
          section differently. It replaced the handoff's "Questions / Everything you're
          probably wondering", which spent three lines and the top of the fold. */}
      <h2 className="font-sans text-[22px] font-extrabold leading-[1.15] tracking-[-0.01em] text-gray-900 dark:text-white">
        Frequently Asked Questions
      </h2>

      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 shadow-[0_2px_10px_rgba(0,0,0,0.04)] dark:border-white/10">
        {faqs.map((faq, i) => {
          const isOpen = openId === faq.id;
          return (
            <div
              key={faq.id}
              className={`${i === faqs.length - 1 ? "" : "border-b border-gray-200 dark:border-white/10"} ${
                isOpen ? "bg-[#fbfaf8] dark:bg-white/[0.04]" : "bg-white dark:bg-neutral-900"
              }`}
            >
              <h3>
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : faq.id)}
                  aria-expanded={isOpen}
                  aria-controls={`promo-faq-${faq.id}`}
                  className="flex w-full items-center gap-[11px] px-3.5 py-[15px] text-left font-sans text-[12.5px] font-semibold leading-snug"
                  style={{ color: isOpen ? theme.primary : undefined }}
                >
                  <span
                    aria-hidden
                    className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full font-sans text-[13px] font-bold ${
                      isOpen ? "text-white" : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-neutral-400"
                    }`}
                    style={isOpen ? { background: theme.primary } : undefined}
                  >
                    {isOpen ? "−" : "+"}
                  </span>
                  <span className={isOpen ? "" : "text-gray-900 dark:text-white"}>{faq.question}</span>
                </button>
              </h3>
              {isOpen && (
                <div
                  id={`promo-faq-${faq.id}`}
                  className="pb-4 pl-[47px] pr-3.5 font-sans text-[11.5px] leading-[1.65] text-gray-600 dark:text-neutral-300"
                >
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={openSupportChat}
        className="mt-3 flex w-full items-center gap-[11px] rounded-2xl bg-[#12100f] px-3.5 py-3.5 text-left dark:bg-neutral-900 dark:ring-1 dark:ring-white/10"
      >
        <Image
          src={COBBER_AVATAR}
          alt=""
          width={34}
          height={34}
          className="h-[34px] w-[34px] flex-none rounded-full bg-[#F1DDC2] object-cover"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-sans text-xs font-bold text-white">Still stuck? Ask Cobber</span>
          <span className="mt-0.5 block font-sans text-2xs text-gray-400">
            Or email support@toolsaustralia.com.au
          </span>
        </span>
        <ChevronRight className="h-4 w-4 flex-none" style={{ color: theme.primary }} aria-hidden />
      </button>
    </section>
  );
}

export default function PromoFAQs() {
  const theme = usePromoTheme();
  return (
    <>
      <PromoFAQsMobile />
      <div className="hidden lg:block">
        <FAQSection
          title="Frequently Asked Questions"
          faqs={faqs}
          showCategoryFilter={false}
          variant="red"
          iconColorHex={theme.primary}
          maxWidth="4xl"
          className="py-10 sm:py-14 lg:py-20"
        />
      </div>
    </>
  );
}
