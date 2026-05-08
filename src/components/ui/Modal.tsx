/**
 * Modal — atomic-design alias for ModalContainer.
 *
 * The actual implementation lives at @/components/modals/ui/ModalContainer.
 * This re-export provides the canonical atomic-design import path
 * `@/components/ui/Modal` for new code. Existing call sites can migrate
 * opportunistically.
 *
 * For a custom z-index outside the Z_INDEX scale (e.g. micro-stacks above
 * a parent modal), pass `zIndex={N}` — added in Plan 2 Task 1.
 */
export { default } from "@/components/modals/ui/ModalContainer";
