import type { UserFilters } from "@/types/admin";

/**
 * Appends UserFilters to URLSearchParams for GET /api/admin/users and export.
 * Australian states are sent as repeated `state` query keys (e.g. state=NSW&state=VIC).
 */
export function appendUserFiltersToSearchParams(searchParams: URLSearchParams, filters: UserFilters): void {
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;

    if (key === "states") {
      if (!Array.isArray(value) || value.length === 0) continue;
      for (const code of value) {
        const c = String(code).trim();
        if (c) searchParams.append("state", c);
      }
      continue;
    }

    if (Array.isArray(value)) continue;

    searchParams.append(key, String(value));
  }
}
