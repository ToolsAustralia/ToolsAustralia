"use client";
import { useEffect, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import type { EmblaOptionsType, EmblaCarouselType, EmblaPluginType } from "embla-carousel";

/**
 * Embla carousel wrapper.
 *
 * IMPORTANT — referential equality contract:
 * `useEmblaCarousel` reinitializes when `options` or `plugins` change by reference.
 * Callers MUST memoize both with `useMemo` to avoid plugin reinit storms.
 * This wrapper does NOT defensively re-memoize because doing so would require deep-compare
 * (a shallow `useMemo(() => options ?? {}, [options])` is a no-op on a fresh literal each render).
 */
interface EmblaCarouselProps {
  options?: EmblaOptionsType;
  plugins?: EmblaPluginType[];
  className?: string;
  containerClassName?: string;
  children: ReactNode;
  onApi?: (api: EmblaCarouselType) => void;
}

export function EmblaCarousel({
  options,
  plugins,
  className,
  containerClassName,
  children,
  onApi,
}: EmblaCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel(options ?? {}, plugins ?? []);

  useEffect(() => {
    if (emblaApi && onApi) onApi(emblaApi);
  }, [emblaApi, onApi]);

  return (
    <div
      className={className}
      ref={emblaRef}
      data-carousel="true"
      style={{ touchAction: "pan-y pinch-zoom" }}
    >
      <div className={containerClassName}>{children}</div>
    </div>
  );
}
