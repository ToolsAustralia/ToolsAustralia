"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCircle, Copy, Loader2, XCircle } from "lucide-react";
import Button from "@/components/modals/ui/Button";
import Input from "@/components/modals/ui/Input";
import ModalContainer from "@/components/modals/ui/ModalContainer";
import ModalContent from "@/components/modals/ui/ModalContent";
import ModalHeader from "@/components/modals/ui/ModalHeader";
import Textarea from "@/components/modals/ui/Textarea";
import { usePermissions } from "@/hooks/usePermissions";
import type { OrderListItem } from "@/services/shop/orderQueries";

/**
 * One shop order, opened from the admin order list — and the only place a refund can
 * be issued from.
 *
 * The two live together on purpose. A refund moves real money and cannot be undone,
 * so the person issuing it should be looking at what they are refunding — the lines,
 * the total, whether it has already gone to the printer — rather than pressing a
 * button on a row of a table. That reading surface IS the guard rail, which is why
 * the list's Refund button opens this modal rather than a bare confirm dialog.
 *
 * Refusals are shown in the server's own words. `refundShopOrder` distinguishes five
 * reasons for saying no and each one tells support something different — an order
 * that was never charged is a different conversation from one Stripe rejected — so
 * collapsing them into "refund failed" would throw away the only diagnosis available.
 */

/** Shared with the order list so a status reads the same colour in both places. */
export const orderStatusClass = (status: string) =>
  ({
    pending: "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-300",
    processing: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    shipped: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    delivered: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300",
    completed: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300",
    cancelled: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  })[status] ?? "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-300";

const aud = (dollars: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(dollars);

const dateTime = (iso: string) => new Date(iso).toLocaleString("en-AU");

/**
 * `refundShopOrder`'s refusal codes, in words a support person can act on. Anything
 * not listed falls back to the server's own `error` string rather than a placeholder,
 * so a code added later still surfaces something true.
 */
const REFUSAL_REASON: Record<string, string> = {
  order_not_found: "That order no longer exists — it may have been removed since this list loaded.",
  not_refundable:
    "Only a paid order can be refunded. A pending order was never charged, so there is nothing to hand back.",
  already_refunded:
    "This order is already cancelled and refunded. Refunding again would try to take the same payment back twice.",
  no_payment: "No Stripe payment is recorded against this order, so there is nothing to hand back.",
  stripe_failed: "Stripe refused the refund.",
};

const CONFIRMATION_WORD = "REFUND";

/** What the refund endpoint returns, in both the success and the refusal shape. */
interface RefundResponse {
  success?: boolean;
  error?: string;
  status?: string;
  data?: { orderNumber?: string; amountRefunded?: number; wasFull?: boolean };
}

interface RefundFailure {
  /** The service's own code, shown verbatim so support can quote it. */
  code?: string;
  message: string;
  /** Stripe's wording, when it was Stripe that said no. */
  detail?: string;
}

interface RefundOutcome {
  amountCents: number;
  wasFull: boolean;
}

type RefundState = "idle" | "processing" | "done" | "failed";

export interface OrderDetailModalProps {
  order: OrderListItem;
  isOpen: boolean;
  onClose: () => void;
  /** Opens with the refund panel already expanded — the list's Refund button. */
  startInRefund?: boolean;
  /** A refund landed: the order's status and notes have moved, so the list must re-read. */
  onRefunded: () => void;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500 dark:text-neutral-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900 dark:text-neutral-100">{children}</dd>
    </div>
  );
}

export default function OrderDetailModal({
  order,
  isOpen,
  onClose,
  startInRefund = false,
  onRefunded,
}: OrderDetailModalProps) {
  const { has } = usePermissions();
  // Same permission the route enforces (`shop.delete`). Gated here so a staff member
  // who cannot refund is never shown a control that would 403 on them.
  const canRefund = has("shop.delete");
  const address = order.shippingAddress;

  const [copied, setCopied] = useState(false);
  const [showRefund, setShowRefund] = useState(startInRefund && canRefund);
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [refundState, setRefundState] = useState<RefundState>("idle");
  const [failure, setFailure] = useState<RefundFailure | null>(null);
  const [outcome, setOutcome] = useState<RefundOutcome | null>(null);

  // Reopening on a different order must never carry the previous order's half-typed
  // refund across — that is how the wrong order gets money handed back.
  useEffect(() => {
    if (!isOpen) return;
    setShowRefund(startInRefund && canRefund);
    setMode("full");
    setAmount("");
    setReason("");
    setConfirmation("");
    setRefundState("idle");
    setFailure(null);
    setOutcome(null);
  }, [isOpen, order.id, startInRefund, canRefund]);

  const isRefunding = refundState === "processing";

  const handleClose = useCallback(() => {
    // Closing mid-request would leave the modal gone while Stripe is still deciding,
    // and nothing would report the answer.
    if (isRefunding) return;
    onClose();
  }, [isRefunding, onClose]);

  const copyPaymentIntent = useCallback(() => {
    if (!order.paymentIntentId) return;
    void navigator.clipboard.writeText(order.paymentIntentId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [order.paymentIntentId]);

  const totalCents = Math.round(order.totalAmount * 100);
  const partialCents = Math.round(Number(amount) * 100);
  const amountError =
    mode !== "partial" || amount.trim() === ""
      ? undefined
      : !Number.isFinite(partialCents) || partialCents <= 0
        ? "Enter an amount greater than zero."
        : partialCents > totalCents
          ? `That is more than the order total (${aud(order.totalAmount)}).`
          : undefined;

  const canSubmit =
    confirmation.trim().toUpperCase() === CONFIRMATION_WORD &&
    (mode === "full" || (amount.trim() !== "" && !amountError));

  const submitRefund = async () => {
    setRefundState("processing");
    setFailure(null);
    try {
      const res = await fetch("/api/admin/shop/orders/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          ...(mode === "partial" ? { amountCents: partialCents } : {}),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as RefundResponse | null;

      if (!res.ok || !body?.success) {
        const code = typeof body?.status === "string" ? body.status : undefined;
        setFailure({
          code,
          message:
            (code ? REFUSAL_REASON[code] : undefined) ??
            body?.error ??
            "The refund did not go through.",
          detail: code === "stripe_failed" ? body?.error : undefined,
        });
        setRefundState("failed");
        return;
      }

      setOutcome({
        amountCents:
          typeof body.data?.amountRefunded === "number"
            ? body.data.amountRefunded
            : mode === "partial"
              ? partialCents
              : totalCents,
        // From the server, not from what we asked for: a partial entered at the
        // exact order total is a full refund and cancels the order.
        wasFull: Boolean(body?.data?.wasFull),
      });
      setRefundState("done");
      onRefunded();
    } catch (err) {
      setFailure({
        message: err instanceof Error ? err.message : "The refund request could not be sent.",
      });
      setRefundState("failed");
    }
  };

  const inputClass =
    "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500";

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={handleClose}
      size="2xl"
      // Stays 2xl on desktop: this is a read-mostly detail view with a delivery
      // address and a line-item list, not a dense form — 4xl would just stretch
      // the label/value rows. `mobileFullBleed` matches AdminProductModal so the
      // two shop modals behave the same way on a phone.
      mobileFullBleed
      closeOnBackdrop={!isRefunding}
    >
      <ModalHeader
        title={`Order ${order.orderNumber}`}
        subtitle={`Placed ${dateTime(order.createdAt)}`}
        onClose={handleClose}
        showCloseButton={!isRefunding}
      />

      <ModalContent padding="md" className="space-y-5">
        <section>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Fact label="Status">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${orderStatusClass(order.status)}`}
              >
                {order.status}
              </span>
            </Fact>
            <Fact label="Customer">{order.customerName || "—"}</Fact>
            <Fact label="Order total">{aud(order.totalAmount)}</Fact>
            <Fact label="Items">
              {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
            </Fact>
            <Fact label="Free entries">
              {/* undefined and 0 mean different things: the grant has not run versus
                  it ran and this order was worth no entries. */}
              {order.entriesGranted === undefined ? (
                <span className="text-gray-500 dark:text-neutral-400">grant not run</span>
              ) : (
                order.entriesGranted
              )}
            </Fact>
            <Fact label="Sent to printer">
              {order.submittedAt ? (
                dateTime(order.submittedAt)
              ) : (
                <span className="text-gray-500 dark:text-neutral-400">not yet</span>
              )}
            </Fact>
            <Fact label="Tracking">
              {order.trackingNumber ? (
                <span className="font-mono text-xs">{order.trackingNumber}</span>
              ) : (
                <span className="text-gray-500 dark:text-neutral-400">none yet</span>
              )}
            </Fact>
          </dl>
        </section>

        <section className="rounded-lg border border-gray-200 p-3 dark:border-neutral-800">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">
            Stripe payment
          </h4>
          {order.paymentIntentId ? (
            <div className="mt-2 flex items-center gap-2">
              {/* Selectable as well as copyable: clipboard access can be refused, and
                  this id is the only handle staff have on the money in Stripe. */}
              <code className="min-w-0 flex-1 select-all break-all rounded bg-gray-50 px-2 py-1 font-mono text-xs text-gray-800 dark:bg-neutral-900 dark:text-neutral-200">
                {order.paymentIntentId}
              </code>
              <button
                type="button"
                onClick={copyPaymentIntent}
                className="inline-flex shrink-0 items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-600 dark:text-neutral-400">
              No Stripe payment is recorded against this order.
            </p>
          )}
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">
            Items
          </h4>
          <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
            {order.items.map((item, idx) => (
              <li key={`${item.sku ?? item.name}-${idx}`} className="flex gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 dark:text-neutral-100">
                    {item.quantity} × {item.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-neutral-400">
                    {item.variant ?? "no variant recorded"}
                    {item.sku && <span className="font-mono"> · {item.sku}</span>}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm text-gray-900 dark:text-neutral-100">
                    {aud(item.price * item.quantity)}
                  </p>
                  {item.quantity > 1 && (
                    <p className="text-xs text-gray-500 dark:text-neutral-400">
                      {aud(item.price)} each
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-sm font-semibold text-gray-900 dark:border-neutral-800 dark:text-neutral-100">
            <span>Order total</span>
            <span>{aud(order.totalAmount)}</span>
          </div>
        </section>

        {/* The address survives after the order leaves the fulfilment CSV, which is
            exactly when a delivery enquiry arrives. Admin projection only — a
            customer supplied it and does not need it read back. */}
        <section className="rounded-lg border border-gray-200 p-3 dark:border-neutral-800">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">
            Delivery address
          </h4>
          {address ? (
            <address className="mt-2 whitespace-pre-line text-sm not-italic text-gray-800 dark:text-neutral-100">
              {[
                [address.firstName, address.lastName].filter(Boolean).join(" "),
                address.addressLine1,
                address.addressLine2,
                [address.city, address.state, address.postalCode].filter(Boolean).join("  "),
              ]
                .filter(Boolean)
                .join("\n")}
            </address>
          ) : (
            <p className="mt-2 text-sm text-gray-500 dark:text-neutral-500">
              No address recorded on this order.
            </p>
          )}
          {(address?.email || address?.phone) && (
            <p className="mt-2 text-xs text-gray-600 dark:text-neutral-400">
              {[address?.email, address?.phone].filter(Boolean).join(" · ")}
            </p>
          )}
          {address?.deliveryInstructions && (
            <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <span className="font-semibold">Instructions:</span> {address.deliveryInstructions}
            </p>
          )}
        </section>

        {canRefund && (
          <section className="rounded-lg border border-red-200 bg-red-50/60 p-3 dark:border-red-900/50 dark:bg-red-950/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">Refund</h4>

                {refundState === "done" && outcome ? (
                  <div className="mt-2 rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-900/50 dark:bg-green-950/30">
                    <p className="flex items-center gap-2 text-sm font-semibold text-green-800 dark:text-green-200">
                      <CheckCircle className="h-4 w-4" />
                      Refunded {aud(outcome.amountCents / 100)}
                    </p>
                    <p className="mt-1 text-xs text-green-700 dark:text-green-300">
                      {outcome.wasFull
                        ? "A full refund also cancels the order so it leaves the fulfilment queue — the list behind this modal has been reloaded, check the status there."
                        : "A partial refund leaves the order live: the customer keeps the garment and it may still need dispatching."}
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                      This moves real money back to the customer and cannot be undone.
                    </p>

                    {!showRefund ? (
                      <Button
                        onClick={() => setShowRefund(true)}
                        variant="secondary"
                        size="sm"
                        className="mt-3 bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:text-white dark:hover:bg-red-700"
                      >
                        Refund this order
                      </Button>
                    ) : (
                      <div className="mt-3 space-y-3">
                        <div className="flex flex-wrap gap-4">
                          <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-neutral-100">
                            <input
                              type="radio"
                              name="refund-mode"
                              checked={mode === "full"}
                              onChange={() => setMode("full")}
                              disabled={isRefunding}
                            />
                            Full — {aud(order.totalAmount)}
                          </label>
                          <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-neutral-100">
                            <input
                              type="radio"
                              name="refund-mode"
                              checked={mode === "partial"}
                              onChange={() => setMode("partial")}
                              disabled={isRefunding}
                            />
                            Partial
                          </label>
                        </div>

                        {mode === "partial" && (
                          <Input
                            type="number"
                            label="Amount to refund (AUD)"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.00"
                            min={0.01}
                            max={order.totalAmount}
                            step={0.01}
                            error={amountError}
                            disabled={isRefunding}
                          />
                        )}

                        <Textarea
                          label="Reason (recorded on the order)"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="e.g. arrived with a cracked print"
                          rows={2}
                          maxLength={500}
                          disabled={isRefunding}
                        />

                        <div>
                          <label
                            htmlFor="refund-confirmation"
                            className="mb-1 block text-sm font-medium text-red-800 dark:text-red-200"
                          >
                            Type <strong>{CONFIRMATION_WORD}</strong> to confirm
                          </label>
                          <input
                            id="refund-confirmation"
                            type="text"
                            value={confirmation}
                            onChange={(e) => setConfirmation(e.target.value)}
                            placeholder={CONFIRMATION_WORD}
                            disabled={isRefunding}
                            className={inputClass}
                          />
                        </div>

                        {refundState === "failed" && failure && (
                          <div className="rounded-md border border-red-300 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/40">
                            <p className="flex items-start gap-2 text-sm text-red-800 dark:text-red-200">
                              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                              <span>{failure.message}</span>
                            </p>
                            {failure.detail && (
                              <p className="mt-1 pl-6 text-xs text-red-700 dark:text-red-300">
                                {failure.detail}
                              </p>
                            )}
                            {failure.code && (
                              <p className="mt-1 pl-6 font-mono text-xs text-red-600 dark:text-red-400">
                                reason: {failure.code}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button
                            onClick={() => {
                              // Collapsing the panel drops the typed confirmation with
                              // it — reopening must not find the word already there.
                              setShowRefund(false);
                              setConfirmation("");
                              setFailure(null);
                              setRefundState("idle");
                            }}
                            variant="secondary"
                            size="sm"
                            disabled={isRefunding}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={() => void submitRefund()}
                            variant="danger"
                            size="sm"
                            disabled={!canSubmit || isRefunding}
                          >
                            {isRefunding ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Refunding…
                              </>
                            ) : mode === "partial" && !amountError && amount.trim() !== "" ? (
                              `Refund ${aud(partialCents / 100)}`
                            ) : (
                              `Refund ${aud(order.totalAmount)}`
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        )}
      </ModalContent>
    </ModalContainer>
  );
}
