"use client";

import { useEffect, useState } from "react";
import WinnerTestimonySection from "@/components/sections/WinnerTestimonySection";
import type { WinnerCardData } from "@/components/cards/WinnerCard";

/**
 * Client component to fetch and display winner testimonies on the home page
 * This is separated from the server component to allow client-side data fetching
 */
export default function WinnerTestimoniesClient() {
  const [winners, setWinners] = useState<WinnerCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWinners = async () => {
      try {
        const response = await fetch("/api/winners/all?limit=100");
        const data = await response.json();

        if (data.success && data.winners) {
          setWinners(data.winners);
        }
      } catch (error) {
        console.error("Error fetching winners:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchWinners();
  }, []);

  // Only render if we have winners (loading state is handled by Suspense)
  if (loading || winners.length === 0) {
    return null;
  }

  return <WinnerTestimonySection winners={winners} />;
}

