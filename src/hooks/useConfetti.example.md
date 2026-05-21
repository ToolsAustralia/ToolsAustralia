# useConfetti Hook

A reusable and scalable confetti effect hook for celebrating user actions and special moments.

## Installation

The hook uses `canvas-confetti` which is already installed in the project.

## Basic Usage

### 1. Auto-trigger on mount or condition

```tsx
import { useAutoConfetti } from "@/hooks/useConfetti";

function SuccessModal({ isOpen }) {
  // Automatically fires confetti when modal opens
  useAutoConfetti(isOpen, {
    duration: 2000,
    origin: "sides", // Shoots from left and right
  });

  return <div>Success!</div>;
}
```

### 2. Manual trigger with button click

```tsx
import { useConfetti } from "@/hooks/useConfetti";

function CelebrationButton() {
  const fireConfetti = useConfetti({
    origin: "center",
    colors: ["#ee0000", "#ff3333", "#ffa500"],
  });

  return (
    <button onClick={() => fireConfetti()}>
      🎉 Celebrate!
    </button>
  );
}
```

### 3. Standalone function (no hooks)

```tsx
import { fireConfettiEffect } from "@/hooks/useConfetti";

function handlePurchase() {
  // Fire confetti immediately
  fireConfettiEffect({
    duration: 3000,
    origin: "bottom",
    particleCount: 100,
  });
}
```

## Configuration Options

```typescript
interface ConfettiOptions {
  /** Duration in milliseconds (default: 2000) */
  duration?: number;
  
  /** Particle colors (default: red/orange brand colors) */
  colors?: string[];
  
  /** Particle count multiplier (default: 50) */
  particleCount?: number;
  
  /** Initial velocity (default: 30) */
  startVelocity?: number;
  
  /** Spread angle in degrees (default: 360) */
  spread?: number;
  
  /** Physics ticks (default: 60) */
  ticks?: number;
  
  /** Canvas z-index (default: 99999) */
  zIndex?: number;
  
  /** Origin point(s) */
  origin?: "sides" | "center" | "top" | "bottom" | { x: number; y: number } | Array<{ x: number; y: number }>;
  
  /** Delay before starting in ms (default: 0) */
  delay?: number;
  
  /** Interval between bursts in ms (default: 250) */
  interval?: number;
}
```

## Examples

### Example 1: Welcome Modal (Current Implementation)

```tsx
function PromoWelcomeModal({ isOpen }) {
  useAutoConfetti(isOpen, {
    duration: 2000,
    origin: "sides",
    colors: ["#ee0000", "#ff3333", "#ff6b6b", "#ffa500", "#ffcc00"],
  });
  
  return <Modal>Welcome!</Modal>;
}
```

### Example 2: Purchase Success

```tsx
function PurchaseSuccess({ show }) {
  useAutoConfetti(show, {
    duration: 3000,
    origin: "center",
    particleCount: 100,
    startVelocity: 45,
  });
  
  return <div>Purchase completed! 🎉</div>;
}
```

### Example 3: Multi-point Celebration

```tsx
function WinnerAnnouncement({ isWinner }) {
  useAutoConfetti(isWinner, {
    duration: 5000,
    origin: [
      { x: 0, y: 0 },      // Top left
      { x: 1, y: 0 },      // Top right
      { x: 0.5, y: 0.5 },  // Center
      { x: 0, y: 1 },      // Bottom left
      { x: 1, y: 1 },      // Bottom right
    ],
    particleCount: 80,
  });
  
  return <div>You won!</div>;
}
```

### Example 4: Button Click with Delay

```tsx
function SubmitButton() {
  const fireConfetti = useConfetti();

  const handleSubmit = () => {
    // Submit form...
    
    // Fire confetti after 500ms
    fireConfetti({ delay: 500 });
  };

  return <button onClick={handleSubmit}>Submit</button>;
}
```

### Example 5: Different Colors per Event

```tsx
function AchievementNotification({ type }) {
  const goldColors = ["#FFD700", "#FFA500", "#FF8C00"];
  const silverColors = ["#C0C0C0", "#A9A9A9", "#808080"];
  const bronzeColors = ["#CD7F32", "#B87333", "#A0522D"];

  useAutoConfetti(type === "gold", {
    colors: goldColors,
    origin: "top",
  });

  return <div>Achievement Unlocked!</div>;
}
```

### Example 6: Top-down Effect

```tsx
function RainingConfetti() {
  useAutoConfetti(true, {
    duration: 4000,
    origin: "top",
    spread: 180,
    startVelocity: 25,
    particleCount: 30,
  });

  return <div>It's raining confetti! ☂️</div>;
}
```

### Example 7: Combination with Other Actions

```tsx
function RewardModal({ isOpen, onClose }) {
  const fireConfetti = useConfetti({
    duration: 2500,
    origin: "center",
  });

  const handleClaim = () => {
    fireConfetti();
    setTimeout(() => {
      onClose();
      // Navigate or perform other actions
    }, 2000);
  };

  return (
    <Modal isOpen={isOpen}>
      <button onClick={handleClaim}>Claim Reward</button>
    </Modal>
  );
}
```

## Best Practices

1. **Use `useAutoConfetti` for automatic triggers** (modal open, success state)
2. **Use `useConfetti` for manual triggers** (button clicks, user actions)
3. **Use `fireConfettiEffect` in non-React contexts** (utils, services)
4. **Keep duration reasonable** (2-4 seconds for most cases)
5. **Match colors to your brand** or context (success = green, celebration = brand colors)
6. **Consider particle count** - more particles = more visual impact but may affect performance on low-end devices

## Performance Notes

- The confetti canvas is automatically cleaned up by the library
- Multiple simultaneous effects are supported
- Uses requestAnimationFrame for smooth 60fps animations
- Minimal performance impact even on mobile devices
