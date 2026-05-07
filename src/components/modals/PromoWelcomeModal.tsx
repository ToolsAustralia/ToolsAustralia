"use client";

import React, { useCallback, useState } from "react";
import { Check, Copy, Sparkles, Gift, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import { useAutoConfetti } from "@/hooks/useConfetti";
import type { PromoWelcomeData } from "@/hooks/usePromoWelcomeModal";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";

export interface PromoWelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignData: PromoWelcomeData;
}

const PromoCodeBadge: React.FC<{ code: string }> = ({ code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [code]);

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
      className="relative"
    >
      {/* Animated glow effect */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-red-500/30 via-orange-500/30 to-red-500/30 rounded-xl blur-xl"
        animate={{
          opacity: [0.5, 0.8, 0.5],
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      
      <div className="relative bg-gradient-to-br from-white via-gray-50 to-white dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-900 rounded-xl p-4 shadow-2xl border border-red-500/20">
        {/* Corner accents */}
        <div className="absolute top-0 left-0 w-16 h-16 bg-gradient-to-br from-red-500/20 to-transparent rounded-tl-xl" />
        <div className="absolute bottom-0 right-0 w-16 h-16 bg-gradient-to-tl from-orange-500/20 to-transparent rounded-br-xl" />
        
        <div className="relative space-y-2">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-widest">
            <Sparkles className="w-3 h-3" />
            <span>Your Exclusive Code</span>
            <Sparkles className="w-3 h-3" />
          </div>
          
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="relative inline-flex items-center justify-center font-mono text-xl sm:text-2xl font-bold tracking-[0.2em] px-4 py-2.5 rounded-lg bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30 text-red-700 dark:text-red-300 border-2 border-red-500/30 shadow-lg"
              data-testid="promo-welcome-code"
            >
              {/* Inner glow */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-lg" />
              <span className="relative">{code}</span>
            </motion.div>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCopy}
              className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold text-sm shadow-lg shadow-red-500/25 transition-all duration-200 border border-red-500/50"
            >
              <AnimatePresence mode="wait">
                {copied ? (
                  <motion.span
                    key="check"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0, rotate: 180 }}
                    className="flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Copied!
                  </motion.span>
                ) : (
                  <motion.span
                    key="copy"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    Copy
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const PromoWelcomeModal: React.FC<PromoWelcomeModalProps> = ({ isOpen, onClose, campaignData }) => {
  const { openEntryFlow } = useMajorDrawEntryCta();

  const isComeback = campaignData.campaignType === "cancelled-membership-comeback";

  const title = isComeback
    ? campaignData.title?.trim() || "Welcome back!"
    : "Your promo code is ready";

  const bodyGeneral =
    "Use this code at checkout to unlock your bonus entries. It works with any membership or toolset package that supports promo links.";

  const bodyComeback = campaignData.description?.trim() ||
    "We've missed you. Here's your exclusive comeback code—use it at checkout, then continue to enter the draw.";

  // Confetti effect from sides when modal opens
  useAutoConfetti(isOpen, {
    duration: 2000,
    origin: "sides",
    colors: ["#ee0000", "#ff3333", "#ff6b6b", "#ffa500", "#ffcc00"],
  });

  const handleEnterNow = useCallback(() => {
    onClose();
    openEntryFlow({ openLocalModal: false });
  }, [onClose, openEntryFlow]);

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop testId="promo-welcome-modal">
      <ModalHeader
        title={title}
        onClose={onClose}
        showLogo
        className="border-b border-gray-200 dark:border-neutral-800"
      />
      <ModalContent className="p-4 sm:p-6 space-y-4 relative overflow-hidden">
        {/* Animated background gradients */}
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-red-500/10 via-orange-500/5 to-transparent rounded-full blur-3xl"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <motion.div
            className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-orange-500/10 via-red-500/5 to-transparent rounded-full blur-3xl"
            animate={{
              scale: [1.2, 1, 1.2],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 2,
            }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10 space-y-4">
          {/* Body Text */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <p className="text-sm sm:text-base text-gray-700 dark:text-gray-200 text-center leading-relaxed font-medium">
              {isComeback ? bodyComeback : bodyGeneral}
            </p>
          </motion.div>

          {/* Code Badge */}
          <PromoCodeBadge code={campaignData.code} />

          {/* Bonus Entries Highlight */}
          {campaignData.bonusEntries > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="relative"
            >
              <div className="relative bg-gradient-to-r from-red-50 via-orange-50 to-red-50 dark:from-red-950/30 dark:via-orange-950/30 dark:to-red-950/30 rounded-xl p-3 border border-red-200/50 dark:border-red-800/50 shadow-lg">
                <div className="flex items-center justify-center gap-2 text-center">
                  <motion.div
                    animate={{
                      scale: [1, 1.2, 1],
                      rotate: [0, 5, -5, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  >
                    <Zap className="w-5 h-5 text-orange-500 fill-orange-500" />
                  </motion.div>
                  <div>
                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Bonus Included
                    </div>
                    <div className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">
                      {campaignData.bonusEntries} {campaignData.bonusEntries === 1 ? "Entry" : "Entries"}
                    </div>
                  </div>
                  <motion.div
                    animate={{
                      scale: [1, 1.2, 1],
                      rotate: [0, -5, 5, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: 0.5,
                    }}
                  >
                    <Zap className="w-5 h-5 text-orange-500 fill-orange-500" />
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}

          {/* CTA Button */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="pt-1"
          >
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleEnterNow}
              className="w-full relative overflow-hidden px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 via-red-700 to-orange-600 text-white font-bold text-base shadow-2xl shadow-red-500/50 border border-red-500/50 transition-all duration-300"
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                animate={{
                  x: ["-100%", "100%"],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "linear",
                }}
              />
              <span className="relative z-10 flex items-center justify-center gap-2">
                {isComeback ? "Enter the Draw" : "Enter Now"}
                <motion.span
                  animate={{
                    x: [0, 4, 0],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  →
                </motion.span>
              </span>
            </motion.button>
          </motion.div>
        </div>
      </ModalContent>
    </ModalContainer>
  );
};

export default PromoWelcomeModal;
