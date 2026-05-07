// e2e/utils/selectors.ts
//
// Single source of truth for data-testid strings. Specs import from here;
// component edits add the testids referenced. Adding a new testid is:
//   1. Add the string to this file with a comment explaining its location.
//   2. Add the data-testid={...} attribute to the component.
//   3. Update the matching docs/<domain>/frontend.md.

export const testid = {
  // Layout (src/app/(site)/my-account/page.tsx)
  dashboardRoot: "dashboard-root",

  // Header (src/components/layout/Header.tsx)
  headerCartIcon: "header-cart-icon",
  headerCartDrawer: "header-cart-drawer",
  headerSearchOverlay: "header-search-overlay",
  headerTopBar: "header-top-bar",
  headerTopBarDismiss: "header-top-bar-dismiss",
  headerMembershipBadge: "header-membership-badge",
  headerUserMenu: "header-user-menu",
  headerLogoutButton: "header-logout-button",

  // Auth (src/app/login/page.tsx, src/app/reset-password/page.tsx,
  // src/components/modals/UserSetupModal.tsx, src/components/modals/ExistingAccountModal.tsx)
  loginEmail: "login-email",
  loginPassword: "login-password",
  loginSubmit: "login-submit",
  loginGoogleButton: "login-google-button",
  loginOtpTab: "login-otp-tab",
  loginPasswordTab: "login-password-tab",
  registerLink: "register-link",
  forgotPasswordLink: "forgot-password-link",
  resetPasswordEmail: "reset-password-email",
  resetPasswordNew: "reset-password-new",
  resetPasswordConfirm: "reset-password-confirm",
  resetPasswordSubmit: "reset-password-submit",
  userSetupDob: "user-setup-dob",
  userSetupSubmit: "user-setup-submit",
  existingAccountLoginButton: "existing-account-login-button",

  // Modals (src/components/modals/*)
  modalContainer: "modal-container",
  modalCloseButton: "modal-close-button",
  loginPromptModal: "login-prompt-modal",
  membershipModal: "membership-modal",
  packageCardTradie: "package-card-tradie",
  packageCardForeman: "package-card-foreman",
  packageCardBoss: "package-card-boss",
  cancellationUpsellModal: "cancellation-upsell-modal",
  cancellationUpsellAccept: "cancellation-upsell-accept",
  cancellationUpsellDecline: "cancellation-upsell-decline",
  upsellModal: "upsell-modal",
  upsellRedeemButton: "upsell-redeem-button",
  upsellDeclineButton: "upsell-decline-button",
  renewalFailedModal: "renewal-failed-modal",
  subscriptionExplainerModal: "subscription-explainer-modal",
  referFriendModal: "refer-friend-modal",
  referFriendTrigger: "refer-friend-trigger",
  referCopyCodeButton: "refer-copy-code-button",
  referCopyLinkButton: "refer-copy-link-button",
  pixelConsentModal: "pixel-consent-modal",
  pixelConsentAccept: "pixel-consent-accept",
  pixelConsentDecline: "pixel-consent-decline",
  pastDrawsModal: "past-draws-modal",
  packageDetailModal: "package-detail-modal",
  specialPackagesModal: "special-packages-modal",
  gateClosedModal: "gate-closed-modal",
  partnerModal: "partner-modal",
  savedPaymentMethodsModal: "saved-payment-methods-modal",
  stripePaymentModal: "stripe-payment-modal",
  userSetupModal: "user-setup-modal",
  existingAccountModal: "existing-account-modal",
  promoWelcomeModal: "promo-welcome-modal",
  promoWelcomeCode: "promo-welcome-code",
  confirmationModal: "confirmation-modal",
  confirmationModalConfirm: "confirmation-modal-confirm",
  confirmationModalCancel: "confirmation-modal-cancel",

  // Subscription Management Modal (src/components/modals/SubscriptionManagementModal.tsx)
  // Upgrade/downgrade buttons are dynamically suffixed with the package id, e.g.
  //   subscription-upgrade-button-foreman-subscription
  // Use String concatenation in spec instead of these generic ids when needed.
  subscriptionUpgradeButton: "subscription-upgrade-button",
  subscriptionDowngradeButton: "subscription-downgrade-button",
  subscriptionUpgradeForeman: "subscription-upgrade-button-foreman-subscription",
  subscriptionUpgradeBoss: "subscription-upgrade-button-boss-subscription",
  subscriptionDowngradeTradie: "subscription-downgrade-button-tradie-subscription",
  subscriptionDowngradeForeman: "subscription-downgrade-button-foreman-subscription",
  subscriptionCancelButton: "subscription-cancel-button",
  subscriptionResumeButton: "subscription-resume-button",
  subscriptionResolvePaymentButton: "subscription-resolve-payment-button",

  // Toasts (src/components/UpgradeSuccessToast.tsx + ui/Toast.tsx)
  toastSuccess: "toast-success",
  toastError: "toast-error",
  upgradeSuccessToast: "upgrade-success-toast",
  downgradeScheduledToast: "downgrade-scheduled-toast",
  entryRewardToast: "entry-reward-toast",

  // Banners (src/components/banners/*)
  freezePeriodBanner: "freeze-period-banner",
  floatingCountdownBanner: "floating-countdown-banner",
  floatingPromoBanner: "floating-promo-banner",
  promoBanner: "promo-banner",
  promoBannerDismiss: "promo-banner-dismiss",

  // Rewards
  rewardsFloatingWidget: "rewards-floating-widget",
  rewardsClaimButton: "rewards-claim-button",
  rewardsTabClaimable: "rewards-tab-claimable",
  rewardsTabPast: "rewards-tab-past",
  rewardsRedeemableNowToggle: "rewards-redeemable-now-toggle",

  // Major draw (src/app/(site)/major-draw/* and components/sections/*)
  majorDrawPage: "major-draw-page",
  majorDrawCountdown: "major-draw-countdown",
  majorDrawEntryCta: "major-draw-entry-cta",
  majorDrawEntriesCount: "major-draw-entries-count",

  // Mini draw
  miniDrawListItem: "mini-draw-list-item",
  miniDrawPurchaseButton: "mini-draw-purchase-button",
  miniDrawStockBadge: "mini-draw-stock-badge",
  miniDrawSoldOut: "mini-draw-sold-out",

  // Shop
  shopProductCard: "shop-product-card",
  shopAddToCart: "shop-add-to-cart",
  shopFilterBrand: "shop-filter-brand",
  cartIconBadge: "cart-icon-badge",
  cartLineItem: "cart-line-item",
  cartLineRemove: "cart-line-remove",
  cartLineQtyPlus: "cart-line-qty-plus",
  cartLineQtyMinus: "cart-line-qty-minus",
  cartCheckoutButton: "cart-checkout-button",
  checkoutShippingForm: "checkout-shipping-form",
  checkoutSubmit: "checkout-submit",
  checkoutMemberDiscountLine: "checkout-member-discount-line",

  // My Account sub-routes
  accountSettingsTabs: "account-settings-tabs",
  accountSettingsTabProfile: "account-settings-tab-profile",
  accountSettingsTabSubscription: "account-settings-tab-subscription",
  accountSettingsTabPassword: "account-settings-tab-password",
  accountSettingsTabPayment: "account-settings-tab-payment",
  accountProfileFirstName: "account-profile-first-name",
  accountProfileLastName: "account-profile-last-name",
  accountProfileSave: "account-profile-save",
  accountChangePasswordCurrent: "account-change-password-current",
  accountChangePasswordNew: "account-change-password-new",
  accountChangePasswordConfirm: "account-change-password-confirm",
  accountChangePasswordSave: "account-change-password-save",
  accountUpdateEmail: "account-update-email",
  accountUpdateEmailSubmit: "account-update-email-submit",
  accountUpdatePhone: "account-update-phone",
  accountUpdatePhoneSubmit: "account-update-phone-submit",
  accountProfileProfession: "account-profile-profession",
  accountAddPaymentMethodButton: "account-add-payment-method-button",
  accountSavedCardItem: "account-saved-card-item",
  accountSavedCardDelete: "account-saved-card-delete",
  accountSavedCardSetDefault: "account-saved-card-set-default",
  accountResolvePaymentCta: "account-resolve-payment-cta",

  // Order detail (src/app/(site)/my-account/orders/[orderNumber]/page.tsx)
  orderStatusTimeline: "order-status-timeline",
  orderTrackingLink: "order-tracking-link",

  // Affiliate
  affiliateLoginUsername: "affiliate-login-username",
  affiliateLoginPassword: "affiliate-login-password",
  affiliateLoginSubmit: "affiliate-login-submit",
  affiliateDashboardCode: "affiliate-dashboard-code",
  affiliateDashboardLink: "affiliate-dashboard-link",
  affiliateDashboardCopyCode: "affiliate-dashboard-copy-code",
  affiliateDashboardCopyLink: "affiliate-dashboard-copy-link",
  affiliateDashboardSignups: "affiliate-dashboard-signups",
  affiliateDashboardCommissions: "affiliate-dashboard-commissions",

  // Partner
  partnerApplicationForm: "partner-application-form",
  partnerApplicationSubmit: "partner-application-submit",
  partnerDiscountQueueItem: "partner-discount-queue-item",

  // Newsletter / Contact (src/components/sections/NewsletterSection.tsx,
  // src/components/features/ContactForm.tsx)
  newsletterEmail: "newsletter-email",
  newsletterSubscribe: "newsletter-subscribe",
  contactForm: "contact-form",
  contactFirstName: "contact-first-name",
  contactLastName: "contact-last-name",
  contactName: "contact-name", // legacy alias - prefer firstName/lastName
  contactEmail: "contact-email",
  contactPhone: "contact-phone",
  contactSubject: "contact-subject", // unused: subject is a radio group, target by role
  contactMessage: "contact-message",
  contactSubmit: "contact-submit", // unused: submit is MetallicButton, target by role

  // Theme / consent
  themeToggleButton: "theme-toggle-button",
} as const;

export type TestId = (typeof testid)[keyof typeof testid];

/**
 * Helper for use with Playwright Locators:
 *   page.locator(byTestId(testid.loginSubmit))
 */
export function byTestId(id: TestId): string {
  return `[data-testid="${id}"]`;
}
