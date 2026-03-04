# User Setup Modal

## Purpose

The User Setup Modal collects profile information from the user after sign-up or when required by the application: password (if not set), state and profession, and email verification. Steps are **dynamic**: only steps whose data is missing are shown. Completion is triggered when the user has finished the **last required step**, which may be step 2 (state/profession) if password and email are already set.

## Step Logic

Steps are derived from `userData` in `UserSetupModal`:

- **Step 1 (password):** Shown if `!userData.hasPassword`.
- **Step 2 (state and profession):** Shown if state or profession is missing or empty.
- **Step 3 (email verification):** Shown if `!userData.isEmailVerified`.

The array `stepsNeeded` is built from these conditions (e.g. `[2]` when only state/profession is missing, or `[1, 2, 3]` when all three are missing). The user only sees steps in `stepsNeeded`; the modal does not show step 3 when email is already verified.

## Completion

Setup is complete when:

1. The user has completed the last step in `stepsNeeded`, and
2. The backend has been told to mark setup complete via `POST /api/user/setup` with `{ completeSetupOnly: true }`.

The API endpoint `completeSetupOnly` requires that the user already has a password and state (and by extension, profession, which is saved together with state in step 2). So:

- When the **last** step is **step 3** (email verification): the user clicks "Complete Setup" on step 3; `handleComplete` runs and sends `completeSetupOnly: true`, then closes and reloads.
- When the **last** step is **step 2** (state/profession): after the user saves state and profession and clicks "Next", there is no step 3 in `stepsNeeded`. The modal therefore runs the **completion flow** immediately after a successful step 2 save (same API call, refetch, success state, session storage flags, and close/reload). This prevents the user from being stuck on "Next" with no visible step 3.

Implementation detail: in `handleNext`, after `saveStateAndProfession()` succeeds for step 2, the code checks `currentStepIndex + 1 >= stepsNeeded.length`. If true, it runs the completion flow (completeSetupOnly, refetch, onComplete, onClose, reload) and returns; otherwise it advances to the next step index.

## API

- **Endpoint:** `POST /api/user/setup`
- **Modes:**
  - `savePasswordOnly: true` — save password only (step 1).
  - `saveStateProfessionOnly: true` — save state and profession only (step 2).
  - `completeSetupOnly: true` — mark `profileSetupCompleted`; requires existing password and state (validated in the API).

See `src/app/api/user/setup/route.ts` for validation and behaviour.

## Files

- **Modal:** `src/components/modals/UserSetupModal.tsx` — step derivation, `handleNext`, `handleComplete`, and completion-after-step-2 logic.
- **API:** `src/app/api/user/setup/route.ts` — password, state/profession, and completeSetupOnly handling.
