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
 * boundary is the same one an API adapter would sit behind, so swapping later changes
 * this file, not its callers.
 *
 * Column names and order follow their own template
 * (`order-csv-template-app-shipping.csv`), so the upload screen's Field Mapping step
 * is a formality rather than a puzzle.
 *
 * ONE ROW PER ITEM. Their `product_id` identifies a single garment, so a three-item
 * order is three rows carrying the same order id and address. That is how their
 * template is structured; it is not a flattening mistake.
 */

/** A single CSV row — one garment to print. */
export interface FulfilmentRow {
  orderNumber: string;
  /** ISO date (YYYY-MM-DD) — their `order_date`. */
  orderDate: string;
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
  /** Their `decoration_type` — the print method. */
  decorationType: string;
  // Artwork: one image + placement-label pair per position, matching their template's
  // column pairs. Only `type: "printing"` artwork is exported — a "mockup" is a
  // customer-facing render, and sending one to the printer prints the mockup.
  frontImage: string;
  frontPlacement: string;
  backImage: string;
  backPlacement: string;
  leftChestImage: string;
  leftChestPlacement: string;
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
  /** Lines whose product has no printable artwork. Same treatment, same reasoning. */
  missingArtwork: { orderNumber: string; sku: string; productName: string }[];
}

/**
 * Our placement ids are the provider's own ("1" Front, "2" Back, "3" Left Chest —
 * see `Product.printArtwork`). Their CSV expects a named column pair per position
 * instead, so this maps id → (column stem, the human label they display).
 */
const PLACEMENTS: Record<string, { key: "front" | "back" | "leftChest"; label: string }> = {
  "1": { key: "front", label: "Front" },
  "2": { key: "back", label: "Back" },
  "3": { key: "leftChest", label: "Left Chest" },
};

/**
 * The statuses an order may be printed from, listed rather than left implicit.
 *
 * "processing" is what markPaid sets and is the only printable status today —
 * "pending" is unpaid, "shipped"/"delivered"/"completed" are already out the door,
 * and "cancelled" is refunded. Relying on that one equality to exclude the rest is
 * what makes this dangerous to leave implicit: `cancelled` is written by
 * finalizeShopOrder AFTER it has already refunded the buyer for stock lost after
 * payment, so a cancelled order reaching the printer means paying the print provider
 * and the postage for a garment nobody paid for, and posting it to a customer who has
 * their money back. Once the CSV is uploaded none of that is recoverable.
 */
const PRINTABLE_STATUSES: IOrder["status"][] = ["processing"];

/** Orders that are paid and not yet handed to the printer. */
function pendingFilter() {
  return {
    status: { $in: PRINTABLE_STATUSES },
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

  // One lookup for every product referenced, so variant GTINs and artwork cost a
  // single query rather than one per line.
  const productIds = [...new Set(orders.flatMap((o) => o.products.map((p) => String(p.product))))];
  const products = await Product.find({ _id: { $in: productIds } })
    .select("_id name variants printArtwork")
    .lean<
      {
        _id: mongoose.Types.ObjectId;
        name: string;
        variants?: { sku: string; size?: string; colour?: string; gtin?: string }[];
        printArtwork?: { url: string; placement: string; type: "printing" | "mockup" }[];
      }[]
    >();

  const byId = new Map(products.map((p) => [String(p._id), p]));

  const rows: FulfilmentRow[] = [];
  const missingProductId: FulfilmentExport["missingProductId"] = [];
  const missingArtwork: FulfilmentExport["missingArtwork"] = [];

  for (const order of orders) {
    const a = order.shippingAddress ?? {};
    const created = order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt);

    for (const line of order.products) {
      const product = byId.get(String(line.product));
      const variant = product?.variants?.find((v) => v.sku === line.sku);
      const productId = variant?.gtin?.trim() ?? "";
      const productName = line.name ?? product?.name ?? "";

      if (!productId) {
        missingProductId.push({ orderNumber: order.orderNumber, sku: line.sku ?? "", productName });
      }

      // "mockup" artwork is a customer-facing render; sending it to the printer would
      // print the mockup. Only "printing" assets go on the order.
      const printable = (product?.printArtwork ?? []).filter((art) => art.type === "printing");
      const art: Partial<Record<string, string>> = {};
      for (const asset of printable) {
        const slot = PLACEMENTS[asset.placement];
        if (!slot) continue; // an unknown placement id is theirs to define, not ours to guess
        art[slot.key + "Image"] = asset.url;
        art[slot.key + "Placement"] = slot.label;
      }
      if (Object.keys(art).length === 0) {
        missingArtwork.push({ orderNumber: order.orderNumber, sku: line.sku ?? "", productName });
      }

      rows.push({
        orderNumber: order.orderNumber,
        orderDate: created.toISOString().slice(0, 10),
        productId,
        sku: line.sku ?? "",
        productName,
        // Snapshot first: it is what the customer bought. The catalogue lookup is
        // only a fallback for orders placed before these fields existed, and it
        // returns nothing if the variant has since been removed.
        size: line.size ?? variant?.size ?? "",
        colour: line.colour ?? variant?.colour ?? "",
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
        // Direct-to-garment: the only method the apparel range uses. A per-product
        // field would be speculative until a second method exists.
        decorationType: "DTG",
        frontImage: art.frontImage ?? "",
        frontPlacement: art.frontPlacement ?? "",
        backImage: art.backImage ?? "",
        backPlacement: art.backPlacement ?? "",
        leftChestImage: art.leftChestImage ?? "",
        leftChestPlacement: art.leftChestPlacement ?? "",
      });
    }
  }

  return {
    rows,
    orderIds: orders.map((o) => String(o._id)),
    missingProductId,
    missingArtwork,
  };
}

/**
 * Column order and naming follow the provider's own template
 * (`order-csv-template-app-shipping.csv`). Their set is:
 *
 *   order_id, order_date, first_name, last_name, address_1, address_2, city, state,
 *   zip, sku, product_id, quantity, decoration_type,
 *   left_chest_image, left_chest_placement, back_image, back_placement
 *
 * Note `zip` not `postcode`, and `address_1` not `address_line_1` — matched exactly so
 * the Field Mapping step is a formality. `front_*` is added because our Product model
 * supports a front placement their template happens not to list.
 *
 * The trailing extras (product_name, size, colour, email, phone, country,
 * delivery_instructions) are NOT in their template and are ignored unless mapped. They
 * are kept because this file is also what a human reads when checking an order before
 * upload, and a row of bare ids is unreadable.
 */
const HEADERS: { key: keyof FulfilmentRow; label: string }[] = [
  { key: "orderNumber", label: "order_id" },
  { key: "orderDate", label: "order_date" },
  { key: "firstName", label: "first_name" },
  { key: "lastName", label: "last_name" },
  { key: "addressLine1", label: "address_1" },
  { key: "addressLine2", label: "address_2" },
  { key: "city", label: "city" },
  { key: "state", label: "state" },
  { key: "postalCode", label: "zip" },
  { key: "sku", label: "sku" },
  { key: "productId", label: "product_id" },
  { key: "quantity", label: "quantity" },
  { key: "decorationType", label: "decoration_type" },
  { key: "leftChestImage", label: "left_chest_image" },
  { key: "leftChestPlacement", label: "left_chest_placement" },
  { key: "backImage", label: "back_image" },
  { key: "backPlacement", label: "back_placement" },
  { key: "frontImage", label: "front_image" },
  { key: "frontPlacement", label: "front_placement" },
  { key: "productName", label: "product_name" },
  { key: "size", label: "size" },
  { key: "colour", label: "colour" },
  { key: "email", label: "email" },
  { key: "phone", label: "phone" },
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
