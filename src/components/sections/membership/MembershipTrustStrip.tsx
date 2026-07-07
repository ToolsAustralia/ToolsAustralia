import { Trophy, Play, ShieldCheck, Tag } from "lucide-react";
import { SectionContainer } from "@/components/ui/SectionContainer";

const ITEMS = [
  { icon: Trophy, label: "A winner every month" },
  { icon: Play, label: "Drawn live on Facebook" },
  { icon: ShieldCheck, label: "Independently certified" },
  { icon: Tag, label: "Partner brand discounts" },
];

export default function MembershipTrustStrip() {
  return (
    <section className="border-y border-token bg-surface/60">
      <SectionContainer as="div" className="py-4">
        <ul className="flex flex-nowrap items-center gap-[22px] overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:justify-around sm:gap-x-8 sm:gap-y-3 sm:overflow-visible [&::-webkit-scrollbar]:hidden">
          {ITEMS.map(({ icon: Icon, label }) => (
            <li key={label} className="inline-flex flex-none items-center gap-2 whitespace-nowrap text-[13px] font-semibold text-primary-token dark:text-white">
              <Icon className="h-[18px] w-[18px] flex-none text-red-600" />
              {label}
            </li>
          ))}
        </ul>
      </SectionContainer>
    </section>
  );
}
