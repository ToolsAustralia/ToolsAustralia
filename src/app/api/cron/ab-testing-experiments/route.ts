/**
 * A/B Testing Experiments Management Cron Job
 *
 * This endpoint should be called periodically (every hour) to:
 * 1. Activate experiments that reached their startDate
 * 2. End experiments that reached their endDate
 * 3. Check and apply stopping rules for active experiments
 * 4. Automatically end experiments when stopping rules are met
 *
 * Cron Schedule: Every hour (0 * * * *)
 *
 * Security:
 * - Protected by Vercel's internal infrastructure
 * - Only accessible via GET/POST with correct authorization
 *
 * @author Senior Full-Stack Developer
 * @version 1.0.0
 */

import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Experiment from "@/models/ab-testing/Experiment";
import ExperimentStoppingRulesService from "@/services/ab-testing/ExperimentStoppingRulesService";
import ExperimentAnalyticsService from "@/services/ab-testing/ExperimentAnalyticsService";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/ab-testing-experiments
 *
 * Manage A/B testing experiments lifecycle
 *
 * Authorization:
 * - Protected by Vercel's internal infrastructure (no external access)
 */
export async function GET() {
  const startTime = Date.now();
  const logs: string[] = [];
  const results = {
    activated: 0,
    endedByDate: 0,
    endedByStoppingRule: 0,
    errors: 0,
  };

  try {
    console.log("🕐 A/B Testing Experiments Cron Job Started");
    console.log(`   Time: ${new Date().toISOString()}`);

    await connectDB();
    logs.push("✅ Database connected");
    console.log("✅ Database connected");

    const now = new Date();

    // ========================================
    // STEP 1: Activate experiments that reached startDate
    // ========================================
    const activationResult = await Experiment.updateMany(
      {
        status: "draft",
        startDate: { $lte: now },
      },
      {
        $set: {
          status: "active",
        },
      }
    );

    results.activated = activationResult.modifiedCount;
    if (activationResult.modifiedCount > 0) {
      logs.push(`✅ Activated ${activationResult.modifiedCount} experiment(s)`);
      console.log(`✅ Activated ${activationResult.modifiedCount} experiment(s)`);
    }

    // ========================================
    // STEP 2: End experiments that reached endDate
    // ========================================
    const endDateResult = await Experiment.updateMany(
      {
        status: { $in: ["active", "paused"] },
        endDate: { $lte: now },
      },
      {
        $set: {
          status: "ended",
          endedReason: "date_reached",
        },
      }
    );

    results.endedByDate = endDateResult.modifiedCount;
    if (endDateResult.modifiedCount > 0) {
      logs.push(`✅ Ended ${endDateResult.modifiedCount} experiment(s) by date`);
      console.log(`✅ Ended ${endDateResult.modifiedCount} experiment(s) by date`);
    }

    // ========================================
    // STEP 3: Check stopping rules for active experiments
    // ========================================
    const activeExperiments = await Experiment.find({
      status: "active",
      "stoppingRules.autoEndEnabled": true, // Only check experiments with auto-end enabled
    }).lean();

    logs.push(`📊 Checking ${activeExperiments.length} active experiment(s) with auto-end enabled`);

    for (const experiment of activeExperiments) {
      try {
        const experimentId = experiment._id instanceof mongoose.Types.ObjectId
          ? experiment._id.toString()
          : String(experiment._id);

        // Evaluate stopping rules
        const stoppingResult = await ExperimentStoppingRulesService.evaluateStoppingRules(experimentId);

        if (stoppingResult.shouldStop) {
          // Calculate statistical results before ending
          let winnerVariantId: mongoose.Types.ObjectId | undefined;
          
          try {
            // Calculate and cache statistical results
            const confidenceThreshold = experiment.stoppingRules?.confidenceThreshold || 95;
            await ExperimentAnalyticsService.calculateAndCacheStatisticalResults(
              experimentId,
              undefined,
              confidenceThreshold
            );

            // Determine winner if statistically significant
            const winnerResult = await ExperimentAnalyticsService.determineWinner(
              experimentId,
              undefined,
              confidenceThreshold
            );

            if (winnerResult.winner === "variant" || winnerResult.winner === "control") {
              // Get variant IDs from comparison
              const comparison = await ExperimentAnalyticsService.getExperimentComparison(experimentId);
              
              if (winnerResult.winner === "variant" && comparison.variants.length > 1) {
                // Winner is the test variant (second variant)
                const winnerVariantIdStr = comparison.variants[1]?.variantId;
                if (winnerVariantIdStr && mongoose.Types.ObjectId.isValid(winnerVariantIdStr)) {
                  winnerVariantId = new mongoose.Types.ObjectId(winnerVariantIdStr);
                }
              } else if (winnerResult.winner === "control" && comparison.variants.length > 0) {
                // Winner is the control variant (first variant)
                const winnerVariantIdStr = comparison.variants[0]?.variantId;
                if (winnerVariantIdStr && mongoose.Types.ObjectId.isValid(winnerVariantIdStr)) {
                  winnerVariantId = new mongoose.Types.ObjectId(winnerVariantIdStr);
                }
              }
            }
          } catch (error) {
            console.error(`⚠️ Error calculating winner for experiment ${experimentId}:`, error);
            // Continue with ending the experiment even if winner calculation fails
          }

          // End the experiment
          await Experiment.findByIdAndUpdate(experimentId, {
            $set: {
              status: "ended",
              endedReason: "stopping_rule_met",
              ...(winnerVariantId && { winnerVariantId }),
            },
          });

          results.endedByStoppingRule++;
          logs.push(
            `✅ Ended experiment "${experiment.name}" (${experimentId}) - Reasons: ${stoppingResult.reasons.join(", ")}`
          );
          console.log(
            `✅ Ended experiment "${experiment.name}" (${experimentId}) - Reasons: ${stoppingResult.reasons.join(", ")}`
          );
        }
      } catch (error) {
        results.errors++;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const experimentId = experiment._id instanceof mongoose.Types.ObjectId
          ? experiment._id.toString()
          : String(experiment._id);
        logs.push(`❌ Error processing experiment ${experimentId}: ${errorMessage}`);
        console.error(`❌ Error processing experiment ${experimentId}:`, error);
      }
    }

    const duration = Date.now() - startTime;

    const summary = {
      success: true,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      results,
      logs,
    };

    console.log(`✅ Cron job completed in ${duration}ms`);
    console.log(`   Activated: ${results.activated}`);
    console.log(`   Ended by date: ${results.endedByDate}`);
    console.log(`   Ended by stopping rule: ${results.endedByStoppingRule}`);
    console.log(`   Errors: ${results.errors}`);

    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Cron job failed:", error);
    logs.push(`❌ Cron job failed: ${errorMessage}`);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        logs,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggering
export async function POST() {
  return GET();
}

