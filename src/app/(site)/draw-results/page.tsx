import { Metadata } from "next";
import MembershipSection from "@/components/sections/MembershipSection";
import { Trophy, Bell, Users, Zap } from "lucide-react";
import WinnerAnnouncement from "./components/WinnerAnnouncement";
import CountdownHero from "./components/CountdownHero";
import CompletedDrawsSection from "./components/CompletedDrawsSection";
import connectDB from "@/lib/mongodb";
import MiniDraw from "@/models/MiniDraw";
import Winner from "@/models/Winner";
import { WinnerSummary } from "@/types/winner";
import DrawResultCard from "./components/DrawResultCard";
import { Types } from "mongoose";

export const metadata: Metadata = {
  title: "Draw Results | Tools Australia",
  description:
    "View the results of completed mini draws and see who won amazing tools and equipment. Check if you're a winner!",
};

async function getRecentMiniDrawWinners(limit = 8): Promise<WinnerSummary[]> {
  try {
    await connectDB();
    // We rely on the Winner collection so the gallery still works after draws are reopened
    const winners = await Winner.find({ drawType: "mini" }).sort({ selectedDate: -1 }).limit(limit).lean();

    if (winners.length === 0) {
      return [];
    }

    const drawIds = winners.map((winner) => winner.drawId);
    const draws = await MiniDraw.find({ _id: { $in: drawIds } })
      .select("_id name prize")
      .lean();
    // Build a quick lookup so we can decorate each winner with the current draw name
    const drawMap = new Map(
      draws.map((draw) => {
        const id = (draw._id as Types.ObjectId).toString();
        return [id, { name: draw.name, prize: draw.prize }];
      })
    );

    return winners.map((winner) => {
      const drawId = (winner.drawId as Types.ObjectId).toString();
      const drawRecord = drawMap.get(drawId);
      const prizeSnapshot = winner.prizeSnapshot ||
        drawRecord?.prize || {
          name: drawRecord?.name ?? "Mini Draw",
          description: "",
          value: 0,
          images: [],
        };

      return {
        id: (winner._id as Types.ObjectId).toString(),
        drawId,
        drawName: drawRecord?.name ?? prizeSnapshot.name,
        drawType: "mini",
        prize: {
          name: prizeSnapshot.name,
          description: prizeSnapshot.description,
          value: prizeSnapshot.value ?? 0,
          images: prizeSnapshot.images ?? [],
        },
        entryNumber: winner.entryNumber,
        selectedDate: winner.selectedDate.toISOString(),
        imageUrl: winner.imageUrl,
        selectedBy: winner.selectedBy ? (winner.selectedBy as Types.ObjectId).toString() : undefined,
        cycle: winner.cycle ?? 1,
      } satisfies WinnerSummary;
    });
  } catch (error) {
    console.error("Error fetching recent mini draw winners:", error);
    return [];
  }
}

export default async function DrawResultsPage() {
  const recentWinners = await getRecentMiniDrawWinners();

  return (
    <div className="min-h-screen-svh bg-white pt-[50px] sm:pt-[60px]">
      {/* Countdown Hero Section */}
      <CountdownHero />

      <div className="bg-gray-50 ">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 lg:py-12 ">
          {/* Completed Major Draws Section */}
          <CompletedDrawsSection className="mb-4 sm:mb-8" />

          {/* Draw Results - Only show if there are completed draws */}
          {recentWinners.length > 0 && (
            <section className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-red-600 to-red-700 rounded-xl shadow-lg">
                    <Trophy className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 font-['Poppins']">Completed Mini Draws</h2>
                    <p className="text-gray-600">Browse through all finished competitions</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-[#ee0000]/10 text-[#ee0000] px-4 py-2 rounded-full text-sm font-bold">
                    {recentWinners.length} Winners
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                {recentWinners.map((winner) => (
                  <DrawResultCard key={winner.id} winner={winner} />
                ))}
              </div>
            </section>
          )}

          {/* How Winners Are Selected */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-200/50 px-6 py-4 ">
            <div className="text-center mb-8">
              <div className="flex items-center justify-center mb-4"></div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 font-['Poppins'] mb-3">
                How Winners Are Selected
              </h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Our fair and transparent selection process ensures every participant has an equal chance
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
              <div className="text-center group">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-red-600 to-red-700 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform duration-300 shadow-lg">
                  <Zap className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3 font-['Poppins']">Random Selection</h3>
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                  Random draw system and methodology is government certified
                </p>
              </div>
              <div className="text-center group">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-green-600 to-green-700 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform duration-300 shadow-lg">
                  <Users className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3 font-['Poppins']">Fair Process</h3>
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                  Winners selected through government certified digital system, RandomDraws.
                </p>
              </div>
              <div className="text-center group">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform duration-300 shadow-lg">
                  <Bell className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3 font-['Poppins']">Winner Notification</h3>
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                  Live streamed on Facebook! All participants will be notified of the winners via social media, sms or
                  email!
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Membership Section */}
      <MembershipSection
        title="JOIN FUTURE MINI DRAWS WITH PREMIUM MEMBERSHIP"
        padding="py-4 sm:py-8 lg:py-12 lg:pb-16 mb-8 sm:mb-16 "
      />
    </div>
  );
}
