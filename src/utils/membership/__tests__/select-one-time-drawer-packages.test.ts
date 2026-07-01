import assert from "node:assert/strict";
import { selectOneTimeDrawerPackages } from "../additional-package-mapping";

type Pkg = { _id: string; isAdditional?: boolean };

function run() {
  const pkgs: Pkg[] = [
    { _id: "tradie-pack" },
    { _id: "vip-pack" },
    { _id: "additional-tradie-pack", isAdditional: true },
    { _id: "additional-vip-pack", isAdditional: true },
  ];

  // Non-member → public ladder only (default /membership behavior)
  const guest = selectOneTimeDrawerPackages(pkgs, { hasAdditionalAccess: false, includeAdditional: false });
  assert.deepEqual(guest.map((p) => p._id), ["tradie-pack", "vip-pack"], "guest sees public packs");

  // Member but flag off → still public ladder (unchanged /membership page)
  const memberFlagOff = selectOneTimeDrawerPackages(pkgs, { hasAdditionalAccess: true, includeAdditional: false });
  assert.deepEqual(memberFlagOff.map((p) => p._id), ["tradie-pack", "vip-pack"], "member + flag off sees public packs");

  // Member + flag on → Additional packs (parity with control MembershipSection)
  const memberFlagOn = selectOneTimeDrawerPackages(pkgs, { hasAdditionalAccess: true, includeAdditional: true });
  assert.deepEqual(memberFlagOn.map((p) => p._id), ["additional-tradie-pack", "additional-vip-pack"], "member + flag on sees Additional packs");

  // Non-member + flag on → still public ladder (never show non-members locked Additional packs)
  const guestFlagOn = selectOneTimeDrawerPackages(pkgs, { hasAdditionalAccess: false, includeAdditional: true });
  assert.deepEqual(guestFlagOn.map((p) => p._id), ["tradie-pack", "vip-pack"], "non-member + flag on sees public packs");

  console.log("select-one-time-drawer-packages: all assertions passed");
}

run();
