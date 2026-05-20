export const AREAS = [
  "overview",
  "users",
  "promos",
  "facebookAds",
  "pageAnalytics",
  "promoAnalytics",
  "submissions",
  "miniDraws",
  "majorDraw",
  "drawResults",
  "upcomingDraws",
  "affiliates",
  "errorReports",
  "abTesting",
  "settings",
] as const;

export type Area = (typeof AREAS)[number];
export type Action = "view" | "edit";
export type Permission = `${Area}.${Action}`;

export const PERMISSIONS: Permission[] = AREAS.flatMap((a) => [
  `${a}.view` as Permission,
  `${a}.edit` as Permission,
]);

export const ALL_PERMISSIONS: ReadonlySet<Permission> = new Set(PERMISSIONS);

export function isValidPermission(p: string): p is Permission {
  return ALL_PERMISSIONS.has(p as Permission);
}

export function permissionFor(area: Area): { view: Permission; edit: Permission } {
  return { view: `${area}.view`, edit: `${area}.edit` };
}
