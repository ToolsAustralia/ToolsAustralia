"use client";

import React from "react";
import Image from "next/image";
import { Calendar, Gift } from "lucide-react";
import Link from "next/link";
import { useUserContext } from "@/contexts/UserContext";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";
import { apprentice, tradie, foreman, boss, power, vip } from "@/utils/images/package-icons";
import { formatActivationDate } from "@/utils/promo-banner/format-activation-date";
import { getPackageColorSchemeForPromo, hexToRgbaString } from "@/utils/package-colors/packageColorScheme";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import { useNextDraw } from "@/hooks/queries/useMajorDrawQueries";

export interface GateClosedModalProps {
  isOpen: boolean;
  onClose: () => void;
  nextActivationDate: string | null;
  nextDrawName?: string;
}

/**
 * GateClosedModal Component
 * 
 * Displays when Majordraw gates are closed (freeze period or gap period).
 * Informs users when the next draw will open.
 */
const GateClosedModal: React.FC<GateClosedModalProps> = ({
  isOpen,
  onClose,
  nextActivationDate,
  nextDrawName,
}) => {
  const { isAuthenticated } = useUserContext();
  const { variantConfig } = useVariantContext();
  const { data: nextDraw } = useNextDraw();

  const formattedDate = formatActivationDate(nextActivationDate);

  // Use next draw's prize image as background, fallback to default promo image
  const backgroundImageSrc =
    nextDraw?.prize?.images?.[0] || "/images/background/promo/x10 entries.webp";

  // Package icons with colors from MembershipSection package color scheme (one-time tab mapping)
  const packageConfigs = [
    { icon: apprentice, planId: "apprentice-pack" },
    { icon: tradie, planId: "tradie-pack" },
    { icon: foreman, planId: "foreman-pack" },
    { icon: boss, planId: "boss-pack" },
    { icon: power, planId: "power-pack" },
    { icon: vip, planId: "vip-pack" },
  ].map(({ icon, planId }) => {
    const colorScheme = getPackageColorSchemeForPromo(planId, false, variantConfig);
    return {
      icon,
      name: planId.replace("-pack", ""),
      glowColor: hexToRgbaString(colorScheme.accentHex, 0.5),
      bgGlowColor: hexToRgbaString(colorScheme.accentHex, 0.2),
      hoverGlowColor: hexToRgbaString(colorScheme.accentHex, 0.4),
    };
  });

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose}>
    
        {/* Header - matching MembershipModal design */}
        <ModalHeader title="Gates Are Closed" onClose={onClose} showLogo={true} />

        {/* Content */}
        <ModalContent className="p-4 sm:p-6 relative">
          {/* Background Image with Darker Dim Overlay */}
          <div className="absolute inset-0 z-0">
            <Image
              src={backgroundImageSrc}
              alt={nextDraw?.name ? `Next draw: ${nextDraw.name}` : "Background"}
              fill
              className="object-cover opacity-20"
              priority
            />
            {/* Darker Dim Overlay */}
            <div className="absolute inset-0 bg-black/75"></div>
          </div>
          
          {/* Content - positioned above background */}
          <div className="relative z-10 space-y-4 sm:space-y-8 text-center">
            {/* Package Icons Row - Above Next Draw */}
            <div className="flex justify-center items-center gap-1.5 sm:gap-2 opacity-80">
              {packageConfigs.map((config, index) => (
                <div
                  key={index}
                  className="relative group"
                >
                  <div 
                    className="absolute inset-0 rounded-full blur-md transition-all duration-300"
                    style={{
                      backgroundColor: config.bgGlowColor,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = config.hoverGlowColor;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = config.bgGlowColor;
                    }}
                  ></div>
                  <Image
                    src={config.icon}
                    alt={`${config.name} package icon`}
                    width={40}
                    height={40}
                    className="relative object-contain filter group-hover:scale-110 transition-transform duration-300"
                    style={{
                      filter: `drop-shadow(0 0 10px ${config.glowColor})`,
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Next Draw Info - Cool Styled Text */}
            {nextDrawName && (
              <div className="space-y-2 sm:space-y-3">
                <p className="text-xs sm:text-sm font-medium text-white/70 uppercase tracking-wider">
                  Next Draw:
                </p>
                <p className="text-2xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(250,204,21,0.6)] animate-pulse">
                  {nextDrawName}
                </p>
              </div>
            )}

            {/* Activation Date - Cool Styled Text */}
            {formattedDate ? (
              <div className="flex flex-col items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Calendar className="w-4 h-4 sm:w-6 sm:h-6 text-yellow-400 flex-shrink-0 drop-shadow-[0_0_6px_rgba(250,204,21,0.8)] animate-pulse" />
                  <p className="text-xs sm:text-sm font-medium text-white/70 uppercase tracking-wider">
                    Come back on:
                  </p>
                </div>
                <p className="text-base sm:text-xl lg:text-2xl font-bold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)] leading-tight px-2">
                  {formattedDate}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xs sm:text-sm text-white/70">
                  Come back when the next draw opens.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-4 sm:pt-6 space-y-2 sm:space-y-3">
              {/* Mini Draws Button - Only for authenticated users */}
              {isAuthenticated && (
                <Link
                  href="/mini-draws"
                  onClick={onClose}
                  className="block w-full"
                >
                  <Button
                    className="w-full bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 hover:from-yellow-500 hover:via-orange-500 hover:to-red-500 text-black font-semibold py-3 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                  >
                    <Gift className="w-5 h-5" />
                    Visit Mini Draws
                  </Button>
                </Link>
              )}

              {/* Close Button */}
              <Button
                onClick={onClose}
                className="w-full bg-gradient-to-r from-red-600 via-red-700 to-red-800 hover:from-red-700 hover:via-red-800 hover:to-red-900 text-white font-semibold py-3 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl hover:shadow-red-500/50"
              >
                Got it
              </Button>
            </div>
          </div>
        </ModalContent>
    
    </ModalContainer>
  );
};

export default GateClosedModal;
