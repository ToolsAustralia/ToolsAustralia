"use client";

import { FAQSection, FAQItem } from "@/components/ui";
import { faqCategories, getFaqEntries } from "@/data/faqs";

export default function FAQContent() {
  const faqs: FAQItem[] = getFaqEntries();
  return (
    <div className="">
      <FAQSection faqs={faqs} categories={faqCategories} showCategoryFilter={true} variant="red" maxWidth="4xl" />
    </div>
  );
}
