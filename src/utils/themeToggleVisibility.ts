/**
 * Centralized rules for the floating (FAB) theme control.
 * Header theme toggle is used on /my-account and /admin instead.
 */
export function shouldShowFloatingThemeToggle(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname.startsWith("/admin")) return false;
  if (pathname.startsWith("/my-account")) return false;
  if (pathname.startsWith("/promotions")) return false;
  return true;
}
