import type { Metadata } from "next";
import { Archivo, Newsreader, Space_Mono } from "next/font/google";
import { cn } from "@/utils/cn";
import connectDB from "@/lib/mongodb";
import Winner from "@/models/Winner";
import { getAllWinners } from "@/utils/draws/get-all-winners";
import WinnersHero from "./components/WinnersHero";
import WinnersBrowser from "./components/WinnersBrowser";
import HowChosen from "../draw-results/components/HowChosen";
import ResultsCTA from "../draw-results/components/ResultsCTA";
import "../draw-results/draw-results.css";

// Per-route fonts (shared design system with /draw-results).
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  style: ["normal", "italic"],
  variable: "--font-archivo",
  display: "swap",
});
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});
// Editorial serif for the winner testimony quotes (the design's `winners-serif`).
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

// Marketing route class: static + ISR (no-nonce CSP). Winner data changes only when a draw
// completes; 5 minutes staleness is acceptable and removes a per-request Mongo round trip.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Winners | Tools Australia",
  description:
    "The Tools Australia winners' wall — real winners, real prizes, every major and mini draw independently certified by randomdraws.com.au.",
};

async function getWinnerStats() {
  try {
    await connectDB();
    const [total, major, mini] = await Promise.all([
      Winner.countDocuments({}),
      Winner.countDocuments({ drawType: "major" }),
      Winner.countDocuments({ drawType: "mini" }),
    ]);
    return { total, major, mini };
  } catch (error) {
    console.error("Error loading winner stats:", error);
    return { total: 0, major: 0, mini: 0 };
  }
}

export default async function WinnersPage() {
  const [stats, winners] = await Promise.all([getWinnerStats(), getAllWinners({ limit: 100 })]);

  return (
    <div className={cn("ta-results min-h-screen-svh pt-[60px] sm:pt-[70px]", archivo.variable, spaceMono.variable, newsreader.variable)}>
      <WinnersHero stats={stats} />
      <WinnersBrowser winners={winners} />
      <HowChosen />
      <ResultsCTA />
    </div>
  );
}
