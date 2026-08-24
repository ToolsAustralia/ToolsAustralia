// src/services/admin/previewChargePastDueInvoices.ts
//
// Read-only preview of the upcoming bulk past-due charge run: pulls every open
// Stripe invoice with `charge_automatically`, joins to MongoDB users that are
// currently `past_due`, filters out ineligible rows, scopes per-customer to the
// invoice attached to the user's current subscription, and returns the same
// payload the admin route exposes (Norm projection subsets it via Zod).
//
// Extracted from `GET /api/admin/invoices/charge-past-due` route so the admin
// route and Norm projection call the same code and report identical numbers
// by construction. Framework-agnostic — no Request / NextResponse types.

import Stripe from "stripe";
import mongoose from "mongoose";
import { stripe } from "@/lib/stripe";
import User from "@/models/User";
import {
  getCustomerDefaultPaymentMethodFromInvoice,
  resolveInvoicePaymentMethodId,
  selectCurrentSubscriptionChargeable,
} from "@/server/admin/chargePastDueShared";

type PastDueUserLean = {
  _id: mongoose.Types.ObjectId;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subscription?: { status?: string | null };
};

export interface ChargePastDuePreviewRow {
  invoiceId: string;
  customerId: string;
  userId: string;
  userEmail: string;
  userName: string;
  /** Stripe currency-minor-unit (cents). */
  amount: number;
  /** ISO 4217, lowercase (e.g. "aud"). */
  currency: string;
}

export interface ChargePastDuePreviewFilterStats {
  wrongCollectionMethod: number;
  noAmountRemaining: number;
  noPaymentMethod: number;
  noCustomerId: number;
  userNotFound: number;
  notPastDue: number;
  duplicateOrStaleCycle: number;
}

export interface ChargePastDuePreviewDebug {
  totalCustomerIds: number;
  totalUsersFound: number;
  pastDueUsersFound: number;
}

export interface ChargePastDuePreview {
  /** Number of eligible rows after per-customer scoping. */
  eligibleCount: number;
  /** Total open invoices returned by Stripe before filtering. */
  totalInvoices: number;
  filterStats: ChargePastDuePreviewFilterStats;
  debug: ChargePastDuePreviewDebug;
  /** The eligible rows themselves — one per customer (current-subscription invoice). */
  users: ChargePastDuePreviewRow[];
}

/**
 * Compute the preview payload for the bulk past-due charge run. Read-only:
 * no Stripe charges, no Mongo writes. Pulls all `status=open, collection_method=
 * charge_automatically` invoices from Stripe (with customer expanded inline to
 * avoid the N+1), maps to past-due MongoDB users, runs the eligibility filters
 * the bulk POST path would, then collapses to one invoice per customer
 * (`selectCurrentSubscriptionChargeable`).
 */
export async function previewChargePastDueInvoices(): Promise<ChargePastDuePreview> {
  // WORKLIST ORDER — verified 2026-08-24, not inferred. `stripe.invoices.list` returns
  // NEWEST-FIRST (`created` descending), confirmed by probing the live API with this
  // exact filter combination, and `InvoiceListParams` has NO sort/order parameter, so
  // the order is not configurable server-side. The worklist therefore reaches the most
  // recently past-due members first.
  //
  // That is deliberately LEFT AS IS. It only mattered while runs aborted at ~48% of the
  // worklist (fixed 2026-08-24 — see `isOrphanRun`), which permanently favoured the front
  // half and starved 229 members. Two things now make a re-sort redundant: every run
  // drains the whole worklist, and the per-invoice attempt cap
  // (`shouldSkipForBulkAttemptSpacing`) already IS a least-recently-attempted rule —
  // expressed as a filter rather than a sort, so the set eligible on any given day is
  // exactly the set that has waited longest. Re-ordering here would add a Mongo
  // aggregation over the whole worklist and change nothing about who gets charged.
  const allInvoices: Stripe.Invoice[] = [];
  let hasMore = true;
  let startingAfter: string | undefined = undefined;

  while (hasMore) {
    const invoiceResponse = (await stripe.invoices.list({
      status: "open",
      collection_method: "charge_automatically",
      limit: 100,
      starting_after: startingAfter,
      expand: ["data.customer"],
    })) as Stripe.Response<Stripe.ApiList<Stripe.Invoice>>;

    allInvoices.push(...invoiceResponse.data);
    hasMore = invoiceResponse.has_more;

    if (hasMore && invoiceResponse.data.length > 0) {
      startingAfter = invoiceResponse.data[invoiceResponse.data.length - 1].id;
    }
  }

  const customerIds = allInvoices
    .map((inv) => (typeof inv.customer === "string" ? inv.customer : inv.customer?.id))
    .filter(Boolean) as string[];

  // `allUsers` is purely diagnostic (Total Users Found tile); `pastDueUsers`
  // is what eligibility actually filters against.
  const [allUsers, pastDueUsers] = await Promise.all([
    User.find({ stripeCustomerId: { $in: customerIds } })
      .select("_id stripeCustomerId")
      .lean(),
    User.find({
      stripeCustomerId: { $in: customerIds },
      "subscription.status": "past_due",
    })
      .select(
        "_id email firstName lastName stripeCustomerId stripeSubscriptionId subscription.status"
      )
      .lean<PastDueUserLean[]>(),
  ]);

  const userMap = new Map(pastDueUsers.map((u) => [u.stripeCustomerId, u]));

  const filterStats: ChargePastDuePreviewFilterStats & { eligible: number } = {
    wrongCollectionMethod: 0,
    noAmountRemaining: 0,
    noPaymentMethod: 0,
    noCustomerId: 0,
    userNotFound: 0,
    notPastDue: 0,
    duplicateOrStaleCycle: 0,
    eligible: 0,
  };

  const preview: ChargePastDuePreviewRow[] = [];

  for (const invoice of allInvoices) {
    if (!invoice.id) continue;

    if (invoice.collection_method !== "charge_automatically") {
      filterStats.wrongCollectionMethod++;
      continue;
    }

    if (!invoice.amount_remaining || invoice.amount_remaining <= 0) {
      filterStats.noAmountRemaining++;
      continue;
    }

    const customerId =
      typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
    if (!customerId) {
      filterStats.noCustomerId++;
      continue;
    }

    const customerDefaultPm = getCustomerDefaultPaymentMethodFromInvoice(invoice);
    const hasPaymentMethod = !!resolveInvoicePaymentMethodId(invoice, customerDefaultPm);
    if (!hasPaymentMethod) {
      filterStats.noPaymentMethod++;
      continue;
    }

    const user = userMap.get(customerId);
    if (!user) {
      filterStats.userNotFound++;
      continue;
    }

    if (user.subscription?.status !== "past_due") {
      filterStats.notPastDue++;
      continue;
    }

    filterStats.eligible++;
    const userId: string = user._id
      ? typeof user._id === "string"
        ? user._id
        : String(user._id)
      : "";

    preview.push({
      invoiceId: invoice.id,
      customerId,
      userId,
      userEmail: user.email || "N/A",
      userName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "N/A",
      amount: invoice.amount_remaining || 0,
      currency: invoice.currency || "aud",
    });
  }

  // Per-customer scoping — collapse to the single invoice attached to the
  // user's current subscription. Older / duplicate cycle invoices count as
  // skipped duplicates, NOT eligible.
  const invoiceById = new Map<string, Stripe.Invoice>();
  for (const inv of allInvoices) {
    if (inv.id) invoiceById.set(inv.id, inv);
  }

  const previewByCustomer = new Map<string, ChargePastDuePreviewRow[]>();
  for (const p of preview) {
    if (!previewByCustomer.has(p.customerId)) previewByCustomer.set(p.customerId, []);
    previewByCustomer.get(p.customerId)!.push(p);
  }

  const filteredPreview: ChargePastDuePreviewRow[] = [];
  let totalSkippedDuplicates = 0;

  for (const [cid, custPreview] of previewByCustomer) {
    const custInvoices = custPreview
      .map((p) => invoiceById.get(p.invoiceId))
      .filter((i): i is Stripe.Invoice => !!i);
    const u = userMap.get(cid);
    const userSubId = u?.stripeSubscriptionId;
    const { target: custTarget, skipped: custSkipped } = selectCurrentSubscriptionChargeable(
      custInvoices,
      userSubId
    );
    if (custTarget) {
      const targetEntry = custPreview.find((p) => p.invoiceId === custTarget.id);
      if (targetEntry) filteredPreview.push(targetEntry);
    }
    totalSkippedDuplicates += custSkipped.length;
  }

  filterStats.duplicateOrStaleCycle = totalSkippedDuplicates;

  return {
    eligibleCount: filteredPreview.length,
    totalInvoices: allInvoices.length,
    filterStats: {
      wrongCollectionMethod: filterStats.wrongCollectionMethod,
      noAmountRemaining: filterStats.noAmountRemaining,
      noPaymentMethod: filterStats.noPaymentMethod,
      noCustomerId: filterStats.noCustomerId,
      userNotFound: filterStats.userNotFound,
      notPastDue: filterStats.notPastDue,
      duplicateOrStaleCycle: filterStats.duplicateOrStaleCycle,
    },
    debug: {
      totalCustomerIds: customerIds.length,
      totalUsersFound: allUsers.length,
      pastDueUsersFound: pastDueUsers.length,
    },
    users: filteredPreview,
  };
}
