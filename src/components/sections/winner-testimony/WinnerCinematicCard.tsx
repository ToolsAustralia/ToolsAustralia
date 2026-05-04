"use client";

import type { WinnerSummary } from "@/types/winner";
import WinnerCinematicHero from "./WinnerCinematicHero";

interface WinnerCinematicCardProps {
  winner: WinnerSummary;
  onOpenStory: (winnerId: string) => void;
  className?: string;
}

export default function WinnerCinematicCard({
  winner,
  onOpenStory,
  className = "",
}: WinnerCinematicCardProps) {
  return (
    <article
      className={`relative overflow-hidden rounded-[24px] shadow-[0_20px_55px_rgba(15,23,42,0.30)] ${className}`}
    >
      <WinnerCinematicHero
        winner={winner}
        variant="card"
        onReadFullStory={() => onOpenStory(winner.id)}
      />
    </article>
  );
}
