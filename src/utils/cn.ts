import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Compose Tailwind classNames safely.
 *
 * - `clsx` flattens conditional inputs (strings, objects, arrays).
 * - `twMerge` resolves conflicting utilities so the LAST class wins consistently
 *   (e.g. `cn("p-2", "p-4")` → `"p-4"`, never both).
 *
 * Use this everywhere instead of template-literal className concatenation.
 *
 * @example
 *   <button className={cn("rounded p-2", isPrimary && "bg-red-600", className)} />
 */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
