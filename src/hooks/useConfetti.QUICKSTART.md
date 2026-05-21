# 🎉 Confetti Hook - Quick Start

## 3 Ways to Use

### 1️⃣ Auto-trigger (Modal/State Change)
```tsx
import { useAutoConfetti } from "@/hooks/useConfetti";

useAutoConfetti(isOpen, { origin: "sides" });
```

### 2️⃣ Manual trigger (Button Click)
```tsx
import { useConfetti } from "@/hooks/useConfetti";

const fireConfetti = useConfetti();
<button onClick={() => fireConfetti()}>🎉</button>
```

### 3️⃣ Standalone (Outside Components)
```tsx
import { fireConfettiEffect } from "@/hooks/useConfetti";

fireConfettiEffect({ origin: "center", duration: 3000 });
```

## Common Patterns

### Sides (Left + Right) - **Default**
```tsx
useAutoConfetti(isOpen, { origin: "sides" });
```

### Center Burst
```tsx
useAutoConfetti(show, { origin: "center", particleCount: 100 });
```

### Rain from Top
```tsx
useAutoConfetti(true, { origin: "top", spread: 180 });
```

### Multi-point Explosion
```tsx
useAutoConfetti(winner, {
  origin: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0.5, y: 0.5 },
  ],
});
```

### Custom Colors
```tsx
useAutoConfetti(success, {
  colors: ["#00ff00", "#00cc00", "#008800"], // Green theme
});
```

### Delayed Effect
```tsx
const fire = useConfetti();
fire({ delay: 500 }); // Wait 500ms before starting
```

## All Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `duration` | number | 2000 | How long effect lasts (ms) |
| `colors` | string[] | Brand reds/oranges | Particle colors |
| `particleCount` | number | 50 | Particles per burst |
| `origin` | string/object | "sides" | Where confetti shoots from |
| `delay` | number | 0 | Wait before starting (ms) |
| `startVelocity` | number | 30 | How fast particles shoot |
| `spread` | number | 360 | Angle spread (degrees) |
| `zIndex` | number | 99999 | Canvas layer |

## Real Examples in Codebase

- **PromoWelcomeModal** - Sides burst on modal open
- **Add yours here!**
