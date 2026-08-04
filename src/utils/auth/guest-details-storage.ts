/**
 * Guest "Your Details" persistence — the step-1 registration fields, kept alive across page
 * navigations for the length of a browser tab session.
 *
 * ## Why this exists
 * `MembershipModal` holds its form in component state, and every page mounts its own copy of the
 * modal (via `MembershipSection`). A guest who typed their name on `/` and then opened the modal
 * on `/promotions/[slug]` or `/membership` met an empty form and had to type it all again — the
 * single most avoidable drop-off in the join flow.
 *
 * ## Storage choice — sessionStorage, not localStorage
 * These are real PII (name, email, mobile). sessionStorage survives navigation and reload but dies
 * with the tab, so a shared device does not keep a stranger's contact details around. localStorage
 * would outlive the visit for no extra conversion benefit.
 *
 * ## Never persisted
 * The modal's `formData` also carries `cardNumber` / `expiryDate` / `cvv`. This module takes an
 * explicit four-field allowlist rather than the whole object, so card data can never be written to
 * storage by accident if that shape changes.
 *
 * Cleared on successful registration (the server holds the details from then on) and on sign-out —
 * the key is registered in `USER_SESSION_KEYS` in `total-sign-out.ts`.
 */

/** sessionStorage key. Registered in total-sign-out.ts — keep the two in sync. */
export const GUEST_DETAILS_STORAGE_KEY = "ta.guestDetails";

export interface GuestDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

const EMPTY: GuestDetails = { firstName: "", lastName: "", email: "", phone: "" };

/** The only fields that may ever reach storage. */
const PERSISTED_FIELDS = ["firstName", "lastName", "email", "phone"] as const;

export type GuestDetailField = (typeof PERSISTED_FIELDS)[number];

/** True when `field` is one of the four details fields (i.e. safe to persist). */
export function isGuestDetailField(field: string): field is GuestDetailField {
  return (PERSISTED_FIELDS as readonly string[]).includes(field);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Read the stored details. Returns `null` when nothing is stored, storage is unavailable
 * (Safari private mode, SSR), or the payload is unusable — callers then just keep their own state.
 */
export function readGuestDetails(): GuestDetails | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(GUEST_DETAILS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Record<GuestDetailField, unknown>>;
    if (!parsed || typeof parsed !== "object") return null;
    const details: GuestDetails = {
      firstName: asString(parsed.firstName),
      lastName: asString(parsed.lastName),
      email: asString(parsed.email),
      phone: asString(parsed.phone),
    };
    // All-blank is the same as nothing stored — don't hand callers an empty object to merge.
    return PERSISTED_FIELDS.some((f) => details[f].trim().length > 0) ? details : null;
  } catch {
    return null;
  }
}

/**
 * Merge `patch` into the stored details. Partial by design: the modal writes one field per
 * keystroke, and a caller must never have to read-modify-write to update a single input.
 */
export function persistGuestDetails(patch: Partial<GuestDetails>): void {
  if (typeof window === "undefined") return;
  try {
    const current = readGuestDetails() ?? EMPTY;
    const next: GuestDetails = { ...current };
    for (const field of PERSISTED_FIELDS) {
      const value = patch[field];
      if (typeof value === "string") next[field] = value;
    }
    if (!PERSISTED_FIELDS.some((f) => next[f].trim().length > 0)) {
      window.sessionStorage.removeItem(GUEST_DETAILS_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(GUEST_DETAILS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore — a full/disabled storage must never break typing in the form */
  }
}

/** Drop the stored details (registration completed, or sign-out). */
export function clearGuestDetails(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(GUEST_DETAILS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
