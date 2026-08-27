import { create } from "zustand";

/**
 * The colourway the customer is looking at, shared between the two halves of the
 * product page.
 *
 * The gallery and the picker sit in different columns of a SERVER component, so
 * they cannot pass props to each other and there is no common client parent to
 * hold the state. This is the smallest thing that joins them, and it is why the
 * store exists rather than a context provider wrapping the whole route.
 *
 * `productId` is stored alongside so a client-side navigation to another garment
 * cannot leave the previous product's colour selected — the gallery checks it
 * matches before honouring the selection.
 */
interface ProductColourState {
  productId: string | null;
  colour: string | null;
  select: (productId: string, colour: string | null) => void;
}

export const useProductColourStore = create<ProductColourState>((set) => ({
  productId: null,
  colour: null,
  select: (productId, colour) => set({ productId, colour }),
}));

/** Read the colour only when it belongs to the product being rendered. */
export function useSelectedColour(productId: string): string | null {
  return useProductColourStore((s) => (s.productId === productId ? s.colour : null));
}
