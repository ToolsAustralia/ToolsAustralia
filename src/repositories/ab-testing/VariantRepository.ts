import connectDB from "@/lib/mongodb";
import Variant, { IVariant } from "@/models/ab-testing/Variant";

/**
 * Variant Repository
 * Handles all database operations for variants
 */
export class VariantRepository {
  /**
   * Find all variants for an experiment
   */
  async findByExperimentId(experimentId: string): Promise<IVariant[]> {
    await connectDB();
    return Variant.find({ experimentId }).sort({ isControl: -1, createdAt: 1 }).exec();
  }

  /**
   * Find variant by ID
   */
  async findById(id: string): Promise<IVariant | null> {
    await connectDB();
    return Variant.findById(id).exec();
  }

  /**
   * Create variant
   */
  async create(data: {
    experimentId: string;
    name: string;
    trafficPercentage: number;
    config: unknown;
    isControl: boolean;
  }): Promise<IVariant> {
    await connectDB();
    return Variant.create(data);
  }

  /**
   * Update variant
   */
  async update(id: string, data: Partial<IVariant>): Promise<IVariant | null> {
    await connectDB();
    return Variant.findByIdAndUpdate(id, data, { new: true, runValidators: true }).exec();
  }

  /**
   * Delete variant
   */
  async delete(id: string): Promise<IVariant | null> {
    await connectDB();
    return Variant.findByIdAndDelete(id).exec();
  }

  /**
   * Validate that traffic split sums to 100%
   */
  async validateTrafficSplit(experimentId: string): Promise<{ valid: boolean; total: number; message?: string }> {
    await connectDB();
    
    const variants = await Variant.find({ experimentId }).exec();
    const total = variants.reduce((sum, variant) => sum + variant.trafficPercentage, 0);
    
    if (Math.abs(total - 100) > 0.01) {
      // Allow small floating point differences
      return {
        valid: false,
        total,
        message: `Traffic split must sum to 100%. Current total: ${total}%`,
      };
    }
    
    return { valid: true, total };
  }
}

export default new VariantRepository();

