"use client";

import { FAQSection, FAQItem } from "@/components/ui";

const faqs: FAQItem[] = [
  {
    id: "1",
    question: "How do I enter the giveaway?",
    answer:
      "Simply purchase any One Time Package or Membership from our website. A One Time Package will specifically enter you with one time entries into the giveaway and a membership will automatically enter you into all of our giveaways. The more entries you have, the better your chances of winning!",
  },
  {
    id: "2",
    question: "When will the winner be announced?",
    answer:
      "The winner is announced live on our Facebook page on the draw date. We also contact the winner directly via phone and email. Make sure to follow us on social media for live updates!",
  },
  {
    id: "3",
    question: "Can I win if I've entered before?",
    answer:
      "Absolutely! Previous entries don't affect your chances. Each is independent, and all valid entries have an equal chance of winning. Many of our winners have been loyal customers for years.",
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
      "Great! As a member, you accumulate member entries with your subscription AND you can purchase additional packages to get more entries for even more chances to win. Member packages often have better value too!",
  },
  {
    id: "8",
    question: "How will I receive my prize if I win?",
    answer:
      "We will organise the prize delivery after winner confirmation. We'll contact you within 24 hours of the draw to arrange delivery details. All prizes are delivered free of charge Australia-wide.",
  },
  {
    id: "9",
    question: "Can I enter multiple times?",
    answer:
      "Yes! You can purchase multiple packages to increase your chances. Each package gives you additional entries, and there's no limit to how many you can purchase.",
  },
];

export default function PromoFAQs() {
  return (
    <FAQSection
      title="Frequently Asked Questions"
      subtitle="Got questions? We've got answers. Everything you need to know about the Ultimate Tool Giveaway."
      faqs={faqs}
      showCategoryFilter={false}
      variant="red"
      maxWidth="4xl"
      className="py-8 sm:py-12 lg:py-16"
    />
  );
}
