"use client";

import React from "react";
import { ModalContainer, ModalHeader, ModalContent } from "./ui";
import { usePastDrawsData } from "@/hooks/usePastDrawsData";
import PastDrawCard from "./past-draws/PastDrawCard";
import PastDrawsEmptyState from "./past-draws/PastDrawsEmptyState";

interface PastDrawsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

const PastDrawsModal: React.FC<PastDrawsModalProps> = ({
  isOpen,
  onClose,
  userId,
}) => {
  const { draws, isLoading, error } = usePastDrawsData(
    isOpen ? userId : undefined
  );

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      height="fixed"
      fixedHeight="max-h-[85dvh]"
    >
      <ModalHeader
        title="Your Draw History"
        subtitle="Past major draws you participated in"
        onClose={onClose}
      />

      <ModalContent scrollbar="metallic" padding="lg" className="space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl border border-gray-100 bg-white p-3 sm:p-4"
              >
                <div className="flex flex-row gap-3 sm:gap-4">
                  <div className="flex-shrink-0 w-24 h-24 sm:w-32 sm:h-32 rounded-xl bg-gray-200" />
                  <div className="flex-1 space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-16" />
                    <div className="h-5 bg-gray-200 rounded w-3/4" />
                    <div className="flex gap-3">
                      <div className="h-3 bg-gray-200 rounded w-24" />
                      <div className="h-3 bg-gray-200 rounded w-20" />
                    </div>
                    <div className="h-7 bg-amber-100 rounded-lg w-24" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">Something went wrong loading your draw history.</p>
            <p className="mt-1">
              Please try again or contact support if the problem continues.{" "}
              <button
                onClick={() => window.location.reload()}
                className="text-red-600 underline underline-offset-2 hover:text-red-500"
                type="button"
              >
                Retry now
              </button>
            </p>
          </div>
        )}

        {!isLoading && !error && draws.length === 0 && <PastDrawsEmptyState />}

        {!isLoading &&
          !error &&
          draws.length > 0 &&
          draws.map((draw, index) => (
            <PastDrawCard
              key={draw._id}
              draw={draw}
              drawIndex={index}
              totalDraws={draws.length}
            />
          ))}

        {!isLoading && !error && draws.length > 0 && (
          <p className="text-center text-xs text-gray-400 pt-2 pb-1">
            Showing {draws.length} completed{" "}
            {draws.length === 1 ? "draw" : "draws"} you entered
          </p>
        )}
      </ModalContent>
    </ModalContainer>
  );
};

export default PastDrawsModal;
