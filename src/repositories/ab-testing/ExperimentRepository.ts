import connectDB from "@/lib/mongodb";
import Experiment, { IExperiment } from "@/models/ab-testing/Experiment";
import mongoose from "mongoose";

/**
 * Build the "active experiment" match for a slug.
 *
 * `allowWildcard` is the whole point of this helper. Page lookups must keep
 * matching `"*"` (an "All Pages" experiment legitimately applies to a prize
 * page). Sentinel lookups must NOT: `findOne` returns the newest match, so an
 * active wildcard experiment would be returned for `__promo-theme__`, and the
 * caller would bake an unrelated experiment's id — holding promo traffic on a
 * config with no promoTheme and polluting that experiment with sentinel-tagged
 * page_view rows. Post-filtering cannot recover from it.
 */
export function buildActiveExperimentQuery(
  slug: string,
  opts: { allowWildcard: boolean },
  now: Date,
): Record<string, unknown> {
  return {
    status: "active",
    slugTargets: opts.allowWildcard ? { $in: [slug, "*"] } : slug,
    $and: [
      { $or: [{ startDate: { $exists: false } }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: { $exists: false } }, { endDate: { $gte: now } }] },
    ],
  };
}

/**
 * Experiment Repository
 * Handles all database operations for experiments
 */
export class ExperimentRepository {
  /**
   * Find experiment by ID
   */
  async findById(id: string): Promise<IExperiment | null> {
    await connectDB();
    return Experiment.findById(id).exec();
  }

  /**
   * Find active experiment matching a slug
   */
  async findActiveBySlug(slug: string): Promise<IExperiment | null> {
    await connectDB();
    return Experiment.findOne(buildActiveExperimentQuery(slug, { allowWildcard: true }, new Date()))
      .sort({ createdAt: -1 }) // Get most recent if multiple match
      .exec();
  }

  /**
   * Find an active experiment by SENTINEL slug (e.g. `__promo-theme__`).
   * Exact array-membership only — never matches `"*"`. See the note on
   * buildActiveExperimentQuery.
   */
  async findActiveBySentinelSlug(slug: string): Promise<IExperiment | null> {
    await connectDB();
    return Experiment.findOne(buildActiveExperimentQuery(slug, { allowWildcard: false }, new Date()))
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find all experiments with pagination and filtering
   */
  async findAll(filters: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }): Promise<{ experiments: IExperiment[]; total: number; page: number; limit: number }> {
    await connectDB();

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 25, 100);
    const skip = (page - 1) * limit;
    const sortBy = filters.sortBy || "createdAt";
    const sortOrder = filters.sortOrder === "asc" ? 1 : -1;

    // Build query
    const query: Record<string, unknown> = {};

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.search) {
      query.name = { $regex: filters.search, $options: "i" };
    }

    const [experiments, total] = await Promise.all([
      Experiment.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .populate("createdBy", "firstName lastName email")
        .exec(),
      Experiment.countDocuments(query).exec(),
    ]);

    return {
      experiments,
      total,
      page,
      limit,
    };
  }

  /**
   * Create new experiment
   */
  async create(data: {
    name: string;
    status: "draft" | "active" | "paused" | "ended";
    slugTargets: string[];
    startDate?: Date;
    endDate?: Date;
    createdBy: mongoose.Types.ObjectId;
  }): Promise<IExperiment> {
    await connectDB();
    return Experiment.create(data);
  }

  /**
   * Update experiment
   */
  async update(id: string, data: Partial<IExperiment>): Promise<IExperiment | null> {
    await connectDB();
    return Experiment.findByIdAndUpdate(id, data, { new: true, runValidators: true }).exec();
  }

  /**
   * Soft delete experiment (set status to ended)
   */
  async delete(id: string): Promise<IExperiment | null> {
    await connectDB();
    return Experiment.findByIdAndUpdate(id, { status: "ended" }, { new: true }).exec();
  }
}

const experimentRepository = new ExperimentRepository();
export default experimentRepository;

