"use client";

import { BadgeCheck, Check, Facebook, Play, Ticket } from "lucide-react";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import { useUserContext } from "@/contexts/UserContext";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { Reveal } from "./Reveal";
import MembershipModal from "@/components/modals/MembershipModal/LazyMembershipModal";

const FACEBOOK_URL = "https://www.facebook.com/toolsaust";

export default function ResultsCTA() {
  const modal = useMembershipModal();
  const { whenGatesOpenElseGateModal } = useMajorDrawPurchaseGate();
  const { userData } = useUserContext();
  const requestModal = useModalPriorityStore((s) => s.requestModal);
  const isActiveMember = !!userData?.subscription?.isActive;

  // Mirror MembershipSection: open the join flow only when the purchase gate is
  // open, otherwise show the GateClosedModal (freeze/blackout window).
  // Active members can't buy a default membership package, so route them to the
  // SpecialPackagesModal (member-only additional packs) — globally mounted by
  // UnifiedModalManager and opened via the modal-priority store. Everyone else
  // gets the MembershipModal package picker.
  const openJoin = () =>
    whenGatesOpenElseGateModal(() => {
      if (isActiveMember) {
        requestModal("special-packages", true);
      } else {
        modal.openModalWithPackageSelectionFirst();
      }
    });

  return (
    <section className="relative overflow-hidden" style={{ background: "#08080a" }}>
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 90% at 50% 0%, rgba(8,8,10,.55), #08080a 75%)" }}
      />
      <div
        className="lp-glow"
        style={{ width: 520, height: 360, left: "50%", top: -120, transform: "translateX(-50%)", opacity: 0.25 }}
      />
      <div className="lp-container relative py-16 sm:py-28 text-center">
        <Reveal>
          <span
            className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[.2em] uppercase font-bold px-3 py-1.5 rounded-full"
            style={{ background: "rgba(255,255,255,.08)", color: "#fff", border: "1px solid rgba(255,255,255,.16)" }}
          >
            <span className="lp-livedot" style={{ background: "var(--hot)" }} /> Live on Facebook
          </span>
          <h2 className="lp-display lp-italic text-3xl sm:text-6xl lg:text-7xl mt-6 mx-auto max-w-3xl" style={{ color: "#fff" }}>
            Want your name
            <br />
            on this page?
          </h2>
          <p className="mt-5 text-[16px] max-w-xl mx-auto" style={{ color: "#bcbcc6" }}>
            Every winner above started with a single entry. Grab a pack or membership and you&rsquo;re in this
            month&rsquo;s live draw.
          </p>
        </Reveal>
        <Reveal className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={openJoin} className="lp-btn lp-btn-accent lp-btn-xl lp-shine">
            <Ticket size={24} strokeWidth={2.1} />
            <span>Get your entries</span>
          </button>
          <a
            href={FACEBOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="lp-btn lp-btn-fb"
            style={{ background: "rgba(255,255,255,.08)", color: "#fff", border: "1px solid rgba(255,255,255,.18)" }}
          >
            <Facebook size={16} /> <span>Watch live on Facebook</span>
          </a>
        </Reveal>
        <Reveal
          className="mt-7 grid grid-cols-3 gap-x-2 gap-y-2 text-center text-[11px] sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-6 sm:text-[12.5px]"
          style={{ color: "#84848f" }}
        >
          <span className="flex flex-col items-center gap-1 sm:flex-row sm:gap-1.5">
            <Check size={14} strokeWidth={2.3} style={{ color: "var(--accent)" }} /> From $20/mo
          </span>
          <span className="flex flex-col items-center gap-1 sm:flex-row sm:gap-1.5">
            <Play size={14} style={{ color: "var(--accent)" }} /> Drawn live on the 27th
          </span>
          <span className="flex flex-col items-center gap-1 sm:flex-row sm:gap-1.5">
            <BadgeCheck size={14} strokeWidth={2.1} style={{ color: "var(--accent)" }} /> Cancel anytime
          </span>
        </Reveal>
      </div>

      <MembershipModal
        isOpen={modal.isModalOpen}
        onClose={modal.closeModal}
        selectedPlan={modal.selectedPlan}
        membershipModalConfig={{ showPackageSelectionFirst: modal.openWithPackageSelectionFirst }}
      />
    </section>
  );
}
