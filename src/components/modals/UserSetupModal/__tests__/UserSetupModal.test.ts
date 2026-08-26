/**
 * Smoke test for UserSetupModal. The orchestrator pulls UserContext, ModalPriorityStore,
 * and useReferralCode — all of which read from window/global state. We render the
 * sub-components directly so we verify their JSX/imports without standing up the full
 * provider stack. The orchestrator's logic was preserved byte-identical from the
 * monolith — we trust the absence of type errors + the existing manual-test path.
 *
 * What this test catches:
 * - Broken imports, undefined access, malformed JSX in the 5 extracted sub-components
 * - Missing/wrong prop types
 * - CSS module / image stub failures
 *
 * What this test does NOT cover (deliberately):
 * - The orchestrator's state machine, sessionStorage persistence, API calls, or
 *   email-verification flow. Those paths are exercised by the existing dev-server
 *   route at /dev/modals?modal=user-setup.
 */
/* eslint-disable react/no-children-prop */

import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import Step1Password from "../Step1Password";
import Step2Demographics from "../Step2Demographics";
import Step3EmailVerification from "../Step3EmailVerification";
import SuccessScreen from "../SuccessScreen";
import ActionFooter from "../ActionFooter";

let testsRun = 0;
let testsFailed = 0;

function test(name: string, fn: () => void): void {
  testsRun++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    testsFailed++;
    console.error(`  ✗ ${name}`);
    console.error(err instanceof Error ? err.message : String(err));
  }
}

const noop = () => {};

console.log("\nUserSetupModal smoke test");

test("Step1Password — empty", () => {
  const ref = React.createRef<HTMLInputElement>();
  const html = renderToString(
    React.createElement(Step1Password, {
      password: "",
      confirmPassword: "",
      showPassword: false,
      showConfirmPassword: false,
      inlineErrors: {},
      passwordRef: ref,
      confirmPasswordRef: ref,
      onPasswordChange: noop,
      onConfirmPasswordChange: noop,
      onTogglePassword: noop,
      onToggleConfirmPassword: noop,
    })
  );
  assert.ok(html.length > 0);
});

test("Step1Password — with errors", () => {
  const ref = React.createRef<HTMLInputElement>();
  const html = renderToString(
    React.createElement(Step1Password, {
      password: "abc",
      confirmPassword: "xyz",
      showPassword: true,
      showConfirmPassword: true,
      inlineErrors: { password: "Too short", confirmPassword: "Mismatch" },
      passwordRef: ref,
      confirmPasswordRef: ref,
      onPasswordChange: noop,
      onConfirmPasswordChange: noop,
      onTogglePassword: noop,
      onToggleConfirmPassword: noop,
    })
  );
  assert.ok(html.includes("Too short"));
});

test("Step2Demographics — clean", () => {
  const ref = React.createRef<HTMLDivElement>();
  const html = renderToString(
    React.createElement(Step2Demographics, {
      selectedState: "NSW",
      selectedProfession: "Builder",
      customProfession: "",
      selectedBirthdate: "1990-01-01",
      stateOptions: [{ value: "NSW", label: "New South Wales" }],
      professionOptions: [{ value: "Builder", label: "Builder" }],
      selectedGender: "male",
      genderOptions: [{ value: "male", label: "Male" }, { value: "female", label: "Female" }],
      inlineErrors: {},
      error: null,
      isStep2OverlayOpen: false,
      isBirthdatePickerOpen: false,
      birthdateSectionRef: ref,
      onStateChange: noop,
      onProfessionChange: noop,
      onCustomProfessionChange: noop,
      onBirthdateChange: noop,
      onGenderChange: noop,
      onStateDropdownChange: noop,
      onProfessionDropdownChange: noop,
      onGenderDropdownChange: noop,
      onBirthdateOpenChange: noop,
    })
  );
  assert.ok(html.length > 0);
});

test("Step2Demographics — SA ineligibility notice", () => {
  const ref = React.createRef<HTMLDivElement>();
  const html = renderToString(
    React.createElement(Step2Demographics, {
      selectedState: "SA",
      selectedProfession: "Other",
      customProfession: "Pilot",
      selectedBirthdate: "1990-01-01",
      stateOptions: [{ value: "SA", label: "South Australia" }],
      professionOptions: [{ value: "Other", label: "Other" }],
      selectedGender: "",
      genderOptions: [{ value: "male", label: "Male" }, { value: "female", label: "Female" }],
      inlineErrors: {},
      error: null,
      isStep2OverlayOpen: true,
      isBirthdatePickerOpen: false,
      birthdateSectionRef: ref,
      onStateChange: noop,
      onProfessionChange: noop,
      onCustomProfessionChange: noop,
      onBirthdateChange: noop,
      onGenderChange: noop,
      onStateDropdownChange: noop,
      onProfessionDropdownChange: noop,
      onGenderDropdownChange: noop,
      onBirthdateOpenChange: noop,
    })
  );
  assert.ok(html.includes("SA and ACT"));
});

test("Step3EmailVerification — mandatory + not verified", () => {
  const html = renderToString(
    React.createElement(Step3EmailVerification, {
      isMandatory: true,
      hasReferralCode: true,
      currentEmail: "user@example.com",
      isEditingEmail: false,
      newEmail: "",
      isUpdatingEmail: false,
      isEmailVerified: false,
      isSendingEmail: false,
      onStartEdit: noop,
      onCancelEdit: noop,
      onNewEmailChange: noop,
      onUpdateEmail: noop,
      onSendEmailVerification: noop,
    })
  );
  assert.ok(html.includes("user@example.com"));
  // After visual polish: button label became sentence-cased "Send verification code".
  assert.ok(/Send verification code/i.test(html));
});

test("Step3EmailVerification — verified", () => {
  const html = renderToString(
    React.createElement(Step3EmailVerification, {
      isMandatory: false,
      hasReferralCode: false,
      currentEmail: "user@example.com",
      isEditingEmail: false,
      newEmail: "",
      isUpdatingEmail: false,
      isEmailVerified: true,
      isSendingEmail: false,
      onStartEdit: noop,
      onCancelEdit: noop,
      onNewEmailChange: noop,
      onUpdateEmail: noop,
      onSendEmailVerification: noop,
    })
  );
  assert.ok(html.includes("Email verified"));
});

test("Step3EmailVerification — editing email", () => {
  const html = renderToString(
    React.createElement(Step3EmailVerification, {
      isMandatory: true,
      hasReferralCode: false,
      currentEmail: "old@example.com",
      isEditingEmail: true,
      newEmail: "new@example.com",
      isUpdatingEmail: false,
      isEmailVerified: false,
      isSendingEmail: false,
      onStartEdit: noop,
      onCancelEdit: noop,
      onNewEmailChange: noop,
      onUpdateEmail: noop,
      onSendEmailVerification: noop,
    })
  );
  // After visual polish: copy is "Update & verify". Accept any case + escaped variant.
  assert.ok(/Update &(amp;)? verify/i.test(html));
});

test("SuccessScreen — without referral", () => {
  const html = renderToString(
    React.createElement(SuccessScreen, { hasReferralCode: false })
  );
  assert.ok(html.includes("Profile Setup Complete"));
});

test("SuccessScreen — with referral", () => {
  const html = renderToString(React.createElement(SuccessScreen, { hasReferralCode: true }));
  assert.ok(html.includes("100\nbonus") || html.includes("100 bonus"));
});

test("ActionFooter — Next disabled", () => {
  const html = renderToString(
    React.createElement(ActionFooter, {
      showBack: false,
      primaryDisabled: true,
      primaryLabel: "Next",
      onBack: noop,
      onPrimary: noop,
    })
  );
  assert.ok(html.includes("Next"));
});

test("ActionFooter — Back + Complete enabled", () => {
  const html = renderToString(
    React.createElement(ActionFooter, {
      showBack: true,
      primaryDisabled: false,
      primaryLabel: "Complete Setup",
      onBack: noop,
      onPrimary: noop,
    })
  );
  assert.ok(html.includes("Back"));
  assert.ok(html.includes("Complete Setup"));
});

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
