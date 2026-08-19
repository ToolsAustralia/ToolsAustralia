/**
 * The print provider's HTTP API — the ONLY module that knows the vendor exists.
 *
 * Everything above this speaks in `PrintProviderProduct`, so swapping supplier
 * means rewriting this file and nothing else (CLAUDE.md: vendor names stay in
 * config and an adapter, never in domain logic).
 *
 * Three things about this API are not guessable and cost a day each to discover,
 * so they are written down here:
 *
 * 1. THE DEPLOYED API IS REST, NOT GRAPHQL. The published docs describe GraphQL
 *    at `/graphql`; that path returns Express's default 404. Auth runs BEFORE
 *    routing, which is how we know the key is fine: no key gives a JSON 403, a
 *    valid key gives the HTML 404.
 *
 * 2. THE COLLECTION ENDPOINTS RETURN EMPTY. `GET /products` answers
 *    `{"products":[]}` even though `GET /products/{id}` returns the record. Our
 *    shop record comes back `{"platformId":"0","synthetic":true}`, so the lists
 *    appear to be scoped to a connected sales channel and we are a custom
 *    storefront with none. `GET /design-library` is therefore the only way to
 *    enumerate — every product we can reach is linked to a design.
 *
 * 3. THE PRODUCT ID CONTAINS THE API KEY. Ids are `"00" + uid + platformProductId`
 *    and the uid IS the key until it is rotated. Generated mockup URLs likewise
 *    sit under `/users/{uid}/`. Neither may be sent to a browser, logged, or
 *    persisted — see `splitProductId`, and note every error here is masked.
 */

const BASE_URL = process.env.RIVERR_API_BASE_URL?.replace(/\/+$/, "") ?? "https://api.riverr.app";

/** Placement ids the provider uses. "1" Front is unused by our current designs. */
export const PLACEMENT = {
  front: "1",
  back: "2",
  leftChest: "3",
  /** Composite render showing front and back together. */
  both: "front_back_stagger",
} as const;

export interface PrintProviderVariant {
  sku: string;
  colour: string | null;
  size: string | null;
  price: number | null;
}

export interface PrintProviderColourway {
  name: string;
  hex: string | null;
  /** Provider-hosted mockup URLs, front-most first. NEVER expose these. */
  imageUrls: string[];
}

export interface PrintProviderProduct {
  /** Provider id with the uid prefix stripped — safe to persist. */
  platformProductId: string;
  blankProductId: string | null;
  name: string;
  description: string;
  price: number | null;
  variants: PrintProviderVariant[];
  colourways: PrintProviderColourway[];
  /** Colours the blank offers that no variant exists for yet. */
  uncreatedColours: { name: string; hex: string | null }[];
}

export class PrintProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "PrintProviderError";
  }
}

function apiKey(): string {
  const key = process.env.RIVERR_API_KEY?.trim();
  if (!key) throw new PrintProviderError("RIVERR_API_KEY is not set");
  return key;
}

/** Strip the key from anything we are about to log or throw. */
function scrub(text: string): string {
  const key = process.env.RIVERR_API_KEY?.trim();
  return key ? text.split(key).join("[uid]") : text;
}

/**
 * Provider product ids are opaque to us, and deliberately so.
 *
 * An earlier version rebuilt them as `"00" + apiKey + platformProductId`, which
 * worked only while the key doubled as the account uid. Rotating the key breaks
 * that assumption instantly, and the failure would be a silent 404 on every
 * product. So ids are never reconstructed: they are read from the listing, held
 * in memory for the length of one sync, and never written down. The stable
 * identifier we persist is `platformProductId`, which the payload states
 * outright — no string surgery, and nothing that changes when a key rotates.
 */
export interface PrintProviderProductRef {
  /** Opaque provider id. In-memory only — it may embed the account uid. */
  id: string;
  name: string;
}

async function get<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "x-uid": apiKey(), accept: "application/json" },
      // Their product payloads run to hundreds of KB and take real time.
      signal: AbortSignal.timeout(120_000),
      cache: "no-store",
    });
  } catch (err) {
    throw new PrintProviderError(
      `print provider request failed: ${scrub(err instanceof Error ? err.message : String(err))}`
    );
  }
  if (!res.ok) {
    const body = scrub((await res.text().catch(() => "")).slice(0, 300));
    throw new PrintProviderError(`print provider ${res.status} on ${scrub(path)}: ${body}`, res.status);
  }
  return (await res.json()) as T;
}

interface DesignLibraryResponse {
  designs?: { linkedProducts?: { id?: string; name?: string }[] }[];
}

/**
 * Every product we can see, as `{ platformProductId, name }`.
 *
 * Sourced from the design library because the products collection is empty (see
 * note 2 above). A product created in the portal with no design attached is
 * invisible to us — that is a provider-side limitation, not a bug here.
 */
export async function listPrintProviderProducts(): Promise<PrintProviderProductRef[]> {
  const { designs = [] } = await get<DesignLibraryResponse>("/design-library");
  const seen = new Map<string, string>();
  for (const design of designs) {
    for (const linked of design.linkedProducts ?? []) {
      if (linked?.id) seen.set(linked.id, linked.name ?? "Untitled");
    }
  }
  return [...seen].map(([id, name]) => ({ id, name }));
}

interface ProductResponse {
  product?: {
    name?: string;
    price?: number;
    /** Stated by the payload, so we never have to derive it from the id. */
    platformProductId?: string;
    productDetails?: { description?: string };
    productMapping?: { blankProductIds?: string[] };
  };
  variants?: {
    sku?: string;
    price?: number;
    deleted?: boolean;
    properties?: { name?: string; value?: string }[];
  }[];
  colorImages?: { color?: string; placement?: string; url?: string }[];
}

interface BlankResponse {
  blankProductSettings?: {
    colorsWithImages?: Record<string, { colorCode?: string; colorName?: string }> | null;
  };
}

const normalise = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Front-most first: left chest is the hero shot, then back, then the composite. */
const VIEW_ORDER = [PLACEMENT.leftChest, PLACEMENT.front, PLACEMENT.back, PLACEMENT.both];

/**
 * @param providerId the opaque id from `listPrintProviderProducts`. Never persist it.
 */
export async function fetchPrintProviderProduct(providerId: string): Promise<PrintProviderProduct> {
  const payload = await get<ProductResponse>(`/products/${providerId}`);
  const product = payload.product ?? {};
  const blankProductId = product.productMapping?.blankProductIds?.[0] ?? null;
  const platformProductId = product.platformProductId?.trim();
  if (!platformProductId) {
    // Without a stable id we cannot upsert without risking a duplicate product
    // on every sync, so fail loudly rather than guessing one.
    throw new PrintProviderError("product payload carried no platformProductId");
  }

  const prop = (v: NonNullable<ProductResponse["variants"]>[number], name: string) =>
    v.properties?.find((p) => p.name === name)?.value ?? null;

  const variants: PrintProviderVariant[] = (payload.variants ?? [])
    .filter((v) => !v.deleted && v.sku)
    .map((v) => ({
      sku: String(v.sku),
      colour: prop(v, "Color"),
      size: prop(v, "Size"),
      price: typeof v.price === "number" ? v.price : null,
    }));

  // The blank's palette carries the hex values; the product payload does not.
  let palette: Record<string, { colorCode?: string }> = {};
  if (blankProductId) {
    try {
      const blank = await get<BlankResponse>(`/blank-products/${blankProductId}`);
      palette = blank.blankProductSettings?.colorsWithImages ?? {};
    } catch {
      // A missing palette costs us swatch colours, not the sync.
    }
  }
  const hexFor = (name: string): string | null => {
    const key = Object.keys(palette).find((k) => normalise(k) === normalise(name));
    return key ? (palette[key]?.colorCode ?? null) : null;
  };

  // Decorated mockups live on `colorImages`. The BLANK's own imagery is the
  // undecorated garment and must not be used — it has no logo on it.
  const shots = new Map<string, string>();
  for (const image of payload.colorImages ?? []) {
    if (image.url && image.color && image.placement) {
      shots.set(`${normalise(image.color)}|${image.placement}`, image.url);
    }
  }

  const colourNames = [...new Set(variants.map((v) => v.colour).filter((c): c is string => !!c))];
  const colourways: PrintProviderColourway[] = colourNames.map((name) => ({
    name,
    hex: hexFor(name),
    imageUrls: VIEW_ORDER.map((view) => shots.get(`${normalise(name)}|${view}`)).filter(
      (url): url is string => !!url
    ),
  }));

  const created = new Set(colourNames.map(normalise));
  const uncreatedColours = Object.keys(palette)
    .filter((k) => !created.has(normalise(k)))
    .map((k) => ({ name: k, hex: palette[k]?.colorCode ?? null }));

  return {
    platformProductId,
    blankProductId,
    name: product.name ?? "Untitled",
    description: (product.productDetails?.description ?? "").replace(/<[^>]+>/g, "").trim(),
    price: typeof product.price === "number" ? product.price : null,
    variants,
    colourways,
    uncreatedColours,
  };
}
