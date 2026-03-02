# Upsell Image Selector System

## Overview

The Upsell Image Selector system dynamically selects promotional images for upsell offers based on:
- Active promo multiplier (2x, 3x, 5x, 10x for one-time Plus/Upgrade; 2x, 3x, 5x, 10x for membership Package images; 2X Package images upcoming)
- Package type (membership vs one-time vs mini-draw)
- Upsell category (subscription-plus, one-time-plus, additional-upgrade)

This system ensures that the correct promotional images are displayed based on the active promo campaign and the type of purchase that triggered the upsell.

---

## Problem Statement

### Original Issues

1. **Incorrect Image Selection**: Subscription-plus upsells (e.g., "tradie-plus-package") were showing base images instead of 10X promo images when 10X promo was active for membership packages.

2. **Wrong Package Type Detection**: When `originalPurchaseContext` was missing, the system defaulted to `"one-time"` for all upsells, causing subscription-plus packages to use one-time multipliers (2X/3X) instead of membership multipliers (10X).

3. **Category Mismatch**: The system relied solely on `extractPackageInfo(offerId)` to determine image category, which didn't account for the actual business category (`subscription-plus`, `one-time-plus`, `additional-upgrade`).

4. **File Naming Inconsistencies**: The system uses consistent uppercase X for all promo images:
   - Membership packages: `10X {Package} Package.png`
   - One-time plus: `2X {Package} Plus.png`
   - Additional upgrades: `2X {Package} Upgrade.png`

---

## Architecture & Separation of Concerns

### File Structure

```
src/
├── utils/
│   └── upsell/
│       └── upsell-image-selector.ts    # Core image selection logic
└── components/
    └── modals/
        └── UpsellModal.tsx              # UI component that uses the selector
```

### Component Responsibilities

#### 1. `upsell-image-selector.ts` - Core Utility Module

**Responsibility**: Pure utility functions for image path selection logic.

**Exports**:
- `getUpsellImagePath(params: UpsellImageParams): string` - Main public API

**Internal Functions**:
- `getImageCategoryFromUpsellCategory()` - Maps business categories to image categories
- `extractPackageInfo()` - Extracts package name from offerId (legacy support)
- `getBaseImagePath()` - Returns base image paths (no promo)
- `getPromoImagePath()` - Constructs promo-specific image paths with correct casing

**Key Principles**:
- ✅ **Pure Functions**: No side effects, deterministic output
- ✅ **Single Responsibility**: Each function has one clear purpose
- ✅ **Type Safety**: Strong TypeScript typing throughout
- ✅ **Fallback Logic**: Graceful degradation when data is missing

#### 2. `UpsellModal.tsx` - UI Component

**Responsibility**: Determines context and calls the utility function.

**Key Logic**:
- Determines `packageType` from purchase context or upsell category
- Resolves promo multiplier based on package type
- Passes all parameters to `getUpsellImagePath()`

**Key Principles**:
- ✅ **Context Awareness**: Uses `originalPurchaseContext` when available
- ✅ **Smart Fallbacks**: Infers package type from upsell category
- ✅ **Debug Logging**: Comprehensive logging for troubleshooting

---

## Feature Changes

### Feature 1: Category-Based Image Category Mapping

**File**: `src/utils/upsell/upsell-image-selector.ts`

**Function**: `getImageCategoryFromUpsellCategory()`

**Purpose**: Maps business categories to image file categories.

**Logic**:
```typescript
subscription-plus + membership → "Package" (for 10X images)
one-time-plus + one-time → "Pack" (becomes "Plus" in filename)
additional-upgrade + one-time → "Upgrade" (for upgrade images)
```

**Why**: Ensures the correct image category is used based on business logic, not just offerId patterns.

**Separation of Concerns**: 
- This function is purely about mapping business categories to technical image categories
- No file path construction happens here
- No promo multiplier logic

---

### Feature 2: Priority-Based Package Type Detection

**File**: `src/components/modals/UpsellModal.tsx`

**Function**: `getUpsellImagePathValue()`

**Purpose**: Determines the correct package type when `originalPurchaseContext` is missing.

**Priority Order**:
1. `originalPurchaseContext?.packageType` (most reliable - from actual purchase)
2. Upsell category inference:
   - `category === "subscription-plus"` → `packageType = "membership"`
   - `category === "one-time-plus"` or `"additional-upgrade"` → `packageType = "one-time"`
3. `offer.category` (fallback)
4. Default to `"one-time"` (last resort)

**Why**: Subscription-plus upsells are only shown after membership purchases, so we can safely infer `packageType = "membership"` from the category.

**Separation of Concerns**:
- Package type determination is separate from image path construction
- Business logic (what triggers what) is separate from technical implementation
- Context resolution is separate from multiplier resolution

---

### Feature 3: Membership 10X Image Detection

**File**: `src/utils/upsell/upsell-image-selector.ts`

**Function**: `getUpsellImagePath()`

**Purpose**: Ensures membership packages with 10X promo always get promo images.

**Key Changes**:
1. **Early Check**: Membership 10X check happens FIRST, before null checks
2. **Multiple Detection Methods**:
   - Explicit `category === "subscription-plus"`
   - `extractedInfo.imageCategory === "Package"` (from offerId)
   - `offerId.endsWith("-plus-package")` (pattern match)

**Why**: Prevents fallthrough to base images when 10X promo is active.

**Separation of Concerns**:
- Membership-specific logic is isolated in its own conditional block
- Detection methods are clearly separated and documented
- Early return prevents interference with other logic

---

### Feature 4: Correct File Naming Convention

**File**: `src/utils/upsell/upsell-image-selector.ts`

**Function**: `getPromoImagePath()`

**Purpose**: Constructs image filenames with correct casing.

**Conventions**:
- **Membership/Package**: `${multiplier}X ${packageName} Package.png` (uppercase X)
- **One-time Plus**: `${multiplier}X ${packageName} Plus.png` (uppercase X)
- **Additional Upgrade**: `${multiplier}X ${packageName} Upgrade.png` (uppercase X)

**Why**: Matches actual file naming in `public/images/upsells/active-promo/`.

**Separation of Concerns**:
- File naming logic is isolated in one function
- Casing rules are clearly documented
- No business logic mixed with file path construction

---

### Feature 5: Debug Logging

**Files**: 
- `src/utils/upsell/upsell-image-selector.ts`
- `src/components/modals/UpsellModal.tsx`

**Purpose**: Comprehensive logging for troubleshooting image selection issues.

**What's Logged**:
1. **UpsellModal**: All input parameters, resolved multipliers, package type determination source
2. **upsell-image-selector**: Function parameters, extracted info, membership 10X check results, subscription-plus detection

**Why**: Helps diagnose issues when images aren't displaying correctly.

**Separation of Concerns**:
- Debug logging is clearly marked with `🔍 DEBUG:` prefix
- Logging doesn't affect business logic
- Can be easily removed or toggled in production

---

## Data Flow

```
Purchase Event
    ↓
UpsellModal.getUpsellImagePathValue()
    ↓
1. Get upsellPackage.category
2. Determine packageType (priority-based)
3. Resolve promoMultiplier (based on packageType)
    ↓
getUpsellImagePath({ offerId, packageType, promoMultiplier, category })
    ↓
1. Extract packageName from offerId
2. Map category to imageCategory
3. Check membership 10X (early return if match)
4. Check one-time 2X/3X/5X/10X
5. Fallback to base images
    ↓
getPromoImagePath(multiplier, packageName, imageCategory)
    ↓
Construct filename with correct casing
    ↓
Return: /images/upsells/active-promo/{filename}
```

---

## Image File Naming Convention

### Directory Structure

```
public/images/upsells/
├── {Base Images}                    # No promo active
│   ├── Tradie Package.png
│   ├── Tradie Plus.png
│   └── Tradie Upgrade.png
└── active-promo/                    # Promo active
    ├── 2X Boss Package.png          # Membership 2X (upcoming)
    ├── 3X Boss Package.png          # Membership 3X
    ├── 5X Boss Package.png          # Membership 5X
    ├── 10X Boss Package.png         # Membership 10X
    ├── 3X Foreman Package.png
    ├── 5X Foreman Package.png
    ├── 10X Foreman Package.png
    ├── 3X Tradie Package.png
    ├── 5X Tradie Package.png
    ├── 10X Tradie Package.png
    ├── 2X Tradie Plus.png           # One-time 2X
    ├── 3X Tradie Plus.png           # One-time 3X
    ├── 2X Tradie Upgrade.png        # Additional 2X
    └── 3X Tradie Upgrade.png        # Additional 3X
```

### Naming Rules

| Package Type | Category | Multiplier | Filename Pattern | Example |
|-------------|----------|------------|------------------|---------|
| Membership | subscription-plus | 2, 3, 5, 10 | `{multiplier}X {Package} Package.png` | `3X Boss Package.png`, `5X Tradie Package.png`, `10X Foreman Package.png` (2X upcoming) |
| One-time | one-time-plus | 2, 3, 5, 10 | `{multiplier}X {Package} Plus.png` | `2X Tradie Plus.png`, `10X Boss Plus.png` |
| One-time | additional-upgrade | 2, 3, 5, 10 | `{multiplier}X {Package} Upgrade.png` | `2X Tradie Upgrade.png`, `10X Boss Upgrade.png` |

**Note**: All promo images use uppercase `X` for consistency (e.g., `2X`, `3X`, `5X`, `10X`).

---

## Testing & Debugging

### Console Logs

When the upsell modal appears, check the browser console for:

1. **`🖼️ Upsell Image Debug`**: Shows all input parameters and resolved values
2. **`🖼️ getUpsellImagePath called with`**: Shows what's passed to the utility function
3. **`🖼️ Extracted info`**: Shows package name and category extraction
4. **`🖼️ ✅ Membership 10X check passed!`** or **`🖼️ ❌ Membership 10X check failed`**: Shows why membership 10X check passed/failed
5. **`🖼️ Final Image Path`**: Shows the final image path returned

### Common Issues & Solutions

#### Issue: Base image showing instead of 10X promo image

**Check**:
- `resolvedMembershipMultiplier` should be `10`, not `null`
- `packageType` should be `"membership"`, not `"one-time"`
- `category` should be `"subscription-plus"`

**Solution**: Ensure `originalPurchaseContext` is passed correctly, or verify upsell category inference is working.

#### Issue: Wrong multiplier being used

**Check**:
- `packageType` determination source (should show in logs)
- If `determinedFrom: "upsellCategory"`, verify category is correct
- If `determinedFrom: "fallback"`, `originalPurchaseContext` is missing

**Solution**: Ensure `originalPurchaseContext` is set when triggering upsell modal.

#### Issue: Image file not found (404)

**Check**:
- Generated filename matches actual file name
- Casing is consistent (uppercase X for all: Package, Plus, and Upgrade)
- File exists in `public/images/upsells/active-promo/`

**Solution**: Verify file naming matches the convention documented above.

---

## API Reference

### `getUpsellImagePath(params: UpsellImageParams): string`

Main public API for getting upsell image paths.

**Parameters**:
```typescript
interface UpsellImageParams {
  offerId: string;                                    // e.g., "tradie-plus-package"
  packageType?: "membership" | "one-time" | "mini-draw";
  promoMultiplier?: number;                           // 2, 3, 5, or 10
  category?: "subscription-plus" | "one-time-plus" | "additional-upgrade";
}
```

**Returns**: Image path string (e.g., `/images/upsells/active-promo/10X Tradie Package.png`)

**Behavior**:
- Returns promo image if multiplier is active and matches package type
- Returns base image if no promo is active
- Returns base image as fallback for edge cases

---

## Related Files

- `src/utils/upsell/upsell-image-selector.ts` - Core utility functions
- `src/components/modals/UpsellModal.tsx` - UI component using the selector
- `src/data/upsellPackages.ts` - Upsell package definitions with categories
- `src/hooks/queries/usePromoQueries.ts` - Promo multiplier resolution hooks

---

## Future Improvements

1. **Remove Debug Logging**: Consider making debug logging conditional (dev-only) or removable
2. **Type Safety**: Add stricter types for image categories
3. **Error Handling**: Add explicit error handling for missing images
4. **Caching**: Consider caching resolved image paths to reduce computation
5. **Validation**: Add runtime validation for file existence (optional)

---

## Changelog

### 2024-01-XX - Initial Implementation

- ✅ Added `getImageCategoryFromUpsellCategory()` for category mapping
- ✅ Refactored `getUpsellImagePath()` to use category parameter as primary source
- ✅ Fixed membership 10X image detection with early check
- ✅ Improved package type determination in `UpsellModal`
- ✅ Added comprehensive debug logging
- ✅ Fixed file naming convention (uppercase X for all promo images: Package, Plus, Upgrade)

---

## Summary

The Upsell Image Selector system now correctly:
1. ✅ Detects membership packages and uses 10X multiplier when active
2. ✅ Infers package type from upsell category when context is missing
3. ✅ Maps business categories to correct image categories
4. ✅ Constructs filenames with correct casing conventions
5. ✅ Provides comprehensive debugging information

All changes maintain clear separation of concerns:
- **Business Logic** (UpsellModal): Context determination, multiplier resolution
- **Technical Logic** (upsell-image-selector): Image path construction, file naming
- **Data Mapping** (getImageCategoryFromUpsellCategory): Category translation
