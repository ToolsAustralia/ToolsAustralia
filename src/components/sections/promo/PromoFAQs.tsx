"use client";

import { FAQSection, FAQItem } from "@/components/ui";
import { usePromoTheme } from "@/stores/usePromoThemeStore";

const faqs: FAQItem[] = [
  {
    id: "1",
    question: "How do I enter the giveaway?",
    answer:
      "Simply purchase any One Time Package or Membership from our website. A One Time Package will specifically enter you with one time entries into the giveaway and a membership will automatically enter you into all of our giveaways.",
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
      "As a member, you accumulate entries for the Major Giveaway with your subscription. For mini draws, only mini pack purchases count—you can buy mini packs to enter. You can also purchase one-time or other packages which include free entries for the major giveaway.",
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

export default function PromoFAQs() {
  const theme = usePromoTheme();
  return (
    <FAQSection
      title="Frequently Asked Questions"
      faqs={faqs}
      showCategoryFilter={false}
      variant="red"
      iconColorHex={theme.primary}
      maxWidth="4xl"
      className="py-10 sm:py-14 lg:py-20"
    />
  );
}
