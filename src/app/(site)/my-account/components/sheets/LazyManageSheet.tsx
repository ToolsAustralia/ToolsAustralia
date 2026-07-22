"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useDashboardSheetStore } from "@/stores/useDashboardSheetStore";

// ManageSheet calls useSavedPaymentMethods() unconditionally at the top of its
// component body — the sheet's own `open` state only gates SheetShell's visible
// markup, not the hooks above it — so /api/stripe/payment-methods fired on every
// /my-account load even though the layout only mounts ManageSheet as a hidden
// sibling. Same fix as LazyMembershipModal: read the (cheap, no-network) Zustand
// `sheet` selector here to latch on the FIRST time it's opened, and don't mount the
// real ManageSheet (no chunk, no query) until then; once mounted, keep it mounted so
// close/reopen behaves like the always-mounted version.
const ManageSheetDynamic = dynamic(() => import("./ManageSheet"), { ssr: false });

export default function LazyManageSheet() {
  const sheet = useDashboardSheetStore((s) => s.sheet);
  const [hasOpened, setHasOpened] = useState(false);
  if (sheet === "manage" && !hasOpened) setHasOpened(true); // render-phase latch (same-component setState is safe)

  if (!hasOpened) return null;
  return <ManageSheetDynamic />;
}
