import { useEffect, useCallback } from "react";
import confetti from "canvas-confetti";

export interface ConfettiOptions {
  /**
   * Duration of the confetti effect in milliseconds
   * @default 2000
   */
  duration?: number;
  /**
   * Colors for the confetti particles
   * @default ["#ee0000", "#ff3333", "#ff6b6b", "#ffa500", "#ffcc00"]
   */
  colors?: string[];
  /**
   * Particle count multiplier (higher = more particles)
   * @default 50
   */
  particleCount?: number;
  /**
   * Initial velocity of particles
   * @default 30
   */
  startVelocity?: number;
  /**
   * Spread angle in degrees
   * @default 360
   */
  spread?: number;
  /**
   * Number of ticks for particle physics
   * @default 60
   */
  ticks?: number;
  /**
   * Z-index for the confetti canvas
   * @default 99999
   */
  zIndex?: number;
  /**
   * Origin point(s) for confetti
   * @default "sides" - shoots from left and right
   * "center" - shoots from center
   * "top" - shoots from top center
   * "bottom" - shoots from bottom center
   * custom - provide { x: number, y: number } for single origin
   * custom array - provide array of origins for multiple sources
   */
  origin?: "sides" | "center" | "top" | "bottom" | { x: number; y: number } | Array<{ x: number; y: number }>;
  /**
   * Delay before starting the confetti effect in milliseconds
   * @default 0
   */
  delay?: number;
  /**
   * Interval between confetti bursts in milliseconds
   * @default 250
   */
  interval?: number;
}

const defaultOptions: Required<Omit<ConfettiOptions, "origin" | "delay">> = {
  duration: 2000,
  colors: ["#ee0000", "#ff3333", "#ff6b6b", "#ffa500", "#ffcc00"],
  particleCount: 50,
  startVelocity: 30,
  spread: 360,
  ticks: 60,
  zIndex: 99999,
  interval: 250,
};

/**
 * Custom hook for triggering confetti effects
 * Returns a trigger function that can be called manually
 */
export function useConfetti(options?: ConfettiOptions) {
  const opts = { ...defaultOptions, ...options };

  const fireConfetti = useCallback(
    (customOptions?: Partial<ConfettiOptions>) => {
      const finalOpts = { ...opts, ...customOptions };
      const { duration, colors, particleCount, startVelocity, spread, ticks, zIndex, origin, delay, interval } =
        finalOpts;

      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity, spread, ticks, zIndex };

      const origins = (() => {
        if (!origin || origin === "sides") {
          return [
            { x: 0, y: 0.6 },
            { x: 1, y: 0.6 },
          ];
        }
        if (origin === "center") {
          return [{ x: 0.5, y: 0.5 }];
        }
        if (origin === "top") {
          return [{ x: 0.5, y: 0 }];
        }
        if (origin === "bottom") {
          return [{ x: 0.5, y: 1 }];
        }
        if (Array.isArray(origin)) {
          return origin;
        }
        return [origin];
      })();

      const startAnimation = () => {
        const intervalId = setInterval(() => {
          const timeLeft = animationEnd - Date.now();

          if (timeLeft <= 0) {
            clearInterval(intervalId);
            return;
          }

          const particles = particleCount * (timeLeft / duration);

          origins.forEach((originPoint) => {
            confetti({
              ...defaults,
              particleCount: particles,
              origin: originPoint,
              colors,
            });
          });
        }, interval);

        return intervalId;
      };

      if (delay && delay > 0) {
        const timeoutId = setTimeout(() => {
          startAnimation();
        }, delay);
        return () => clearTimeout(timeoutId);
      } else {
        const intervalId = startAnimation();
        return () => clearInterval(intervalId);
      }
    },
    [opts]
  );

  return fireConfetti;
}

/**
 * Hook that automatically triggers confetti when a condition is met
 * Useful for triggering confetti on mount or when a specific condition becomes true
 */
export function useAutoConfetti(trigger: boolean, options?: ConfettiOptions) {
  const fireConfetti = useConfetti(options);

  useEffect(() => {
    if (!trigger) return;

    const cleanup = fireConfetti();
    return cleanup;
  }, [trigger, fireConfetti]);
}

/**
 * Standalone function to fire confetti without using hooks
 * Useful for event handlers and callbacks
 */
export function fireConfettiEffect(options?: ConfettiOptions) {
  const opts = { ...defaultOptions, ...options };
  const { duration, colors, particleCount, startVelocity, spread, ticks, zIndex, origin, interval } = opts;

  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity, spread, ticks, zIndex };

  const origins = (() => {
    if (!origin || origin === "sides") {
      return [
        { x: 0, y: 0.6 },
        { x: 1, y: 0.6 },
      ];
    }
    if (origin === "center") {
      return [{ x: 0.5, y: 0.5 }];
    }
    if (origin === "top") {
      return [{ x: 0.5, y: 0 }];
    }
    if (origin === "bottom") {
      return [{ x: 0.5, y: 1 }];
    }
    if (Array.isArray(origin)) {
      return origin;
    }
    return [origin];
  })();

  const intervalId = setInterval(() => {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      clearInterval(intervalId);
      return;
    }

    const particles = particleCount * (timeLeft / duration);

    origins.forEach((originPoint) => {
      confetti({
        ...defaults,
        particleCount: particles,
        origin: originPoint,
        colors,
      });
    });
  }, interval);

  return () => clearInterval(intervalId);
}
