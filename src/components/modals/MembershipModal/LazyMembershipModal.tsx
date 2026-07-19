"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { MembershipModalProps } from "./index";

// The heavy payment chunk (~7k lines + Stripe/embla/zoom libs) must NOT download for
// guests who never open the modal. Rendering a dynamic() component — even with
// isOpen=false — still fetches and evaluates its chunk, so this wrapper renders
// nothing until the FIRST open, then keeps the modal mounted so the close animation
// and internal step state behave exactly like the always-mounted version.
const MembershipModalDynamic = dynamic(() => import("./index"), { ssr: false });

// Pre-mount event buffer (2026-07 final-review fix). Hosts dispatch
// "openMembershipModal" (e.g. the rewards coupon-unlock flow, carrying
// detail.referralCode) synchronously BEFORE calling openModal(). Until first open the
// real modal — and the prefill listener it installs — does not exist, and CustomEvents
// are not queued, so without this buffer the member's coupon code is silently dropped
// on the first open of a page session (they'd pay without their redemption code).
// The wrapper captures the last pre-mount event's detail; MembershipModal consumes it
// when its prefill listener mounts.
let pendingOpenEventDetail: unknown = null;

/** Read-and-clear the last "openMembershipModal" detail dispatched before the modal mounted. */
export function consumePendingOpenMembershipModalDetail(): unknown {
  const detail = pendingOpenEventDetail;
  pendingOpenEventDetail = null;
  return detail;
}

export default function LazyMembershipModal(props: MembershipModalProps) {
  const [hasOpened, setHasOpened] = useState(false);
  if (props.isOpen && !hasOpened) setHasOpened(true); // render-phase latch (same-component setState is safe)

  useEffect(() => {
    if (hasOpened) return; // once mounted, the modal's own listener handles the event
    const capture = (event: Event) => {
      pendingOpenEventDetail = (event as CustomEvent).detail;
    };
    window.addEventListener("openMembershipModal", capture);
    return () => window.removeEventListener("openMembershipModal", capture);
  }, [hasOpened]);

  if (!hasOpened) return null;
  return <MembershipModalDynamic {...props} />;
}
