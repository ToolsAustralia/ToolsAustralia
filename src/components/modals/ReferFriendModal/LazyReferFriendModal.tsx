"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { ReferFriendModalProps } from "./index";

// ReferFriendModal calls useReferralProfile(userId) at the top of its component body —
// ABOVE Shell's `if (!isOpen) return null` — so the hook (and its /api/referrals/code
// fetch) fires on mount regardless of `isOpen`. page-client.tsx already wrapped this
// modal in next/dynamic, but rendering a dynamic() component with isOpen=false still
// downloads + evaluates its chunk and runs its hooks (CLAUDE.md perf footgun #1). Same
// fix as LazyMembershipModal: don't mount the real component (no chunk, no query) until
// the FIRST open, then keep it mounted so close/reopen behaves like the always-mounted
// version.
const ReferFriendModalDynamic = dynamic(() => import("./index"), { ssr: false });

export default function LazyReferFriendModal(props: ReferFriendModalProps) {
  const [hasOpened, setHasOpened] = useState(false);
  if (props.isOpen && !hasOpened) setHasOpened(true); // render-phase latch (same-component setState is safe)

  if (!hasOpened) return null;
  return <ReferFriendModalDynamic {...props} />;
}
