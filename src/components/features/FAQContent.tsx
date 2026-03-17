"use client";

import { FAQSection } from "@/components/ui";
import { FaqEntry } from "@/data/faqs";

interface FAQContentProps {
  faqs: FaqEntry[];
  categories: FaqEntry["category"][];
}

export default function FAQContent({ faqs, categories }: FAQContentProps) {
  return (
    <div className="">
      <FAQSection faqs={faqs} categories={categories} showCategoryFilter={true} variant="red" maxWidth="4xl" />
    </div>
  );
}
