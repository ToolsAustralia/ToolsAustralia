import { rewardsEnabled } from "@/config/featureFlags";
import { rewardsDisabledMessage } from "@/config/rewardsSettings";

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  category: "ALL QUESTIONS" | "SHOPPING" | "PAYMENTS" | "REWARDS" | "PARTNERSHIPS";
}

export const faqCategories: FaqEntry["category"][] = ["ALL QUESTIONS", "SHOPPING", "PAYMENTS", "REWARDS", "PARTNERSHIPS"];

/**
 * Centralised FAQ content so both the page and the interactive client component stay in sync.
 */
export function getFaqEntries(): FaqEntry[] {
  const isRewardsFeatureEnabled = rewardsEnabled();
  const rewardsAnswer = isRewardsFeatureEnabled
    ? "You earn points for every purchase made on our platform. Points can be redeemed for discounts on future purchases or exclusive member benefits. The more you shop, the more points you earn!"
    : `${rewardsDisabledMessage()} We will notify members as soon as redemptions resume.`;

  return [
    {
      id: "1",
      question: "How do I place an order?",
      answer:
        "Placing an order is simple! Browse our products, add items to your cart, and proceed to checkout. You'll need to create an account or sign in, enter your shipping information, select a payment method, and confirm your order. You'll receive an email confirmation once your order is placed.",
      category: "SHOPPING",
    },
    {
      id: "2",
      question: "What payment methods do you accept?",
      answer:
        "We accept all major credit cards (Visa, MasterCard, American Express), PayPal, Apple Pay, Google Pay, and bank transfers. All payments are processed securely through our encrypted payment system.",
      category: "PAYMENTS",
    },
    {
      id: "3",
      question: "How long does shipping take?",
      answer:
        "Standard shipping takes 3-5 business days within Australia. Express shipping is available for 1-2 business days. International shipping takes 7-14 business days depending on the destination.",
      category: "SHOPPING",
    },
    {
      id: "4",
      question: "Can I modify or cancel my order?",
      answer:
        "You can modify or cancel your order within 1 hour of placing it. After that, the order will be processed and cannot be changed. Please contact our customer service team immediately if you need assistance.",
      category: "SHOPPING",
    },
    {
      id: "5",
      question: "Do you offer international shipping?",
      answer:
        "Yes, we ship to most countries worldwide. Shipping costs and delivery times vary by destination. You can check shipping options and costs during checkout.",
      category: "SHOPPING",
    },
    {
      id: "6",
      question: "How do rewards points work?",
      answer: rewardsAnswer,
      category: "REWARDS",
    },
    {
      id: "7",
      question: "What are the benefits of becoming a partner?",
      answer:
        "Our partners enjoy exclusive access to bulk pricing, priority customer support, dedicated account management, and co-marketing opportunities. Contact our partnership team to learn more.",
      category: "PARTNERSHIPS",
    },
  ];
}

