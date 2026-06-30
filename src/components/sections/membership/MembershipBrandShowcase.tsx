"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import MetallicButton from "@/components/ui/MetallicButton";
import type { MembershipCardCta } from "@/hooks/useMembershipCardCta";
import { PARTNER_BRAND_OFFERS } from "@/data/partnerBrandOffers";

export default function MembershipBrandShowcase({ cta }: { cta: MembershipCardCta }) {
  const marquee = [...PARTNER_BRAND_OFFERS, ...PARTNER_BRAND_OFFERS];
  return (
    <section
      className="relative overflow-hidden bg-page py-14 sm:py-20"
      style={{
        background:
          "radial-gradient(820px 520px at 88% -8%, rgba(238,0,0,.07), transparent 60%),radial-gradient(680px 480px at 4% 110%, rgba(212,175,55,.1), transparent 60%)",
      }}
    >
      <div className="relative z-[1] mx-auto max-w-7xl px-5 text-center sm:px-6">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">Partner discounts</span>
        <h2 className="mx-auto mt-4 max-w-3xl font-['Poppins'] text-3xl font-black tracking-tight text-primary-token sm:text-4xl lg:text-5xl dark:text-white">
          Become a member,{" "}
          <span className="text-red-600">unlock partner discounts</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-token sm:text-lg">Member pricing across the whole catalogue — one secure sign-on.</p>
        <div className="mt-7 flex justify-center">
          <MetallicButton
            variant="primary"
            size="md"
            borderRadius="full"
            onClick={() => cta.membershipPlans[0] && cta.onSelect(cta.membershipPlans[0])}
            icon={<ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />}
            className="!rounded-xl !px-6 !py-3 !text-sm sm:!rounded-full sm:!px-8 sm:!py-4 sm:!text-base"
          >
            Become a member
          </MetallicButton>
        </div>
      </div>

      {/* Partner brand marquee */}
      <div className="relative z-[1] mt-12 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_7%,#000_93%,transparent)]">
        <div className="flex w-max gap-3.5 animate-[marquee-scroll_34s_linear_infinite] hover:[animation-play-state:paused]">
          {marquee.map((b, i) => (
            <div key={`${b.id}-${i}`} className="flex h-[72px] flex-shrink-0 items-center justify-center rounded-2xl border border-token bg-white px-7 shadow-sm">
              <Image src={b.logo} alt={b.name} width={150} height={40} className="h-10 w-auto max-w-[150px] object-contain" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
