import type { Metadata } from "next";
import { Archivo, Space_Mono } from "next/font/google";
import { cn } from "@/utils/cn";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";
import Winner from "@/models/Winner";
import { getAllWinners } from "@/utils/draws/get-all-winners";
import ResultsHero from "./components/ResultsHero";
import ResultsRegister from "./components/ResultsRegister";
import WinnersWall from "./components/WinnersWall";
import HowChosen from "./components/HowChosen";
import ResultsCTA from "./components/ResultsCTA";
import "./draw-results.css";

// Per-route fonts (only preloaded on this page). Exposed as CSS vars consumed
// by draw-results.css; body text inherits the site's Inter.
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

// Marketing route class: static + ISR (no-nonce CSP). Draw-results stats change on draw
// completion; 5-minute revalidate replaces 3 per-request Mongo queries.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Draw Results & Winners | Tools Australia",
  description:
    "Every major and mini draw, on the record — real winners, real prizes, independently certified by randomdraws.com.au. Browse the full register and the winners' wall.",
};

async function getDrawResultsHeroStats() {
  try {
    await connectDB();
    const [majorCompleted, miniWins, allWinners] = await Promise.all([
      MajorDraw.countDocuments({ status: "completed" }),
      Winner.countDocuments({ drawType: "mini" }),
      Winner.countDocuments({}),
    ]);
    return { majorCompleted, miniWins, allWinners };
  } catch (error) {
    console.error("Error loading draw results hero stats:", error);
    return { majorCompleted: 0, miniWins: 0, allWinners: 0 };
  }
}

export default async function DrawResultsPage() {
  const [stats, winners] = await Promise.all([
    getDrawResultsHeroStats(),
    getAllWinners({ limit: 60 }),
  ]);

  // Hero featured card auto-cycles through recent major-draw winners; fall back
  // to the most recent winners of any type when there are no majors yet.
  const majors = winners.filter((w) => w.drawType === "major");
  const featuredMajors = (majors.length > 0 ? majors : winners).slice(0, 5);

  return (
    <div className={cn("ta-results min-h-screen-svh pt-[60px] sm:pt-[70px]", archivo.variable, spaceMono.variable)}>
      <ResultsHero featuredMajors={featuredMajors} stats={stats} />
      <ResultsRegister winners={winners} />
      <WinnersWall winners={winners} totalWinners={stats.allWinners} />
      <HowChosen />
      <ResultsCTA />
    </div>
  );
}
