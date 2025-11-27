import type { OriginalPurchaseContext } from "@/types/upsell";

const STORAGE_KEY = "originalPurchaseContext";

export function persistOriginalPurchaseContext(context: OriginalPurchaseContext | null): void {
  if (typeof window === "undefined") return;

  if (!context) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
  } catch (error) {
    console.error("Failed to persist original purchase context:", error);
  }
}

export function loadOriginalPurchaseContext(): OriginalPurchaseContext | null {
  if (typeof window === "undefined") return null;

  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as OriginalPurchaseContext;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearOriginalPurchaseContext(): void {
  persistOriginalPurchaseContext(null);
}

