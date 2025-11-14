<!-- 221057d1-0b5d-4f9a-9d48-48e960d4cab4 96aeb3e6-04e5-4dcf-8473-3fe0aba98067 -->
# Cinematic Pricing Cards Redesign

## Overview

Update existing package display components with premium, cinematic design using metallic gradients, glowing effects, and color-coded tiers.

## Components to Update

### 1. MembershipSection.tsx (`src/components/sections/MembershipSection.tsx`)

- Replace current card design with cinematic rounded-3xl cards
- Add radial gradient background: `from-slate-900 via-slate-800 to-slate-900`
- Implement metallic color accents per package tier:
  - **Apprentice**: Metallic yellow (`from-yellow-500 via-yellow-600 to-amber-600`)
  - **Tradie**: Metallic blue (`from-blue-600 via-blue-500 to-cyan-600`)
  - **Foreman**: Metallic purple (`from-purple-600 via-purple-500 to-indigo-600`)
  - **Boss**: Metallic gold (`from-yellow-400 via-amber-500 to-yellow-600`)
  - **Power**: Metallic orange (`from-orange-600 via-red-500 to-orange-700`)
- Add `shadow-[0_0_20px_rgba(0,0,0,0.6)]` for depth
- Apply gradient borders with color matching package tier
- Center package icons at top with glow effect using `drop-shadow-[0_0_10px_rgba(color,0.5)]`
- Icon mapping:
  - Apprentice Pack → yellowHardhat.png
  - Tradie Pack → hardhat.png
  - Foreman Pack → hammerWrench.png
  - Boss Pack → goldCrown.png
  - Power Pack → battery.png
- Hover effects: `scale-105`, intensified glow
- Responsive grid: `grid-cols-1 md:grid-cols-3 xl:grid-cols-5`
- High contrast typography with letter spacing

### 2. PackageSelectionModal.tsx (`src/components/modals/PackageSelectionModal.tsx`)

- Apply same cinematic design system as MembershipSection
- Ensure modal-friendly spacing and sizing
- Match color accents and metallic gradients
- Include icons with glow effects
- Maintain existing promo badge integration
- Update both subscription and one-time package displays

## Design System

### Color Palette (Metallic)

```
Apprentice: bg-gradient-to-br from-yellow-500 via-yellow-600 to-amber-600
Tradie:     bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-600  
Foreman:    bg-gradient-to-br from-purple-600 via-purple-500 to-indigo-600
Boss:       bg-gradient-to-br from-yellow-400 via-amber-500 to-yellow-600
Power:      bg-gradient-to-br from-orange-600 via-red-500 to-orange-700
```

### Card Structure

- Container: `rounded-3xl shadow-[0_0_20px_rgba(0,0,0,0.6)] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900`
- Border: Gradient border matching package color
- Icon: Centered top, size ~80-100px, with color-matched glow
- Title: Sans-serif, high letter-spacing, white text
- Price: Large, bold, color-matched gradient text
- Features: Clean list with checkmarks
- Button: Matching metallic gradient with hover effects

### Hover Effects

- Transform: `scale-105`
- Shadow: Intensify to `shadow-[0_0_30px_rgba(color,0.8)]`
- Transition: `duration-300 ease-out`

## Implementation Notes

- Keep existing functionality (promo badges, selection logic, etc.)
- Maintain responsive breakpoints
- Preserve all props and data flow
- Update only visual styling, not business logic
- Ensure accessibility (contrast ratios, focus states)

### To-dos

- [ ] Update MembershipSection.tsx with cinematic card design, metallic gradients, and package-specific colors
- [ ] Update PackageSelectionModal.tsx with matching cinematic design system
- [ ] Verify responsive grid layout works across all breakpoints (mobile, tablet, desktop)