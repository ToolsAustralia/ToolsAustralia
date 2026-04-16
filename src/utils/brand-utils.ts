import { brandLogos, type BrandLogo, type BrandId } from "@/data/brandLogos";

const brandMap = new Map<BrandId, BrandLogo>(brandLogos.map((brand) => [brand.id, brand]));

export function getBrandMeta(brandId?: string) {
  if (!brandId) {
    return null;
  }
  return brandMap.get(brandId as BrandId) ?? null;
}

export const brandOptions = [...brandLogos]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((brand) => ({
    label: brand.name,
    value: brand.id,
  }));

export const defaultBrandLogo: BrandLogo = {
  id: "tools-australia",
  name: "Tools Australia",
  logo: "/images/Tools Australia Logo/Primary Logo.webp",
  gradient: "from-red-700 via-red-600 to-red-700",
  gradientDirection: "r",
  imageScale: 1,
  hasOverlay: false,
  overlayScale: 1,
};
