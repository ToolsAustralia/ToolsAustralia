"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const ALLOW: RegExp[] = [
  /^\/$/,
  /^\/promotions/,
  /^\/winners/,
  /^\/draw-results/,
  /^\/mini-draws/,
];

const FloatingPromoBanner = dynamic(
  () => import("@/components/banners/FloatingPromoBanner"),
  { ssr: false }
);

export default function FloatingPromoBannerHost() {
  const pathname = usePathname();
  const show = ALLOW.some((re) => re.test(pathname ?? ""));
  return show ? <FloatingPromoBanner /> : null;
}
