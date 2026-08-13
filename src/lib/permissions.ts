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
  miniDraws: ["view", "edit", "selectWinner", "delete"],
  majorDraw: ["view", "edit", "selectWinner"],
  drawResults: ["view"],
  upcomingDraws: ["view"],
  affiliates: ["view", "edit", "processPayout", "delete"],
  errorReports: ["view", "edit", "delete"],
  abTesting: ["view", "edit", "selectWinner", "delete"],
  rewards: ["view", "edit", "delete"],
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
