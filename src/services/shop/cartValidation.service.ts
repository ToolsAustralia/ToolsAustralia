// src/services/shop/cartValidation.service.ts
import Product, { type IProduct } from "@/models/Product";

type LeanProduct = Pick<IProduct, "name" | "price" | "images" | "brand" | "stock" | "isActive">;

export interface CartValidationInput {
  items: { productId: string; quantity: number }[];
  userContext?: {
    isMember?: boolean; // extension point for member-only products
  };
}

export interface ValidatedItem {
  productId: string;
  productName: string;
  priceCents: number;
  quantity: number;
  imageUrl: string | null;
  brand: string | null;
}

export interface CartValidationError {
  productId: string;
  reason: "not_found" | "inactive" | "insufficient_stock";
  message: string;
}

export interface CartValidationResult {
  validatedItems: ValidatedItem[];
  errors: CartValidationError[];
}

export async function validateCart(input: CartValidationInput): Promise<CartValidationResult> {
  const validatedItems: ValidatedItem[] = [];
  const errors: CartValidationError[] = [];

  for (const item of input.items) {
    const product = (await Product.findById(item.productId).lean()) as LeanProduct | null;
    if (!product) {
      errors.push({
        productId: item.productId,
        reason: "not_found",
        message: "Product not found",
      });
      continue;
    }
    if (!product.isActive) {
      errors.push({
        productId: item.productId,
        reason: "inactive",
        message: `${product.name} is no longer available`,
      });
      continue;
    }
    if (product.stock < item.quantity) {
      errors.push({
        productId: item.productId,
        reason: "insufficient_stock",
        message: `Only ${product.stock} of ${product.name} available`,
      });
      continue;
    }

    validatedItems.push({
      productId: item.productId,
      productName: product.name,
      priceCents: Math.round(product.price * 100),
      quantity: item.quantity,
      imageUrl: product.images?.[0] ?? null,
      brand: product.brand ?? null,
    });
  }

  return { validatedItems, errors };
}
