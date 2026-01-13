import ExperimentRepository from "@/repositories/ab-testing/ExperimentRepository";
import VariantRepository from "@/repositories/ab-testing/VariantRepository";

/**
 * Get experiment and variant names for metadata
 */
export async function getExperimentMetadata(experimentId: string, variantId: string) {
  try {
    const [experiment, variant] = await Promise.all([
      ExperimentRepository.findById(experimentId),
      VariantRepository.findById(variantId),
    ]);

    return {
      experimentName: experiment?.name || null,
      variantName: variant?.name || null,
    };
  } catch (error) {
    console.error("Error fetching experiment metadata:", error);
    return {
      experimentName: null,
      variantName: null,
    };
  }
}

/**
 * Attach experiment metadata to event parameters
 */
export function attachExperimentMetadata(
  eventParams: Record<string, unknown>,
  experimentId: string | null,
  variantId: string | null
): Record<string, unknown> {
  if (!experimentId || !variantId) {
    return eventParams;
  }

  return {
    ...eventParams,
    experiment_id: experimentId,
    variant_id: variantId,
    // Note: experiment_name and variant_name would need to be fetched async
    // For now, we'll add them in the pixel integration layer where we can await
  };
}

