"use client";

import React from "react";
import { usePastDrawsData } from "@/hooks/usePastDrawsData";
import PastDrawCard from "../past-draws/PastDrawCard";
import PastDrawsEmptyState from "../past-draws/PastDrawsEmptyState";
import Shell from "./Shell";
import Hero from "./Hero";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";

interface PastDrawsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

/**
 * PastDrawsModal — list of past major draws the user participated in.
 * Mirrors the suite-wide design language: premium dark hero, opaque backdrop,
 * 82dvh height cap, dark-mode aware loading/error/empty states.
 *
 * Public API preserved from the prior monolith — consumers (my-account/page,
 * ModalsGalleryClient) keep importing the default export unchanged.
 */
const PastDrawsModal: React.FC<PastDrawsModalProps> = ({
  isOpen,
  onClose,
  userId,
}) => {
  const { draws, isLoading, error } = usePastDrawsData(
    isOpen ? userId : undefined
  );
  const hasDraws = !isLoading && !error && draws.length > 0;

  return (
    <Shell isOpen={isOpen} onClose={onClose} labelledBy="past-draws-headline">
      <Hero drawCount={hasDraws ? draws.length : undefined} />

      <div className="bg-white dark:bg-neutral-950 px-4 pt-3 pb-4 space-y-3 sm:px-5">
        {isLoading && <LoadingState />}

        {error && !isLoading && (
          <ErrorState onRetry={() => window.location.reload()} />
        )}

        {!isLoading && !error && draws.length === 0 && <PastDrawsEmptyState />}

        {hasDraws &&
          draws.map((draw, index) => (
            <PastDrawCard
              key={draw._id}
              draw={draw}
              drawIndex={index}
              totalDraws={draws.length}
            />
          ))}

        {hasDraws && (
          <p className="text-center text-xs text-gray-400 dark:text-neutral-500 pt-2 pb-1">
            Showing {draws.length} completed{" "}
            {draws.length === 1 ? "draw" : "draws"} you entered
          </p>
        )}
      </div>
    </Shell>
  );
};

export default PastDrawsModal;
