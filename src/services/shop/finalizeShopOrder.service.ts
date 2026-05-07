// src/services/shop/finalizeShopOrder.service.ts
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import Product from "@/models/Product";
import Order from "@/models/Order";
import User from "@/models/User";
import { BUSINESS } from "@/config/business";
import { executeBackgroundJob } from "@/utils/webhook/background-jobs";
import emailService from "@/lib/email/email-service";
import { trackKlaviyoShopPlacedOrder, trackKlaviyoShopOrderedProducts } from "@/lib/klaviyo";
import { sendCapiShopPurchase } from "@/lib/facebook";

export interface FinalizeShopOrderInput {
  paymentIntent: Stripe.PaymentIntent;
}

export interface FinalizeShopOrderResult {
  status: "order_written" | "refunded_stock_lost" | "skipped_not_shop";
  orderNumber?: string;
}

interface SlimMetadataItem {
  productId: string;
  quantity: number;
  priceCents: number;
}

interface ParsedItem {
  productId: string;
  productName: string;
  priceCents: number;
  quantity: number;
  imageUrl: string | null;
  brand: string | null;
}

interface ParsedAddress {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  deliveryInstructions?: string;
}

function parseSlimItems(metadata: Stripe.Metadata): SlimMetadataItem[] {
  return JSON.parse(metadata.items ?? "[]");
}
function parseAddress(metadata: Stripe.Metadata): ParsedAddress {
  return JSON.parse(metadata.shippingAddress ?? "{}");
}

async function generateOrderNumber(): Promise<string> {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SHOP-${ymd}-${rand}`;
}

export async function finalizeShopOrder(
  input: FinalizeShopOrderInput,
): Promise<FinalizeShopOrderResult> {
  const pi = input.paymentIntent;
  if (pi.metadata?.type !== "shop") {
    return { status: "skipped_not_shop" };
  }

  const slimItems = parseSlimItems(pi.metadata);
  const address = parseAddress(pi.metadata);

  // Atomic stock decrement. Capture each product doc so we can rehydrate
  // productName/imageUrl/brand (no longer carried in Stripe metadata).
  const decremented: { productId: string; quantity: number }[] = [];
  const items: ParsedItem[] = [];
  let stockLost = false;
  for (const slim of slimItems) {
    const result = await Product.findOneAndUpdate(
      { _id: slim.productId, stock: { $gte: slim.quantity } },
      { $inc: { stock: -slim.quantity } },
      { new: true },
    );
    if (!result) {
      stockLost = true;
      break;
    }
    decremented.push({ productId: slim.productId, quantity: slim.quantity });
    items.push({
      productId: slim.productId,
      productName: result.name,
      priceCents: slim.priceCents,
      quantity: slim.quantity,
      imageUrl: result.images?.[0] ?? null,
      brand: result.brand ?? null,
    });
  }

  if (stockLost) {
    // Revert successful decrements (best-effort)
    for (const d of decremented) {
      await Product.updateOne({ _id: d.productId }, { $inc: { stock: d.quantity } }).catch((err) => {
        console.error("[shop] revert decrement failed", { productId: d.productId, err });
      });
    }
    // Refund the customer
    await stripe.refunds.create({
      payment_intent: pi.id,
      reason: "requested_by_customer",
      metadata: { reason: "shop_stock_lost_after_payment" },
    });

    // Background: send sold-out apology email
    executeBackgroundJob("Shop stock-loss refund email", async () => {
      const userId = pi.metadata.userId;
      let recipientEmail: string | undefined;
      let firstName: string | undefined;
      if (userId) {
        const user = await User.findById(userId).lean<{ email?: string; firstName?: string }>();
        recipientEmail = user?.email;
        firstName = user?.firstName;
      } else {
        recipientEmail = pi.metadata.guestEmail;
        firstName = pi.metadata.guestFirstName;
      }
      if (!recipientEmail) return;
      await emailService.sendShopStockRefund(recipientEmail, {
        firstName: firstName || "there",
        amountAud: (Number(pi.metadata.totalCents) / 100).toFixed(2),
      });
    });

    return { status: "refunded_stock_lost" };
  }

  const orderNumber = await generateOrderNumber();
  const userId = pi.metadata.userId || undefined;

  const order = await Order.create({
    orderNumber,
    user: userId || undefined,
    guestEmail: !userId ? pi.metadata.guestEmail : undefined,
    guestFirstName: !userId ? pi.metadata.guestFirstName : undefined,
    guestLastName: !userId ? pi.metadata.guestLastName : undefined,
    products: items.map((i) => ({
      product: i.productId,
      quantity: i.quantity,
      price: i.priceCents / 100,
    })),
    tickets: [],
    appliedDiscounts: [],
    totalAmount: Number(pi.metadata.totalCents) / 100,
    gstAmount: Number(pi.metadata.gstCents) / 100,
    shippingCost: Number(pi.metadata.shippingCents) / 100,
    status: "processing",
    shippingAddress: address,
    paymentIntentId: pi.id,
  });

  // Clear logged-in user's cart
  if (userId) {
    await User.updateOne({ _id: userId }, { $set: { cart: [] } }).catch((err) =>
      console.error("[shop] clear cart failed", err),
    );
  }

  // Background: SendGrid AU tax invoice email
  executeBackgroundJob("Shop order confirmation email", async () => {
    const recipientEmail = userId
      ? (await User.findById(userId).lean<{ email?: string }>())?.email
      : pi.metadata.guestEmail;
    if (!recipientEmail) return;
    await emailService.sendShopOrderConfirmation(recipientEmail, {
      orderNumber: order.orderNumber,
      orderDate: order.createdAt.toISOString().slice(0, 10),
      items: items.map((i) => ({
        name: i.productName,
        quantity: i.quantity,
        priceCents: i.priceCents,
        lineTotalCents: i.priceCents * i.quantity,
      })),
      subtotalCents: Number(pi.metadata.subtotalCents),
      shippingCents: Number(pi.metadata.shippingCents),
      gstCents: Number(pi.metadata.gstCents),
      totalCents: Number(pi.metadata.totalCents),
      shippingAddress: address,
      business: {
        legalName: BUSINESS.legalName,
        abn: BUSINESS.abn,
        addressLine: `${BUSINESS.address.line1}, ${BUSINESS.address.suburb} ${BUSINESS.address.state} ${BUSINESS.address.postcode}`,
      },
    });
    await Order.updateOne({ _id: order._id }, { $set: { invoiceSentAt: new Date() } });
  });

  // Background: Klaviyo Placed Order + Ordered Product (Shopify-shape schema)
  executeBackgroundJob("Shop Klaviyo Placed Order + Ordered Products", async () => {
    let recipientEmail: string | undefined;
    let firstName: string | undefined;
    let lastName: string | undefined;
    if (userId) {
      const user = await User.findById(userId).lean<{ email?: string; firstName?: string; lastName?: string }>();
      recipientEmail = user?.email;
      firstName = user?.firstName;
      lastName = user?.lastName;
    } else {
      recipientEmail = pi.metadata.guestEmail;
      firstName = pi.metadata.guestFirstName;
      lastName = pi.metadata.guestLastName;
    }
    if (!recipientEmail) return;
    const customer = { email: recipientEmail, firstName, lastName };
    await trackKlaviyoShopPlacedOrder({
      customer,
      orderNumber: order.orderNumber,
      items,
      totalCents: Number(pi.metadata.totalCents),
      shippingCents: Number(pi.metadata.shippingCents),
      gstCents: Number(pi.metadata.gstCents),
    });
    await trackKlaviyoShopOrderedProducts({
      customer,
      orderNumber: order.orderNumber,
      items,
    });
  });

  // Background: Meta CAPI Purchase (deduped with client Pixel via event_id = paymentIntentId)
  executeBackgroundJob("Shop Meta CAPI Purchase", async () => {
    const recipientEmail = userId
      ? (await User.findById(userId).lean<{ email?: string }>())?.email
      : pi.metadata.guestEmail;
    if (!recipientEmail) return;
    await sendCapiShopPurchase({
      paymentIntentId: pi.id,
      email: recipientEmail,
      totalCents: Number(pi.metadata.totalCents),
      items,
      capi: {
        ip: pi.metadata.capi_client_ip,
        userAgent: pi.metadata.capi_user_agent,
        fbc: pi.metadata.capi_fbc,
        fbp: pi.metadata.capi_fbp,
        eventSourceUrl: pi.metadata.capi_event_source_url,
      },
    });
  });

  return { status: "order_written", orderNumber: order.orderNumber };
}
