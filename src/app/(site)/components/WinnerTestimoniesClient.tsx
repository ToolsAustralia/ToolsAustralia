"use client";

import WinnersTestimony from "../winners/components/WinnersTestimony";
import { useWinnersFeed, WINNERS_FEED_LIMIT } from "@/hooks/queries/useWinnersQueries";

/**
 * Client component to fetch and display winner testimonies on the home page.
 * Uses the shared winners feed (useWinnersFeed) so this and the Latest Winners
 * board collapse onto a single request per page instead of two.
 */
export default function WinnerTestimoniesClient() {
  const { data: winners = [], isLoading: loading } = useWinnersFeed(WINNERS_FEED_LIMIT);

  // Only render if we have winners (loading state is handled by Suspense)
  if (loading || winners.length === 0) {
    return null;
  }

  return <WinnersTestimony winners={winners} />;
}

