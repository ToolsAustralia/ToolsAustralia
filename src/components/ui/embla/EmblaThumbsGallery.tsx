"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Fade from "embla-carousel-fade";
import ClassNames from "embla-carousel-class-names";
import type { EmblaOptionsType, EmblaCarouselType } from "embla-carousel";

export interface EmblaThumbsGalleryProps<T> {
  items: T[];
  renderMain: (item: T, index: number, isActive: boolean) => ReactNode;
  renderThumb: (item: T, index: number, isActive: boolean) => ReactNode;
  fade?: boolean;
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  onMainApi?: (api: EmblaCarouselType) => void;
  rootClassName?: string;
  mainClassName?: string;
  mainContainerClassName?: string;
  thumbsClassName?: string;
  thumbsContainerClassName?: string;
  slideClassName?: string;
  thumbSlideClassName?: string;
}

export function EmblaThumbsGallery<T>({
  items,
  renderMain,
  renderThumb,
  fade = false,
  initialIndex = 0,
  onIndexChange,
  onMainApi,
  rootClassName,
  mainClassName,
  mainContainerClassName = "flex",
  thumbsClassName,
  thumbsContainerClassName = "flex gap-2",
  slideClassName = "embla__slide flex-[0_0_100%] min-w-0",
  thumbSlideClassName = "embla__thumb flex-[0_0_auto]",
}: EmblaThumbsGalleryProps<T>) {
  const mainOptions = useMemo<EmblaOptionsType>(
    () => ({ loop: false, startIndex: initialIndex, duration: 25 }),
    [initialIndex]
  );
  const mainPlugins = useMemo(
    () => (fade ? [Fade(), ClassNames()] : [ClassNames()]),
    [fade]
  );
  const thumbsOptions = useMemo<EmblaOptionsType>(
    () => ({ containScroll: "keepSnaps" as const, dragFree: true }),
    []
  );
  const thumbsPlugins = useMemo(() => [ClassNames()], []);

  const [mainRef, mainApi] = useEmblaCarousel(mainOptions, mainPlugins);
  const [thumbsRef, thumbsApi] = useEmblaCarousel(thumbsOptions, thumbsPlugins);
  const [selected, setSelected] = useState(initialIndex);

  const onSelect = useCallback(() => {
    if (!mainApi || !thumbsApi) return;
    const i = mainApi.selectedScrollSnap();
    setSelected(i);
    thumbsApi.scrollTo(i);
    onIndexChange?.(i);
  }, [mainApi, thumbsApi, onIndexChange]);

  useEffect(() => {
    if (!mainApi) return;
    onSelect();
    mainApi.on("select", onSelect);
    mainApi.on("reInit", onSelect);
    return () => {
      mainApi.off("select", onSelect);
      mainApi.off("reInit", onSelect);
    };
  }, [mainApi, onSelect]);

  useEffect(() => {
    if (mainApi && onMainApi) onMainApi(mainApi);
  }, [mainApi, onMainApi]);

  const onThumbClick = useCallback(
    (i: number) => mainApi?.scrollTo(i),
    [mainApi]
  );

  return (
    <div className={rootClassName}>
      <div
        className={mainClassName}
        ref={mainRef}
        data-carousel="true"
        style={{ touchAction: "pan-y pinch-zoom" }}
      >
        <div className={mainContainerClassName}>
          {items.map((it, i) => (
            <div key={i} className={slideClassName}>
              {renderMain(it, i, i === selected)}
            </div>
          ))}
        </div>
      </div>
      <div
        className={thumbsClassName}
        ref={thumbsRef}
        style={{ touchAction: "pan-y pinch-zoom" }}
      >
        <div className={thumbsContainerClassName}>
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onThumbClick(i)}
              className={thumbSlideClassName}
              aria-current={i === selected}
            >
              {renderThumb(it, i, i === selected)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
