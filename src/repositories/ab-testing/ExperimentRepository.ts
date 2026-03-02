import connectDB from "@/lib/mongodb";
import Experiment, { IExperiment } from "@/models/ab-testing/Experiment";
import mongoose from "mongoose";

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
    
    const now = new Date();
    
    return Experiment.findOne({
      status: "active",
      slugTargets: { $in: [slug, "*"] },
      $and: [
        {
          $or: [
            { startDate: { $exists: false } },
            { startDate: { $lte: now } },
          ],
        },
        {
          $or: [
            { endDate: { $exists: false } },
            { endDate: { $gte: now } },
          ],
        },
      ],
    })
      .sort({ createdAt: -1 }) // Get most recent if multiple match
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

