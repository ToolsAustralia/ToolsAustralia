# Professional A/B Testing Enhancement Plan

## Current State Analysis

### What Exists:
1. ✅ Basic experiment lifecycle: draft → active → paused → ended
2. ✅ Manual activation/pause/end via API
3. ✅ Date-based activation check (startDate/endDate in isActive())
4. ✅ Stopping rules service (min conversions, confidence threshold, max duration)
5. ✅ Basic analytics (metrics, funnel, drop-off rates)
6. ✅ Traffic split validation

### What's Missing for Professional System (Klaviyo/Facebook Level):

1. **Automatic Experiment Management**
   - ❌ No cron job to auto-activate experiments on startDate
   - ❌ No cron job to auto-end experiments on endDate
   - ❌ No automatic stopping when stopping rules are met
   - ❌ No scheduled status transitions

2. **Statistical Analysis**
   - ❌ Statistical significance is placeholder (not implemented)
   - ❌ No proper chi-square test or z-test
   - ❌ No p-value calculation
   - ❌ No confidence intervals
   - ❌ No lift calculation (% improvement vs control)
   - ❌ No Bayesian analysis option

3. **Winner Selection & Declaration**
   - ❌ No automatic winner declaration
   - ❌ No manual winner selection UI
   - ❌ No winner variant storage in experiment model
   - ❌ No "apply winner" functionality (winner becomes default)

4. **Stopping Rules Configuration**
   - ❌ Stopping rules not stored in experiment model
   - ❌ No UI to configure stopping rules
   - ❌ No automatic evaluation and stopping
   - ❌ No notifications when rules are met

5. **Results Dashboard**
   - ❌ No visual comparison charts
   - ❌ No statistical significance indicators
   - ❌ No winner highlighting
   - ❌ No export functionality

6. **Experiment Lifecycle**
   - ❌ No "archived" status for old experiments
   - ❌ No experiment summary/report generation
   - ❌ No experiment cloning/duplication

## Implementation Plan

### Phase 1: Enhanced Experiment Model & Stopping Rules

**File**: `src/models/ab-testing/Experiment.ts`
- Add `stoppingRules` field (minConversions, confidenceThreshold, maxDuration)
- Add `winnerVariantId` field (stores declared winner)
- Add `endedReason` field (manual, date_reached, stopping_rule_met, etc.)
- Add `autoEndEnabled` boolean flag
- Add `statisticalResults` field (cached p-value, confidence, lift)

### Phase 2: Automatic Experiment Management (Cron Jobs)

**New File**: `src/app/api/cron/ab-testing-management/route.ts`
- Auto-activate experiments when startDate is reached
- Auto-end experiments when endDate is reached
- Auto-end experiments when stopping rules are met
- Check every 15 minutes (or hourly)

**File**: `src/services/ab-testing/ExperimentService.ts`
- Add `checkAndAutoActivate()` method
- Add `checkAndAutoEnd()` method
- Add `evaluateStoppingRulesAndEnd()` method

### Phase 3: Professional Statistical Analysis

**File**: `src/services/ab-testing/ExperimentAnalyticsService.ts`
- Implement proper chi-square test for conversion rates
- Calculate p-values using statistical library (jstat or similar)
- Calculate confidence intervals (95%, 99%)
- Calculate lift percentage vs control variant
- Add Bayesian analysis option (optional)

**New File**: `src/utils/ab-testing/statistical-tests.ts`
- Chi-square test implementation
- Z-test implementation
- P-value calculation
- Confidence interval calculation
- Lift calculation

### Phase 4: Winner Selection & Declaration

**File**: `src/services/ab-testing/ExperimentService.ts`
- Add `declareWinner()` method (manual winner selection)
- Add `autoDeclareWinner()` method (automatic when statistically significant)
- Add `applyWinner()` method (winner variant becomes default)

**File**: `src/app/api/admin/ab-testing/experiments/[id]/winner/route.ts`
- POST endpoint to declare winner manually
- GET endpoint to get winner status
- POST endpoint to apply winner (make winner the default)

### Phase 5: Enhanced Results Dashboard

**New File**: `src/components/admin/ab-testing/ExperimentResults.tsx`
- Visual comparison charts (bar charts, line charts)
- Statistical significance indicators (green/yellow/red)
- Winner badge/indicator
- Lift percentage display
- Confidence intervals visualization
- Export to CSV/PDF functionality

**File**: `src/app/api/admin/ab-testing/experiments/[id]/results/route.ts`
- Comprehensive results endpoint with all metrics
- Statistical analysis results
- Winner information
- Export data

### Phase 6: Stopping Rules UI & Configuration

**File**: `src/components/admin/ab-testing/ExperimentFormModal.tsx`
- Add stopping rules configuration section
- Min conversions input
- Confidence threshold slider (80%, 90%, 95%, 99%)
- Max duration input (days)
- Auto-end toggle

**File**: `src/components/admin/ab-testing/ExperimentDetailModal.tsx`
- Display stopping rules status
- Show which rules are met
- Alert when experiment should stop
- One-click "End Experiment" when rules met

### Phase 7: Experiment Lifecycle Enhancements

**File**: `src/models/ab-testing/Experiment.ts`
- Add `archived` boolean field
- Add `endedReason` enum field
- Add `statisticalResults` cached field

**File**: `src/services/ab-testing/ExperimentService.ts`
- Add `archiveExperiment()` method
- Add `cloneExperiment()` method
- Add `generateReport()` method

## Technical Details

### Statistical Test Implementation

**Chi-Square Test for Conversion Rates:**
```
- Control: n1 visitors, c1 conversions
- Variant: n2 visitors, c2 conversions
- Calculate expected values
- Chi-square statistic = Σ((observed - expected)² / expected)
- Degrees of freedom = 1
- P-value from chi-square distribution
- Confidence = (1 - p-value) * 100
```

**Lift Calculation:**
```
Lift = ((Variant Conversion Rate - Control Conversion Rate) / Control Conversion Rate) * 100
```

**Confidence Intervals:**
```
- Use Wilson score interval for proportions
- 95% CI = p ± z * sqrt(p(1-p)/n)
```

### Automatic Management Flow

```
Cron Job (every 15 min):
1. Find experiments with status="draft" and startDate <= now → Activate
2. Find experiments with status="active" and endDate <= now → End
3. Find experiments with status="active" and autoEndEnabled=true → Check stopping rules
4. If stopping rules met → End experiment + Auto-declare winner (if significant)
```

### Winner Declaration Flow

```
Automatic:
1. Experiment ends (date or stopping rule)
2. Calculate statistical significance
3. If confidence >= 95% and lift > 0 → Auto-declare winner
4. Store winnerVariantId in experiment

Manual:
1. Admin reviews results
2. Clicks "Declare Winner" button
3. Selects variant
4. Stores winnerVariantId
5. Option to "Apply Winner" (make it default)
```

## Files to Create/Modify

### New Files:
1. `src/app/api/cron/ab-testing-management/route.ts` - Cron job for auto-management
2. `src/utils/ab-testing/statistical-tests.ts` - Statistical test implementations
3. `src/app/api/admin/ab-testing/experiments/[id]/winner/route.ts` - Winner endpoints
4. `src/app/api/admin/ab-testing/experiments/[id]/results/route.ts` - Results endpoint
5. `src/components/admin/ab-testing/ExperimentResults.tsx` - Results dashboard component

### Modified Files:
1. `src/models/ab-testing/Experiment.ts` - Add stopping rules, winner, results fields
2. `src/services/ab-testing/ExperimentService.ts` - Add auto-management, winner methods
3. `src/services/ab-testing/ExperimentAnalyticsService.ts` - Implement proper statistical tests
4. `src/components/admin/ab-testing/ExperimentFormModal.tsx` - Add stopping rules UI
5. `src/components/admin/ab-testing/ExperimentDetailModal.tsx` - Add results, winner UI

## Dependencies

**New npm packages needed:**
- `jstat` or `ml-matrix` - Statistical calculations
- `recharts` or `chart.js` - Chart visualization (if not already installed)

## Testing Checklist

- [ ] Experiments auto-activate on startDate
- [ ] Experiments auto-end on endDate
- [ ] Experiments auto-end when stopping rules met
- [ ] Statistical significance calculated correctly
- [ ] P-values are accurate
- [ ] Confidence intervals are correct
- [ ] Lift calculation is accurate
- [ ] Winner can be declared manually
- [ ] Winner can be declared automatically
- [ ] Winner can be applied (becomes default)
- [ ] Results dashboard displays correctly
- [ ] Charts render properly
- [ ] Export functionality works

