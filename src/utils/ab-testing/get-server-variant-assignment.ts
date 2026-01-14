import { cookies, headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";
import VariantAssignmentService from "@/services/ab-testing/VariantAssignmentService";
import VariantRepository from "@/repositories/ab-testing/VariantRepository";
import VariantConfigService from "@/services/ab-testing/VariantConfigService";
import { VariantConfig } from "@/models/ab-testing/Variant";

interface ServerVariantAssignment {
  variantId: string | null;
  variantConfig: VariantConfig | null;
  anonymousId: string | null;
  isPreview?: boolean;
}

/**
 * Get variant assignment server-side (for SSR optimization)
 * This allows passing initial variant config to avoid client-side fetch on first render
 * 
 * Note: This is a best-effort function. If it fails, client-side fallback will handle it.
 */
export async function getServerVariantAssignment(
  experimentId: string | null,
  slug: string
): Promise<ServerVariantAssignment | null> {
  if (!experimentId) {
    return {
      variantId: null,
      variantConfig: null,
      anonymousId: null,
    };
  }

  try {
    // Get session (if logged in)
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const isAdmin = session?.user?.role === "admin";

    // Get cookies
    const cookieStore = await cookies();
    
    // Check for preview mode cookie (admin only)
    const previewCookieName = `ta_ab_preview_${experimentId}`;
    const previewVariantId = cookieStore.get(previewCookieName)?.value;

    if (previewVariantId && isAdmin) {
      // Preview mode: Return preview variant without creating assignment
      const previewVariant = await VariantRepository.findById(previewVariantId);
      if (!previewVariant) {
        return null;
      }

      // Merge config with defaults
      const defaultConfig = VariantConfigService.getDefaultConfig();
      const mergedConfig = VariantConfigService.mergeVariantConfig(defaultConfig, previewVariant.config);

      // Get anonymous ID
      const anonymousIdCookie = cookieStore.get("ta_anon_id");
      const anonymousId = anonymousIdCookie?.value && anonymousIdCookie.value.startsWith("anon_")
        ? anonymousIdCookie.value
        : null;

      return {
        variantId: previewVariantId,
        variantConfig: mergedConfig,
        anonymousId,
        isPreview: true,
      };
    }

    // Get anonymous ID from cookie
    const anonymousIdCookie = cookieStore.get("ta_anon_id");
    const anonymousId = anonymousIdCookie?.value && anonymousIdCookie.value.startsWith("anon_")
      ? anonymousIdCookie.value
      : null;

    // Try to get existing assignment (don't create new one server-side to avoid race conditions)
    if (userId || anonymousId) {
      const assignment = await VariantAssignmentService.getAssignedVariant(
        experimentId,
        userId || undefined,
        anonymousId || undefined
      );

      if (assignment) {
        // Get variant config
        const variant = await VariantRepository.findById(assignment.variantId);
        if (variant) {
          // Merge config with defaults
          const defaultConfig = VariantConfigService.getDefaultConfig();
          const mergedConfig = VariantConfigService.mergeVariantConfig(defaultConfig, variant.config);

          return {
            variantId: assignment.variantId,
            variantConfig: mergedConfig,
            anonymousId,
          };
        }
      }
    }

    // No existing assignment found - return null (client will create assignment)
    return {
      variantId: null,
      variantConfig: null,
      anonymousId,
    };
  } catch (error) {
    // Silently fail - client-side fallback will handle it
    console.error("[A/B Testing] Server-side variant assignment failed:", error);
    return null;
  }
}

