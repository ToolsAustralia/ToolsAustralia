/**
 * Stripe Elements appearance + rule overrides shared by MembershipModal (PaymentMethodSelector)
 * and inline SetupIntent flows (RenewalFailedModal, SpecialPackages, Upsell).
 */

/** Shared PaymentElement layout rules (wallet tabs, input height). */
export const STRIPE_PAYMENT_ELEMENT_RULES: Record<string, Record<string, string>> = {
  ".Tab": {
    display: "flex",
    alignItems: "center",
    flexDirection: "row",
    gap: "8px",
  },
  ".Tab--selected": {
    display: "flex",
    alignItems: "center",
    flexDirection: "row",
    gap: "8px",
  },
  "button[role='tab']": {
    display: "flex",
    alignItems: "center",
    flexDirection: "row",
    gap: "8px",
  },
  ".TabIcon, svg, img": {
    display: "inline-flex",
    alignItems: "center",
    flexShrink: "0",
    marginRight: "0",
  },
  ".TabLabel, span": {
    display: "inline-flex",
    alignItems: "center",
  },
  ".Input": {
    fontSize: "16px",
    padding: "12px 10px",
    minHeight: "44px",
    boxSizing: "border-box",
  },
  ".Input--empty": {
    fontSize: "16px",
    minHeight: "44px",
  },
  ".Input--focus": {
    fontSize: "16px",
    minHeight: "44px",
  },
  ".Input--invalid": {
    fontSize: "16px",
    minHeight: "44px",
  },
  "input[data-elements-stable-field-name='cardNumber']": {
    fontSize: "16px",
    padding: "12px 10px",
    minHeight: "44px",
    boxSizing: "border-box",
  },
  "input[data-elements-stable-field-name='cardExpiry']": {
    fontSize: "16px",
    padding: "12px 10px",
    minHeight: "44px",
    boxSizing: "border-box",
  },
  "input[data-elements-stable-field-name='cardCvc']": {
    fontSize: "16px",
    padding: "12px 10px",
    minHeight: "44px",
    boxSizing: "border-box",
  },
  ".InputElement": {
    fontSize: "16px",
    padding: "12px 10px",
    minHeight: "44px",
    boxSizing: "border-box",
  },
};

export function buildMembershipStripeAppearance(isDark: boolean) {
  return {
    theme: (isDark ? "night" : "stripe") as "night" | "stripe",
    variables: {
      colorPrimary: "#ee0000",
      colorPrimaryText: "#ffffff",
      colorBackground: isDark ? "#0a0a0a" : "#ffffff",
      colorText: isDark ? "#fafafa" : "#1f2937",
      colorTextSecondary: isDark ? "#a3a3a3" : "#6b7280",
      colorDanger: "#dc2626",
      colorBorder: isDark ? "#525252" : "#e5e7eb",
      fontFamily: "system-ui, sans-serif",
      spacingUnit: "4px",
      borderRadius: "8px",
      fontSizeBase: "16px",
    },
    rules: STRIPE_PAYMENT_ELEMENT_RULES,
  };
}

/** PaymentElement options for SetupIntent — matches PaymentMethodSelector / StripeCardForm (card-only, no billing fields). */
export const MEMBERSHIP_SETUP_INTENT_PAYMENT_ELEMENT_OPTIONS = {
  layout: "tabs" as const,
  paymentMethodOrder: ["card" as const],
  fields: {
    billingDetails: "never" as const,
  },
  terms: {
    card: "never" as const,
    applePay: "never" as const,
    googlePay: "never" as const,
  },
};
