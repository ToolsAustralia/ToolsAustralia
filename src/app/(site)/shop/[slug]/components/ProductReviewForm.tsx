"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  useAddProductReview,
  type ProductReviewEligibility,
} from "@/hooks/queries/useProductQueries";

/** Matches the `maxlength` on the Product reviews sub-schema and the Zod cap on the route. */
const COMMENT_MAX_LENGTH = 500;

const RATING_LABELS = ["1 star", "2 stars", "3 stars", "4 stars", "5 stars"];

interface ProductReviewFormProps {
  productId: string;
  /**
   * Decided on the server from the viewer's paid orders — never from anything the
   * browser knows. This prop only chooses which words to render; the route refuses
   * an ineligible POST on its own.
   */
  eligibility: ProductReviewEligibility;
}

export default function ProductReviewForm({ productId, eligibility }: ProductReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState("");
  const { showToast } = useToast();
  const router = useRouter();
  const addReview = useAddProductReview();

  if (eligibility === "not_eligible") return null;

  if (eligibility === "already_reviewed") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
        Thanks — we have your review of this item on file.
      </div>
    );
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (rating === 0 || addReview.isPending) return;

    try {
      await addReview.mutateAsync({
        productId,
        review: { rating, comment: comment.trim() || undefined },
      });
      setRating(0);
      setComment("");
      showToast({ type: "success", title: "Thanks — your review has been saved." });
      // The reviews list and the average above it are server-rendered from the
      // product document, so the mutation's cache update cannot reach them. This
      // re-runs the page's own read.
      router.refresh();
    } catch (error) {
      showToast({
        type: "error",
        title: "Your review was not saved",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const shownRating = hoveredRating || rating;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
    >
      <h4 className="mb-1 font-semibold text-gray-900 dark:text-neutral-100">Review this item</h4>
      {/* "tell us", not "tell everyone": whether a stored review is displayed is
          decided by shouldShowReviews(), so promising publication here would be a
          promise this page cannot keep. */}
      <p className="mb-4 text-sm text-gray-600 dark:text-neutral-400">
        You bought this one, so you can tell us how it went.
      </p>

      <div
        role="radiogroup"
        aria-label="Rating out of five"
        className="mb-4 flex items-center gap-1"
        onMouseLeave={() => setHoveredRating(0)}
      >
        {RATING_LABELS.map((label, index) => {
          const value = index + 1;
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={label}
              onClick={() => setRating(value)}
              onMouseEnter={() => setHoveredRating(value)}
              className="rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
            >
              <Star
                className={`h-7 w-7 transition-colors ${
                  value <= shownRating
                    ? "fill-current text-yellow-400"
                    : "text-gray-300 dark:text-neutral-700"
                }`}
              />
            </button>
          );
        })}
      </div>

      <label
        htmlFor="product-review-comment"
        className="mb-2 block text-sm font-medium text-gray-900 dark:text-neutral-100"
      >
        Anything you want to add? (optional)
      </label>
      <textarea
        id="product-review-comment"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={COMMENT_MAX_LENGTH}
        rows={4}
        placeholder="Fit, print quality, how it wears — whatever you'd want to have known."
        className="w-full rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500"
      />

      <div className="mt-3 flex items-center justify-between gap-4">
        <span className="text-xs text-gray-500 dark:text-neutral-400">
          {comment.length} / {COMMENT_MAX_LENGTH}
        </span>
        <button
          type="submit"
          disabled={rating === 0 || addReview.isPending}
          className="rounded-lg bg-red-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-500"
        >
          {addReview.isPending ? "Saving…" : "Submit review"}
        </button>
      </div>
    </form>
  );
}
