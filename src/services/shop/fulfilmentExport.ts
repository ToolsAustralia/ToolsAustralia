import mongoose from "mongoose";
import Order, { type IOrder } from "@/models/Order";
import Product from "@/models/Product";

/**
 * Manual fulfilment export — paid shop orders, as a CSV for the print provider's
 * bulk upload screen.
 *
 * WHY THIS EXISTS RATHER THAN AN API CALL. The provider's documented GraphQL API is
 * enterprise-gated and unreachable on our account: our key authenticates (a bogus one
 * 403s, ours does not) but every path returns `404 Cannot POST /graphql`, and their
 * own portal does not use it — see the print-provider-fulfilment spec. Their portal
 * does have a working CSV upload, so this is the path that exists today. The service
 * boundary is deliberately the same one an API adapter would sit behind, so swapping
 * later changes this file, not its callers.
 *
 * COLUMN NAMES DO NOT NEED TO MATCH THEIRS. Their upload screen has a Field Mapping
 * step (Product ID -> Select Field, and so on), so the admin maps our headers to
 * their fields once and the mapping is remembered per upload. That means the right
 * design here is *explicit, unambiguous* headers rather than guesses at their
 * template's exact spelling.
 *
 * ONE ROW PER ITEM. Their Product ID field identifies a single garment, so a
 * three-item order is three rows carrying the same order number and address. That is
 * how their template is structured; it is not a flattening mistake.
 */

/** A single CSV row — one garment to print. */
export interface FulfilmentRow {
  orderNumber: string;
  /** The provider's blank identifier. Empty means the variant has no GTIN yet. */
  productId: string;
  sku: string;
  productName: string;
  size: string;
  colour: string;
  quantity: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  deliveryInstructions: string;
}

export interface FulfilmentExport {
  rows: FulfilmentRow[];
  /** Orders represented in `rows` — what "mark as submitted" would act on. */
  orderIds: string[];
  /**
   * Lines whose variant has no GTIN. These are STILL exported, because withholding
   * a paid order silently is worse than exporting a row the admin must complete —
   * but they are surfaced so the gap is visible before upload rather than after a
   * rejected file.
   */
  missingProductId: { orderNumber: string; sku: string; productName: string }[];
}

/** Orders that are paid and not yet handed to the printer. */
function pendingFilter() {
  return {
    // "processing" is what markPaid sets. pending = unpaid, and anything further
    // along has already been sent.
    status: "processing",
    submittedAt: { $exists: false },
    "products.0": { $exists: true },
  };
}

export async function countPendingFulfilment(): Promise<number> {
  return Order.countDocuments(pendingFilter());
}

/**
 * Build the export. Read-only on purpose — it does NOT mark anything as submitted.
 *
 * A download that fails or is cancelled must not hide those orders from the next
 * export; marking is a separate, explicit step the admin takes after the upload has
 * actually gone through. The cost of that split is a possible double upload if the
 * admin forgets, which is visible and fixable; the cost of the alternative is a paid
 * order that silently never reaches the printer.
 */
export async function buildFulfilmentExport(): Promise<FulfilmentExport> {
  const orders = (await Order.find(pendingFilter())
    .sort({ createdAt: 1 })
    .lean()) as unknown as IOrder[];

  // One lookup for every product referenced, so variant GTINs cost a single query
  // rather than one per line.
  const productIds = [...new Set(orders.flatMap((o) => o.products.map((p) => String(p.product))))];
  const products = await Product.find({ _id: { $in: productIds } })
    .select("_id name variants")
    .lean<{ _id: mongoose.Types.ObjectId; name: string; variants?: { sku: string; size?: string; colour?: string; gtin?: string }[] }[]>();

  const byId = new Map(products.map((p) => [String(p._id), p]));

  const rows: FulfilmentRow[] = [];
  const missingProductId: FulfilmentExport["missingProductId"] = [];

  for (const order of orders) {
    const a = order.shippingAddress ?? {};
    for (const line of order.products) {
      const product = byId.get(String(line.product));
      const variant = product?.variants?.find((v) => v.sku === line.sku);
      const productId = variant?.gtin?.trim() ?? "";
      const productName = line.name ?? product?.name ?? "";

      if (!productId) {
        missingProductId.push({ orderNumber: order.orderNumber, sku: line.sku ?? "", productName });
      }

      rows.push({
        orderNumber: order.orderNumber,
        productId,
        sku: line.sku ?? "",
        productName,
        size: variant?.size ?? "",
        colour: variant?.colour ?? "",
        quantity: line.quantity,
        firstName: a.firstName ?? "",
        lastName: a.lastName ?? "",
        email: a.email ?? "",
        phone: a.phone ?? "",
        addressLine1: a.addressLine1 ?? "",
        addressLine2: a.addressLine2 ?? "",
        city: a.city ?? "",
        state: a.state ?? "",
        postalCode: a.postalCode ?? "",
        country: a.country ?? "Australia",
        deliveryInstructions: a.deliveryInstructions ?? "",
      });
    }
  }

  return { rows, orderIds: orders.map((o) => String(o._id)), missingProductId };
}

const HEADERS: { key: keyof FulfilmentRow; label: string }[] = [
  { key: "orderNumber", label: "order_number" },
  { key: "productId", label: "product_id" },
  { key: "sku", label: "sku" },
  { key: "productName", label: "product_name" },
  { key: "size", label: "size" },
  { key: "colour", label: "colour" },
  { key: "quantity", label: "quantity" },
  { key: "firstName", label: "first_name" },
  { key: "lastName", label: "last_name" },
  { key: "email", label: "email" },
  { key: "phone", label: "phone" },
  { key: "addressLine1", label: "address_line_1" },
  { key: "addressLine2", label: "address_line_2" },
  { key: "city", label: "city" },
  { key: "state", label: "state" },
  { key: "postalCode", label: "postcode" },
  { key: "country", label: "country" },
  { key: "deliveryInstructions", label: "delivery_instructions" },
];

/**
 * RFC 4180 quoting. Every field is quoted rather than only the ones that need it:
 * an Australian address routinely contains a comma, and a delivery instruction can
 * contain a newline or a quote. Selective quoting is where CSV exports break, and a
 * malformed row here means a garment shipped to the wrong place.
 */
function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function toCsv(rows: FulfilmentRow[]): string {
  const head = HEADERS.map((h) => csvCell(h.label)).join(",");
  const body = rows.map((r) => HEADERS.map((h) => csvCell(r[h.key])).join(","));
  // CRLF per RFC 4180 — Excel is the likely intermediate here and is happiest with it.
  return [head, ...body].join("\r\n") + "\r\n";
}

/**
 * Record that these orders were handed to the printer.
 *
 * `submittedAt` is the guard against printing a garment twice: the export filter
 * excludes anything already stamped, so a second upload of the same file cannot be
 * produced from this screen. Idempotent — re-marking an already-marked order is a
 * no-op rather than an error, because the admin may click twice.
 */
export async function markSubmitted(orderIds: string[]): Promise<number> {
  const valid = orderIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (valid.length === 0) return 0;

  const res = await Order.updateMany(
    { _id: { $in: valid }, submittedAt: { $exists: false } },
    { $set: { submittedAt: new Date(), printProviderStatus: "submitted_via_csv" } }
  );
  return res.modifiedCount;
}
