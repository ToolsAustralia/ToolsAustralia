/**
 * Permission catalog — the single source of truth for what permissions exist.
 *
 * Each area declares its own action list. Areas with destructive or financial
 * APIs get extra actions (`charge`, `cancelSubscription`, `refund`, `delete`,
 * `selectWinner`, `processPayout`, `end`) so roles can grant edit access
 * without granting the irreversible / money-moving operations.
 *
 * Adding a new permission: add an action to the relevant area's tuple here,
 * then gate the matching route handler with requirePermission(). The admin UI
 * picks up the new action automatically. The seeded Admin role (re-)gains
 * every permission via scripts/migrate-seed-staff-roles.ts; existing custom
 * roles do NOT auto-gain new permissions.
 */
export const AREA_ACTIONS = {
  overview: ["view", "edit"],
  // `viewDetail` splits the PII depth of the detail modal away from the list. `view` grants the
  // roster (name, status, package); `viewDetail` grants the modal — email, mobile, address,
  // payment history, activity. A support role can triage the list without reading personal data.
  // Adding a permission does NOT auto-grant it to existing custom roles, so the migration
  // backfills `viewDetail` onto every role that already had `view` (see
  // scripts/migrate-seed-staff-roles.ts) — otherwise this ships as a silent access removal.
  users: ["view", "viewDetail", "edit", "export", "charge", "cancelSubscription", "refund", "delete"],
  promos: ["view", "edit", "end", "delete"],
  facebookAds: ["view", "edit"],
  pageAnalytics: ["view"],
  submissions: ["view", "edit", "delete"],
  // `viewParticipants` splits the ENTRANT PII away from the draw list, the same way
  // `users.viewDetail` splits it away from the customer roster. `view` grants the draw cards
  // (name, prize, capacity, status); `viewParticipants` grants entrant names, emails, mobiles
  // and states — both the in-app list AND the CSV/Excel export, which dump identical data and
  // must therefore be gated identically. As with `users.viewDetail`, this is NOT auto-granted
  // to existing custom roles, so a migration backfills it onto every role that already had
  // `view` (scripts/migrations/2026-08-13-backfill-mini-draws-view-participants.ts) — without
  // that, the deploy silently revokes export access that roles already had.
  miniDraws: ["view", "viewParticipants", "edit", "selectWinner", "delete"],
  majorDraw: ["view", "edit", "selectWinner"],
  drawResults: ["view"],
  upcomingDraws: ["view"],
  affiliates: ["view", "edit", "processPayout", "delete"],
  errorReports: ["view", "edit", "delete"],
  abTesting: ["view", "edit", "selectWinner", "delete"],
  rewards: ["view", "edit", "delete"],
  // Shop catalog + orders. `delete` is split out because the product API carries
  // bulk-destruction routes (delete-all, delete-by-*) that wipe the catalog in one
  // call — an operator who can edit a product should not implicitly hold those.
  shop: ["view", "edit", "delete"],
  // The Receipts ledger — every payment received, joined to the customer who paid and to
  // Stripe. Its own area rather than a reuse of `settings.view` (which gates the other
  // Billing tabs) because this one surface is the complete revenue picture attached to
  // customer identity; the repo already carves those out (`users.viewDetail`,
  // `miniDraws.viewParticipants`). `export` is split from `view` for the same reason
  // `users.export` is: a CSV of revenue + names + emails leaving the building is a
  // different risk from reading the table. As with those splits, adding these actions does
  // NOT auto-grant them to existing custom roles, so a migration backfills `receipts.view`
  // onto every role that already had `settings.view`
  // (scripts/migrations/2026-08-17-backfill-receipts-view.ts) — without it the deploy reads
  // to staff as a silent access removal.
  receipts: ["view", "export"],
  settings: ["view", "edit", "delete"],
  audit: ["view"],
} as const satisfies Record<string, readonly string[]>;

export const AREAS = Object.keys(AREA_ACTIONS) as Array<keyof typeof AREA_ACTIONS>;
export type Area = (typeof AREAS)[number];
export type Action<A extends Area = Area> = (typeof AREA_ACTIONS)[A][number];
export type Permission = {
  [A in Area]: `${A}.${(typeof AREA_ACTIONS)[A][number]}`;
}[Area];

export const PERMISSIONS: Permission[] = AREAS.flatMap((a) =>
  AREA_ACTIONS[a].map((act) => `${a}.${act}` as Permission)
);

export const ALL_PERMISSIONS: ReadonlySet<Permission> = new Set(PERMISSIONS);

export function isValidPermission(p: string): p is Permission {
  return ALL_PERMISSIONS.has(p as Permission);
}

export function actionsFor<A extends Area>(area: A): readonly (typeof AREA_ACTIONS)[A][number][] {
  return AREA_ACTIONS[area];
}

export function permissionFor<A extends Area, T extends (typeof AREA_ACTIONS)[A][number]>(
  area: A,
  action: T
): `${A}.${T}` {
  return `${area}.${action}`;
}
