# Component Decomposition Backlog

Generated: 2026-05-08 by `npm run audit:decomposition`

Scanned: 449 files. Candidates with score > 0: 256.

Scoring criteria: see [component-decomposition-criteria.md](./component-decomposition-criteria.md).

**Workflow:** decompose top-of-list first. Apply the [Plan 2 pattern](../superpowers/plans/2026-05-08-ui-cleanup-plan-2-cancellation-modal-pilot.md): folder + sub-components + CSS module + smoke test.

---

## High priority (score ≥ 5) — 0 files

_(none)_

## Medium priority (score 3-4) — 50 files

- [src/components/admin/AffiliateDetailModal.tsx](../../src/components/admin/AffiliateDetailModal.tsx) — **score 4.5** — 1577 LOC
  - signals: loc>800 (1577 LOC); ternary-explosion (19 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); many-arbitraries (36 arbitrary-value classNames); long-className (longest className=539 chars); many-useState (28 useState slices)

- [src/components/admin/FacebookAdsManagement.tsx](../../src/components/admin/FacebookAdsManagement.tsx) — **score 4.5** — 1742 LOC
  - signals: loc>800 (1742 LOC); ternary-explosion (55 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); many-arbitraries (54 arbitrary-value classNames); long-className (longest className=479 chars); many-useState (15 useState slices)

- [src/components/admin/UsersManagement.tsx](../../src/components/admin/UsersManagement.tsx) — **score 4.5** — 983 LOC
  - signals: loc>800 (983 LOC); ternary-explosion (24 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); many-arbitraries (50 arbitrary-value classNames); long-className (longest className=612 chars); many-useState (6 useState slices)

- [src/components/layout/Header.tsx](../../src/components/layout/Header.tsx) — **score 4.5** — 1731 LOC
  - signals: loc>800 (1731 LOC); ternary-explosion (41 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations); many-arbitraries (49 arbitrary-value classNames); long-className (longest className=382 chars); many-useState (14 useState slices)

- [src/components/sections/MajorDrawSection.tsx](../../src/components/sections/MajorDrawSection.tsx) — **score 4.5** — 1550 LOC
  - signals: loc>800 (1550 LOC); ternary-explosion (41 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); many-arbitraries (43 arbitrary-value classNames); long-className (longest className=702 chars); many-useState (11 useState slices)

- [src/components/sections/promo/PrizeShowcase.tsx](../../src/components/sections/promo/PrizeShowcase.tsx) — **score 4.5** — 1429 LOC
  - signals: loc>800 (1429 LOC); ternary-explosion (39 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); many-arbitraries (39 arbitrary-value classNames); long-className (longest className=538 chars); many-useState (18 useState slices)

- [src/components/sections/promo/PromoBanner.tsx](../../src/components/sections/promo/PromoBanner.tsx) — **score 4.5** — 1116 LOC
  - signals: loc>800 (1116 LOC); ternary-explosion (18 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); many-arbitraries (219 arbitrary-value classNames); long-className (longest className=2334 chars); many-useState (12 useState slices)

- [src/components/admin/BlockedTransactionsManagement.tsx](../../src/components/admin/BlockedTransactionsManagement.tsx) — **score 4** — 824 LOC
  - signals: loc>800 (824 LOC); ternary-explosion (19 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); long-className (longest className=353 chars); many-useState (10 useState slices)

- [src/components/admin/ErrorReportsManagement.tsx](../../src/components/admin/ErrorReportsManagement.tsx) — **score 4** — 1147 LOC
  - signals: loc>800 (1147 LOC); ternary-explosion (29 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations); long-className (longest className=337 chars); many-useState (21 useState slices)

- [src/components/admin/UserDetailModal.tsx](../../src/components/admin/UserDetailModal.tsx) — **score 4** — 3892 LOC
  - signals: loc>800 (3892 LOC); ternary-explosion (69 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations); long-className (longest className=970 chars); many-useState (19 useState slices)

- [src/components/dev/ModalsGalleryClient.tsx](../../src/components/dev/ModalsGalleryClient.tsx) — **score 4** — 1445 LOC
  - signals: loc>800 (1445 LOC); ternary-explosion (10 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); long-className (longest className=337 chars); many-useState (6 useState slices)

- [src/components/features/RewardsFloatingWidget.tsx](../../src/components/features/RewardsFloatingWidget.tsx) — **score 4** — 603 LOC
  - signals: ternary-explosion (17 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); loc-500-800 (603 LOC); many-arbitraries (29 arbitrary-value classNames); long-className (longest className=578 chars); many-useState (7 useState slices)

- [src/components/modals/MembershipModal.tsx](../../src/components/modals/MembershipModal.tsx) — **score 4** — 5891 LOC
  - signals: loc>800 (5891 LOC); ternary-explosion (67 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations); long-className (longest className=563 chars); many-useState (35 useState slices)

- [src/components/modals/SpecialPackagesModal.tsx](../../src/components/modals/SpecialPackagesModal.tsx) — **score 4** — 1218 LOC
  - signals: loc>800 (1218 LOC); ternary-explosion (15 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations); long-className (longest className=325 chars); many-useState (15 useState slices)

- [src/components/modals/SubscriptionManagementModal.tsx](../../src/components/modals/SubscriptionManagementModal.tsx) — **score 4** — 1487 LOC
  - signals: loc>800 (1487 LOC); ternary-explosion (27 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); long-className (longest className=421 chars); many-useState (12 useState slices)

- [src/components/modals/UpsellModal.tsx](../../src/components/modals/UpsellModal.tsx) — **score 4** — 1139 LOC
  - signals: loc>800 (1139 LOC); ternary-explosion (11 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations); long-className (longest className=323 chars); many-useState (10 useState slices)

- [src/components/sections/MembershipSection.tsx](../../src/components/sections/MembershipSection.tsx) — **score 4** — 1210 LOC
  - signals: loc>800 (1210 LOC); ternary-explosion (43 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, models, components); many-arbitraries (79 arbitrary-value classNames); long-className (longest className=499 chars)

- [src/app/admin/component/MiniDrawManagement.tsx](../../src/app/admin/component/MiniDrawManagement.tsx) — **score 4** — 901 LOC
  - signals: loc>800 (901 LOC); ternary-explosion (15 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations); long-className (longest className=491 chars); many-useState (20 useState slices)

- [src/app/login/page.tsx](../../src/app/login/page.tsx) — **score 4** — 727 LOC
  - signals: ternary-explosion (6 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations); loc-500-800 (727 LOC); many-arbitraries (153 arbitrary-value classNames); long-className (longest className=455 chars); many-useState (5 useState slices)

- [src/components/admin/PromoAnalyticsManagement.tsx](../../src/components/admin/PromoAnalyticsManagement.tsx) — **score 3.5** — 691 LOC
  - signals: ternary-explosion (18 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations); loc-500-800 (691 LOC); long-className (longest className=445 chars); many-useState (8 useState slices)

- [src/components/admin/UserExportModal.tsx](../../src/components/admin/UserExportModal.tsx) — **score 3.5** — 560 LOC
  - signals: ternary-explosion (9 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); loc-500-800 (560 LOC); long-className (longest className=301 chars); many-useState (7 useState slices)

- [src/components/features/MiniDrawPackages.tsx](../../src/components/features/MiniDrawPackages.tsx) — **score 3.5** — 779 LOC
  - signals: ternary-explosion (12 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations); loc-500-800 (779 LOC); long-className (longest className=614 chars); many-useState (10 useState slices)

- [src/components/modals/CampaignTargetingModal.tsx](../../src/components/modals/CampaignTargetingModal.tsx) — **score 3.5** — 603 LOC
  - signals: ternary-explosion (14 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); loc-500-800 (603 LOC); long-className (longest className=343 chars); many-useState (15 useState slices)

- [src/components/modals/LoginModal.tsx](../../src/components/modals/LoginModal.tsx) — **score 3.5** — 877 LOC
  - signals: loc>800 (877 LOC); ternary-explosion (5 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations); many-useState (12 useState slices)

- [src/components/modals/PaymentMethodsTab.tsx](../../src/components/modals/PaymentMethodsTab.tsx) — **score 3.5** — 667 LOC
  - signals: ternary-explosion (10 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations); loc-500-800 (667 LOC); long-className (longest className=537 chars); many-useState (9 useState slices)

- ~~src/components/modals/UserSetupModal.tsx~~ — **DECOMPOSED 2026-05-08** → folder at [src/components/modals/UserSetupModal/](../../src/components/modals/UserSetupModal/) (orchestrator preserves all state/effects/handlers byte-identical; 5 sub-components extracted: Step1Password, Step2Demographics, Step3EmailVerification, SuccessScreen, ActionFooter; 11-test smoke suite). Public API preserved; consumers (ModalsGalleryClient, UnifiedModalManager) need no changes.

- [src/components/ui/ProductCard.tsx](../../src/components/ui/ProductCard.tsx) — **score 3.5** — 768 LOC
  - signals: ternary-explosion (19 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); loc-500-800 (768 LOC); many-arbitraries (90 arbitrary-value classNames); long-className (longest className=688 chars)

- [src/app/admin/component/DrawResults.tsx](../../src/app/admin/component/DrawResults.tsx) — **score 3.5** — 922 LOC
  - signals: loc>800 (922 LOC); ternary-explosion (10 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); many-useState (16 useState slices)

- [src/app/admin/component/MajorDrawManagement.tsx](../../src/app/admin/component/MajorDrawManagement.tsx) — **score 3.5** — 723 LOC
  - signals: ternary-explosion (12 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); loc-500-800 (723 LOC); long-className (longest className=377 chars); many-useState (8 useState slices)

- [src/app/admin/component/SubmissionsManagement.tsx](../../src/app/admin/component/SubmissionsManagement.tsx) — **score 3.5** — 504 LOC
  - signals: ternary-explosion (4 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); loc-500-800 (504 LOC); long-className (longest className=348 chars); many-useState (11 useState slices)

- [src/components/admin/ab-testing/ABTestingManagement.tsx](../../src/components/admin/ab-testing/ABTestingManagement.tsx) — **score 3** — 302 LOC
  - signals: ternary-explosion (8 JSX ternaries); multiple-concerns (3 concern buckets: hooks, components, integrations); long-className (longest className=388 chars); many-useState (5 useState slices)

- [src/components/admin/ab-testing/VariantConfigEditor.tsx](../../src/components/admin/ab-testing/VariantConfigEditor.tsx) — **score 3** — 676 LOC
  - signals: ternary-explosion (18 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, models, components); loc-500-800 (676 LOC); long-className (longest className=307 chars)

- [src/components/admin/AffiliatesManagement.tsx](../../src/components/admin/AffiliatesManagement.tsx) — **score 3** — 674 LOC
  - signals: ternary-explosion (7 JSX ternaries); loc-500-800 (674 LOC); many-arbitraries (23 arbitrary-value classNames); long-className (longest className=335 chars); many-useState (13 useState slices)

- [src/components/admin/RevenueOverview.tsx](../../src/components/admin/RevenueOverview.tsx) — **score 3** — 787 LOC
  - signals: ternary-explosion (8 JSX ternaries); loc-500-800 (787 LOC); many-arbitraries (47 arbitrary-value classNames); long-className (longest className=452 chars); many-useState (8 useState slices)

- [src/components/dev/MajorDrawTestControls.tsx](../../src/components/dev/MajorDrawTestControls.tsx) — **score 3** — 305 LOC
  - signals: ternary-explosion (7 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, integrations); long-className (longest className=380 chars); many-useState (6 useState slices)

- [src/components/features/ContactForm.tsx](../../src/components/features/ContactForm.tsx) — **score 3** — 522 LOC
  - signals: ternary-explosion (14 JSX ternaries); loc-500-800 (522 LOC); many-arbitraries (26 arbitrary-value classNames); long-className (longest className=334 chars); many-useState (6 useState slices)

- [src/components/modals/AdminMajorDrawModal.tsx](../../src/components/modals/AdminMajorDrawModal.tsx) — **score 3** — 731 LOC
  - signals: ternary-explosion (8 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); loc-500-800 (731 LOC); many-useState (5 useState slices)

- [src/components/modals/PackageSelectionModal.tsx](../../src/components/modals/PackageSelectionModal.tsx) — **score 3** — 780 LOC
  - signals: ternary-explosion (20 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations); loc-500-800 (780 LOC); long-className (longest className=467 chars)

- [src/components/modals/PaymentMethodSelector.tsx](../../src/components/modals/PaymentMethodSelector.tsx) — **score 3** — 1052 LOC
  - signals: loc>800 (1052 LOC); ternary-explosion (14 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations)

- [src/components/modals/RenewalFailedModal/index.tsx](../../src/components/modals/RenewalFailedModal/index.tsx) — **score 3** — 588 LOC
  - signals: ternary-explosion (18 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations); loc-500-800 (588 LOC); many-useState (13 useState slices)

- [src/components/modals/SettingsModal.tsx](../../src/components/modals/SettingsModal.tsx) — **score 3** — 526 LOC
  - signals: ternary-explosion (12 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations); loc-500-800 (526 LOC); many-useState (13 useState slices)

- [src/components/modals/StripePaymentModal.tsx](../../src/components/modals/StripePaymentModal.tsx) — **score 3** — 726 LOC
  - signals: ternary-explosion (5 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations); loc-500-800 (726 LOC); many-useState (12 useState slices)

- [src/components/modals/WinnerSelectionModal.tsx](../../src/components/modals/WinnerSelectionModal.tsx) — **score 3** — 452 LOC
  - signals: ternary-explosion (6 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); long-className (longest className=318 chars); many-useState (8 useState slices)

- [src/components/sections/MembershipPackagesChart.tsx](../../src/components/sections/MembershipPackagesChart.tsx) — **score 3** — 482 LOC
  - signals: ternary-explosion (10 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); long-className (longest className=350 chars); many-useState (5 useState slices)

- [src/components/ui/VerticalAccumulationChart.tsx](../../src/components/ui/VerticalAccumulationChart.tsx) — **score 3** — 297 LOC
  - signals: ternary-explosion (7 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); many-arbitraries (41 arbitrary-value classNames); long-className (longest className=304 chars)

- [src/app/(site)/my-account/components/MajorDrawOverview.tsx](../../src/app/(site)/my-account/components/MajorDrawOverview.tsx) — **score 3** — 498 LOC
  - signals: ternary-explosion (7 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); many-arbitraries (36 arbitrary-value classNames); long-className (longest className=599 chars)

- [src/app/(site)/my-account/components/settings/ProfileTab.tsx](../../src/app/(site)/my-account/components/settings/ProfileTab.tsx) — **score 3** — 286 LOC
  - signals: ternary-explosion (5 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations); long-className (longest className=375 chars); many-useState (6 useState slices)

- [src/app/(site)/rewards/components/RewardsRedemption.tsx](../../src/app/(site)/rewards/components/RewardsRedemption.tsx) — **score 3** — 507 LOC
  - signals: ternary-explosion (6 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); loc-500-800 (507 LOC); long-className (longest className=368 chars)

- [src/app/(site)/winners/components/WinnersPageClient.tsx](../../src/app/(site)/winners/components/WinnersPageClient.tsx) — **score 3** — 357 LOC
  - signals: ternary-explosion (4 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); long-className (longest className=394 chars); many-useState (5 useState slices)

- [src/app/admin/component/PastDueChargeHistory.tsx](../../src/app/admin/component/PastDueChargeHistory.tsx) — **score 3** — 788 LOC
  - signals: ternary-explosion (12 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); loc-500-800 (788 LOC); many-useState (10 useState slices)

## Low priority (score 1-2) — 206 files

- [src/components/admin/ab-testing/ExperimentFormModal.tsx](../../src/components/admin/ab-testing/ExperimentFormModal.tsx) — **score 2.5** — 421 LOC
  - signals: ternary-explosion (6 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); many-useState (8 useState slices)

- [src/components/admin/ChargePastDueModal.tsx](../../src/components/admin/ChargePastDueModal.tsx) — **score 2.5** — 516 LOC
  - signals: ternary-explosion (11 JSX ternaries); loc-500-800 (516 LOC); long-className (longest className=333 chars); many-useState (7 useState slices)

- [src/components/admin/ChargePastDueUserModal.tsx](../../src/components/admin/ChargePastDueUserModal.tsx) — **score 2.5** — 676 LOC
  - signals: ternary-explosion (14 JSX ternaries); loc-500-800 (676 LOC); long-className (longest className=328 chars); many-useState (12 useState slices)

- [src/components/admin/MonthlyRedeemablesCampaignPanel.tsx](../../src/components/admin/MonthlyRedeemablesCampaignPanel.tsx) — **score 2.5** — 568 LOC
  - signals: ternary-explosion (16 JSX ternaries); loc-500-800 (568 LOC); long-className (longest className=479 chars); many-useState (11 useState slices)

- [src/components/admin/PromoBannerTextList.tsx](../../src/components/admin/PromoBannerTextList.tsx) — **score 2.5** — 228 LOC
  - signals: ternary-explosion (5 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); long-className (longest className=358 chars)

- [src/components/admin/PromoLinkList.tsx](../../src/components/admin/PromoLinkList.tsx) — **score 2.5** — 396 LOC
  - signals: ternary-explosion (12 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); long-className (longest className=411 chars)

- [src/components/auth/EmailVerificationModal.tsx](../../src/components/auth/EmailVerificationModal.tsx) — **score 2.5** — 576 LOC
  - signals: ternary-explosion (7 JSX ternaries); loc-500-800 (576 LOC); long-className (longest className=347 chars); many-useState (10 useState slices)

- [src/components/features/MiniDrawsContent.tsx](../../src/components/features/MiniDrawsContent.tsx) — **score 2.5** — 576 LOC
  - signals: ternary-explosion (10 JSX ternaries); loc-500-800 (576 LOC); long-className (longest className=381 chars); many-useState (7 useState slices)

- [src/components/features/PartnerDiscountQueue.tsx](../../src/components/features/PartnerDiscountQueue.tsx) — **score 2.5** — 774 LOC
  - signals: ternary-explosion (11 JSX ternaries); loc-500-800 (774 LOC); many-arbitraries (27 arbitrary-value classNames); many-useState (6 useState slices)

- [src/components/features/ShopContent.tsx](../../src/components/features/ShopContent.tsx) — **score 2.5** — 531 LOC
  - signals: ternary-explosion (8 JSX ternaries); loc-500-800 (531 LOC); long-className (longest className=361 chars); many-useState (7 useState slices)

- [src/components/modals/AdminScheduledPromoCalendarModal.tsx](../../src/components/modals/AdminScheduledPromoCalendarModal.tsx) — **score 2.5** — 360 LOC
  - signals: ternary-explosion (7 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); many-useState (9 useState slices)

- [src/components/modals/RenewalFailedModal/PaymentForm.tsx](../../src/components/modals/RenewalFailedModal/PaymentForm.tsx) — **score 2.5** — 255 LOC
  - signals: ternary-explosion (6 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations); many-arbitraries (20 arbitrary-value classNames)

- [src/components/modals/RevenueDetailModal.tsx](../../src/components/modals/RevenueDetailModal.tsx) — **score 2.5** — 731 LOC
  - signals: ternary-explosion (17 JSX ternaries); loc-500-800 (731 LOC); long-className (longest className=441 chars); many-useState (7 useState slices)

- [src/components/modals/ui/DateTimePicker.tsx](../../src/components/modals/ui/DateTimePicker.tsx) — **score 2.5** — 712 LOC
  - signals: ternary-explosion (11 JSX ternaries); loc-500-800 (712 LOC); long-className (longest className=712 chars); many-useState (5 useState slices)

- [src/app/(site)/my-account/page.tsx](../../src/app/(site)/my-account/page.tsx) — **score 2.5** — 532 LOC
  - signals: ternary-explosion (12 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations); loc-500-800 (532 LOC)

- [src/app/admin/component/overview/MembershipBreakdownSection.tsx](../../src/app/admin/component/overview/MembershipBreakdownSection.tsx) — **score 2.5** — 283 LOC
  - signals: ternary-explosion (4 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components); long-className (longest className=314 chars)

- [src/components/admin/BonusEntryPromoList.tsx](../../src/components/admin/BonusEntryPromoList.tsx) — **score 2** — 290 LOC
  - signals: ternary-explosion (4 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components)

- [src/components/admin/MilestoneRewardsPanel.tsx](../../src/components/admin/MilestoneRewardsPanel.tsx) — **score 2** — 280 LOC
  - signals: ternary-explosion (12 JSX ternaries); long-className (longest className=378 chars); many-useState (6 useState slices)

- [src/components/admin/ScheduledPromoList.tsx](../../src/components/admin/ScheduledPromoList.tsx) — **score 2** — 259 LOC
  - signals: ternary-explosion (5 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components)

- [src/components/admin/SpendByUrlSection.tsx](../../src/components/admin/SpendByUrlSection.tsx) — **score 2** — 496 LOC
  - signals: ternary-explosion (26 JSX ternaries); multiple-concerns (3 concern buckets: hooks, components, integrations)

- [src/components/banners/FloatingCountdownBanner.tsx](../../src/components/banners/FloatingCountdownBanner.tsx) — **score 2** — 400 LOC
  - signals: ternary-explosion (27 JSX ternaries); long-className (longest className=373 chars); many-useState (10 useState slices)

- [src/components/features/MiniDrawCard.tsx](../../src/components/features/MiniDrawCard.tsx) — **score 2** — 334 LOC
  - signals: ternary-explosion (13 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components)

- [src/components/features/ProductCategories.tsx](../../src/components/features/ProductCategories.tsx) — **score 2** — 402 LOC
  - signals: ternary-explosion (4 JSX ternaries); many-arbitraries (28 arbitrary-value classNames); long-className (longest className=442 chars)

- [src/components/features/RedeemablesWallet.tsx](../../src/components/features/RedeemablesWallet.tsx) — **score 2** — 228 LOC
  - signals: ternary-explosion (6 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components)

- [src/components/loading/PaymentProcessingScreen.tsx](../../src/components/loading/PaymentProcessingScreen.tsx) — **score 2** — 348 LOC
  - signals: ternary-explosion (5 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components)

- [src/components/modals/AdminMiniDrawModal.tsx](../../src/components/modals/AdminMiniDrawModal.tsx) — **score 2** — 352 LOC
  - signals: ternary-explosion (8 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components)

- [src/components/modals/AdminMonthlyRedeemablesModal.tsx](../../src/components/modals/AdminMonthlyRedeemablesModal.tsx) — **score 2** — 546 LOC
  - signals: ternary-explosion (10 JSX ternaries); loc-500-800 (546 LOC); many-useState (8 useState slices)

- [src/components/modals/AdminPromoBannerTextModal.tsx](../../src/components/modals/AdminPromoBannerTextModal.tsx) — **score 2** — 478 LOC
  - signals: ternary-explosion (4 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components)

- [src/components/modals/AdminPromoLinkModal.tsx](../../src/components/modals/AdminPromoLinkModal.tsx) — **score 2** — 648 LOC
  - signals: ternary-explosion (6 JSX ternaries); loc-500-800 (648 LOC); many-useState (7 useState slices)

- [src/components/modals/CancellationUpsellModal/LoseGrid.tsx](../../src/components/modals/CancellationUpsellModal/LoseGrid.tsx) — **score 2** — 104 LOC
  - signals: ternary-explosion (4 JSX ternaries); many-arbitraries (38 arbitrary-value classNames); long-className (longest className=481 chars)

- [src/components/modals/MiniDrawEditModal.tsx](../../src/components/modals/MiniDrawEditModal.tsx) — **score 2** — 468 LOC
  - signals: ternary-explosion (5 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components)

- [src/components/modals/ParticipantsModal.tsx](../../src/components/modals/ParticipantsModal.tsx) — **score 2** — 433 LOC
  - signals: ternary-explosion (6 JSX ternaries); long-className (longest className=310 chars); many-useState (6 useState slices)

- [src/components/modals/ui/ModalContainer.tsx](../../src/components/modals/ui/ModalContainer.tsx) — **score 2** — 513 LOC
  - signals: ternary-explosion (5 JSX ternaries); loc-500-800 (513 LOC); long-className (longest className=417 chars)

- [src/components/modals/UnifiedModalManager.tsx](../../src/components/modals/UnifiedModalManager.tsx) — **score 2** — 275 LOC
  - signals: ternary-explosion (7 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, models)

- [src/components/modals/UserSearchModal.tsx](../../src/components/modals/UserSearchModal.tsx) — **score 2** — 448 LOC
  - signals: ternary-explosion (4 JSX ternaries); long-className (longest className=378 chars); many-useState (6 useState slices)

- [src/components/sections/promo/PromoHero.tsx](../../src/components/sections/promo/PromoHero.tsx) — **score 2** — 182 LOC
  - signals: ternary-explosion (5 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components)

- [src/components/sections/promo/PromotionsAccountButton.tsx](../../src/components/sections/promo/PromotionsAccountButton.tsx) — **score 2** — 159 LOC
  - signals: ternary-explosion (4 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components)

- [src/components/ui/BirthdatePicker.tsx](../../src/components/ui/BirthdatePicker.tsx) — **score 2** — 403 LOC
  - signals: ternary-explosion (15 JSX ternaries); many-arbitraries (24 arbitrary-value classNames); long-className (longest className=596 chars)

- [src/app/(site)/affiliate/page.tsx](../../src/app/(site)/affiliate/page.tsx) — **score 2** — 670 LOC
  - signals: ternary-explosion (12 JSX ternaries); loc-500-800 (670 LOC); many-useState (12 useState slices)

- [src/app/(site)/checkout/success/components/CheckoutSuccessClient.tsx](../../src/app/(site)/checkout/success/components/CheckoutSuccessClient.tsx) — **score 2** — 278 LOC
  - signals: ternary-explosion (4 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components)

- [src/app/(site)/draw-results/components/DrawResultCard.tsx](../../src/app/(site)/draw-results/components/DrawResultCard.tsx) — **score 2** — 125 LOC
  - signals: multiple-concerns (3 concern buckets: hooks, services, components); many-arbitraries (22 arbitrary-value classNames); long-className (longest className=382 chars)

- [src/app/(site)/my-account/benefits/page.tsx](../../src/app/(site)/my-account/benefits/page.tsx) — **score 2** — 181 LOC
  - signals: ternary-explosion (5 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations)

- [src/app/(site)/my-account/components/MajorDrawHeaderStrip.tsx](../../src/app/(site)/my-account/components/MajorDrawHeaderStrip.tsx) — **score 2** — 179 LOC
  - signals: ternary-explosion (4 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components)

- [src/app/(site)/my-account/components/settings/PasswordTab.tsx](../../src/app/(site)/my-account/components/settings/PasswordTab.tsx) — **score 2** — 248 LOC
  - signals: ternary-explosion (8 JSX ternaries); long-className (longest className=346 chars); many-useState (7 useState slices)

- [src/app/(site)/my-account/draws/page.tsx](../../src/app/(site)/my-account/draws/page.tsx) — **score 2** — 370 LOC
  - signals: ternary-explosion (7 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations)

- [src/app/(site)/my-account/settings/page.tsx](../../src/app/(site)/my-account/settings/page.tsx) — **score 2** — 210 LOC
  - signals: ternary-explosion (4 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations)

- [src/app/admin/component/overview/AdvertisingBreakdownSection.tsx](../../src/app/admin/component/overview/AdvertisingBreakdownSection.tsx) — **score 2** — 384 LOC
  - signals: ternary-explosion (8 JSX ternaries); multiple-concerns (4 concern buckets: hooks, services, components, integrations)

- [src/app/admin/component/PastDueChargeHistoryDrawer.tsx](../../src/app/admin/component/PastDueChargeHistoryDrawer.tsx) — **score 2** — 327 LOC
  - signals: ternary-explosion (5 JSX ternaries); multiple-concerns (3 concern buckets: hooks, services, components)

- [src/app/admin/component/PromoManagement.tsx](../../src/app/admin/component/PromoManagement.tsx) — **score 2** — 366 LOC
  - signals: multiple-concerns (4 concern buckets: hooks, services, components, integrations); long-className (longest className=412 chars); many-useState (9 useState slices)

- [src/app/admin/component/UpcomingDraws.tsx](../../src/app/admin/component/UpcomingDraws.tsx) — **score 2** — 625 LOC
  - signals: multiple-concerns (3 concern buckets: hooks, services, components); loc-500-800 (625 LOC); many-useState (9 useState slices)

- [src/components/admin/BulkRecoverInvoicesModal.tsx](../../src/components/admin/BulkRecoverInvoicesModal.tsx) — **score 1.5** — 368 LOC
  - signals: ternary-explosion (13 JSX ternaries); long-className (longest className=314 chars)

- [src/components/admin/metrics/shared/MetricCard.tsx](../../src/components/admin/metrics/shared/MetricCard.tsx) — **score 1.5** — 169 LOC
  - signals: ternary-explosion (5 JSX ternaries); long-className (longest className=331 chars)

- [src/components/admin/promo-analytics/UTMCampaignBreakdownTable.tsx](../../src/components/admin/promo-analytics/UTMCampaignBreakdownTable.tsx) — **score 1.5** — 229 LOC
  - signals: ternary-explosion (5 JSX ternaries); long-className (longest className=693 chars)

- [src/components/FacebookPixel.tsx](../../src/components/FacebookPixel.tsx) — **score 1.5** — 707 LOC
  - signals: ternary-explosion (13 JSX ternaries); loc-500-800 (707 LOC)

- [src/components/loading/ProgressLoader.tsx](../../src/components/loading/ProgressLoader.tsx) — **score 1.5** — 199 LOC
  - signals: ternary-explosion (5 JSX ternaries); long-className (longest className=383 chars)

- [src/components/loading/SpinnerLoader.tsx](../../src/components/loading/SpinnerLoader.tsx) — **score 1.5** — 127 LOC
  - signals: ternary-explosion (6 JSX ternaries); long-className (longest className=378 chars)

- [src/components/loading/SuccessScreen.tsx](../../src/components/loading/SuccessScreen.tsx) — **score 1.5** — 284 LOC
  - signals: ternary-explosion (4 JSX ternaries); long-className (longest className=612 chars)

- [src/components/modals/AdminAlternatingMultiplierModal.tsx](../../src/components/modals/AdminAlternatingMultiplierModal.tsx) — **score 1.5** — 350 LOC
  - signals: ternary-explosion (4 JSX ternaries); long-className (longest className=315 chars)

- [src/components/modals/AdminPromoToggle.tsx](../../src/components/modals/AdminPromoToggle.tsx) — **score 1.5** — 166 LOC
  - signals: ternary-explosion (6 JSX ternaries); long-className (longest className=602 chars)

- [src/components/modals/ChannelDetailModal.tsx](../../src/components/modals/ChannelDetailModal.tsx) — **score 1.5** — 233 LOC
  - signals: multiple-concerns (3 concern buckets: hooks, services, components); long-className (longest className=399 chars)

- [src/components/modals/ExportModal.tsx](../../src/components/modals/ExportModal.tsx) — **score 1.5** — 222 LOC
  - signals: ternary-explosion (4 JSX ternaries); long-className (longest className=340 chars)

- [src/components/modals/MembershipByPackageDetailModal.tsx](../../src/components/modals/MembershipByPackageDetailModal.tsx) — **score 1.5** — 291 LOC
  - signals: ternary-explosion (4 JSX ternaries); long-className (longest className=510 chars)

- [src/components/modals/PixelConsentModal.tsx](../../src/components/modals/PixelConsentModal.tsx) — **score 1.5** — 217 LOC
  - signals: ternary-explosion (4 JSX ternaries); long-className (longest className=307 chars)

- ~~src/components/modals/PrizeSpecificationsModal.tsx~~ — **DECOMPOSED 2026-05-12** → folder at [src/components/modals/PrizeSpecificationsModal/](../../src/components/modals/PrizeSpecificationsModal/) (index/Hero/TabBar/TrustBar/SpecCard). SpecCard adopts an icon-badge header, brand-coloured dot bullets (replacing `Check` icons), and removes the left-rule accent + content indent; summary banner softened to a neutral fill with a thinner brand-tinted left rule. Public API preserved.

- [src/components/modals/SavedPaymentMethodsModal.tsx](../../src/components/modals/SavedPaymentMethodsModal.tsx) — **score 1.5** — 254 LOC
  - signals: ternary-explosion (4 JSX ternaries); long-className (longest className=374 chars)

- [src/components/modals/ui/Dropdown.tsx](../../src/components/modals/ui/Dropdown.tsx) — **score 1.5** — 338 LOC
  - signals: ternary-explosion (10 JSX ternaries); long-className (longest className=988 chars)

- [src/components/modals/ui/ImageUpload.tsx](../../src/components/modals/ui/ImageUpload.tsx) — **score 1.5** — 463 LOC
  - signals: ternary-explosion (4 JSX ternaries); long-className (longest className=352 chars)

- [src/components/modals/ui/Input.tsx](../../src/components/modals/ui/Input.tsx) — **score 1.5** — 130 LOC
  - signals: ternary-explosion (4 JSX ternaries); long-className (longest className=794 chars)

- [src/components/modals/ui/Select.tsx](../../src/components/modals/ui/Select.tsx) — **score 1.5** — 363 LOC
  - signals: ternary-explosion (8 JSX ternaries); long-className (longest className=674 chars)

- [src/components/sections/promo/GiveawayCountdownTimer.tsx](../../src/components/sections/promo/GiveawayCountdownTimer.tsx) — **score 1.5** — 419 LOC
  - signals: ternary-explosion (11 JSX ternaries); long-className (longest className=539 chars)

- [src/components/sections/promo/prize-selection/OtherToolsetsCarousel.tsx](../../src/components/sections/promo/prize-selection/OtherToolsetsCarousel.tsx) — **score 1.5** — 243 LOC
  - signals: multiple-concerns (3 concern buckets: hooks, services, components); long-className (longest className=352 chars)

- [src/components/sections/promo/prize-selection/PowerToolsetCarousel.tsx](../../src/components/sections/promo/prize-selection/PowerToolsetCarousel.tsx) — **score 1.5** — 443 LOC
  - signals: ternary-explosion (12 JSX ternaries); many-arbitraries (46 arbitrary-value classNames)

- [src/components/sections/promo/prize-selection/ToolboxSelector.tsx](../../src/components/sections/promo/prize-selection/ToolboxSelector.tsx) — **score 1.5** — 176 LOC
  - signals: ternary-explosion (4 JSX ternaries); long-className (longest className=409 chars)

- [src/components/ui/PromoBadge.tsx](../../src/components/ui/PromoBadge.tsx) — **score 1.5** — 162 LOC
  - signals: ternary-explosion (4 JSX ternaries); long-className (longest className=337 chars)

- [src/components/ui/RichTextEditor.tsx](../../src/components/ui/RichTextEditor.tsx) — **score 1.5** — 302 LOC
  - signals: ternary-explosion (11 JSX ternaries); long-className (longest className=992 chars)

- [src/components/upload/ImageUpload.tsx](../../src/components/upload/ImageUpload.tsx) — **score 1.5** — 328 LOC
  - signals: ternary-explosion (6 JSX ternaries); long-className (longest className=456 chars)

- [src/app/(site)/affiliate/login/page.tsx](../../src/app/(site)/affiliate/login/page.tsx) — **score 1.5** — 233 LOC
  - signals: many-arbitraries (112 arbitrary-value classNames); long-className (longest className=333 chars); many-useState (5 useState slices)

- [src/app/(site)/mini-draws/[id]/components/DetailHeroBanner.tsx](../../src/app/(site)/mini-draws/[id]/components/DetailHeroBanner.tsx) — **score 1.5** — 206 LOC
  - signals: ternary-explosion (4 JSX ternaries); long-className (longest className=304 chars)

- [src/app/(site)/mini-draws/[id]/components/MiniDrawTabs.tsx](../../src/app/(site)/mini-draws/[id]/components/MiniDrawTabs.tsx) — **score 1.5** — 379 LOC
  - signals: ternary-explosion (7 JSX ternaries); long-className (longest className=360 chars)

- [src/app/(site)/my-account/components/MembershipStatus.tsx](../../src/app/(site)/my-account/components/MembershipStatus.tsx) — **score 1.5** — 319 LOC
  - signals: multiple-concerns (3 concern buckets: hooks, services, components); long-className (longest className=351 chars)

- [src/app/(site)/my-account/support/page.tsx](../../src/app/(site)/my-account/support/page.tsx) — **score 1.5** — 131 LOC
  - signals: multiple-concerns (4 concern buckets: hooks, services, components, integrations); many-arbitraries (21 arbitrary-value classNames)

- [src/app/(site)/partner/components/PartnershipFormSection.tsx](../../src/app/(site)/partner/components/PartnershipFormSection.tsx) — **score 1.5** — 413 LOC
  - signals: ternary-explosion (8 JSX ternaries); many-useState (5 useState slices)

- [src/app/(site)/rewards/components/PartnerDiscounts.tsx](../../src/app/(site)/rewards/components/PartnerDiscounts.tsx) — **score 1.5** — 623 LOC
  - signals: ternary-explosion (6 JSX ternaries); loc-500-800 (623 LOC)

- [src/app/(site)/rewards/components/RewardsHistory.tsx](../../src/app/(site)/rewards/components/RewardsHistory.tsx) — **score 1.5** — 332 LOC
  - signals: ternary-explosion (4 JSX ternaries); many-useState (5 useState slices)

- [src/app/(site)/shop/[slug]/components/ProductTabs.tsx](../../src/app/(site)/shop/[slug]/components/ProductTabs.tsx) — **score 1.5** — 385 LOC
  - signals: ternary-explosion (6 JSX ternaries); long-className (longest className=314 chars)

- [src/app/(site)/shop/[slug]/page.tsx](../../src/app/(site)/shop/[slug]/page.tsx) — **score 1.5** — 330 LOC
  - signals: multiple-concerns (3 concern buckets: services, models, components); long-className (longest className=2356 chars)

- [src/app/admin/component/AdminSidebar.tsx](../../src/app/admin/component/AdminSidebar.tsx) — **score 1.5** — 461 LOC
  - signals: ternary-explosion (9 JSX ternaries); long-className (longest className=384 chars)

- [src/app/admin/component/AdminStatsCard.tsx](../../src/app/admin/component/AdminStatsCard.tsx) — **score 1.5** — 186 LOC
  - signals: ternary-explosion (4 JSX ternaries); long-className (longest className=345 chars)

- [src/app/admin/component/overview/RenewalsDashboardSection.tsx](../../src/app/admin/component/overview/RenewalsDashboardSection.tsx) — **score 1.5** — 136 LOC
  - signals: ternary-explosion (4 JSX ternaries); long-className (longest className=397 chars)

- [src/app/reset-password/page.tsx](../../src/app/reset-password/page.tsx) — **score 1.5** — 284 LOC
  - signals: ternary-explosion (5 JSX ternaries); many-useState (6 useState slices)

- [src/components/admin/ab-testing/ExperimentDetailModal.tsx](../../src/components/admin/ab-testing/ExperimentDetailModal.tsx) — **score 1** — 416 LOC
  - signals: ternary-explosion (12 JSX ternaries)

- [src/components/admin/ab-testing/ExperimentResultsDashboard.tsx](../../src/components/admin/ab-testing/ExperimentResultsDashboard.tsx) — **score 1** — 345 LOC
  - signals: ternary-explosion (11 JSX ternaries)

- [src/components/admin/AlternatingMultiplierList.tsx](../../src/components/admin/AlternatingMultiplierList.tsx) — **score 1** — 204 LOC
  - signals: multiple-concerns (3 concern buckets: hooks, services, components)

- [src/components/admin/metrics/users/AgeBreakdown.tsx](../../src/components/admin/metrics/users/AgeBreakdown.tsx) — **score 1** — 91 LOC
  - signals: ternary-explosion (4 JSX ternaries)

- [src/components/admin/metrics/users/AgeBreakdownTable.tsx](../../src/components/admin/metrics/users/AgeBreakdownTable.tsx) — **score 1** — 73 LOC
  - signals: ternary-explosion (4 JSX ternaries)

- [src/components/admin/RecoverInvoiceModal.tsx](../../src/components/admin/RecoverInvoiceModal.tsx) — **score 1** — 333 LOC
  - signals: ternary-explosion (6 JSX ternaries)

- [src/components/admin/spend-by-url/SpendByUrlAdBreakdownTable.tsx](../../src/components/admin/spend-by-url/SpendByUrlAdBreakdownTable.tsx) — **score 1** — 391 LOC
  - signals: ternary-explosion (22 JSX ternaries)

- [src/components/admin/submissions/SubmissionDetailModal.tsx](../../src/components/admin/submissions/SubmissionDetailModal.tsx) — **score 1** — 329 LOC
  - signals: ternary-explosion (11 JSX ternaries)

- [src/components/admin/ui/AdminBadge.tsx](../../src/components/admin/ui/AdminBadge.tsx) — **score 1** — 346 LOC
  - signals: ternary-explosion (12 JSX ternaries)

- [src/components/admin/UserStatsCard.tsx](../../src/components/admin/UserStatsCard.tsx) — **score 1** — 183 LOC
  - signals: ternary-explosion (4 JSX ternaries)

- [src/components/auth/SubscriptionProtected.tsx](../../src/components/auth/SubscriptionProtected.tsx) — **score 1** — 83 LOC
  - signals: multiple-concerns (3 concern buckets: hooks, components, integrations)

- [src/components/cards/WinnerCard.tsx](../../src/components/cards/WinnerCard.tsx) — **score 1** — 132 LOC
  - signals: many-arbitraries (24 arbitrary-value classNames); long-className (longest className=377 chars)

- [src/components/email-preview/InvoicePreview.tsx](../../src/components/email-preview/InvoicePreview.tsx) — **score 1** — 244 LOC
  - signals: styled-jsx-block (40 LOC of styled-jsx)

- [src/components/email-preview/PaymentFailedPreview.tsx](../../src/components/email-preview/PaymentFailedPreview.tsx) — **score 1** — 433 LOC
  - signals: styled-jsx-block (48 LOC of styled-jsx)

- [src/components/email-preview/SubscriptionRenewalPreview.tsx](../../src/components/email-preview/SubscriptionRenewalPreview.tsx) — **score 1** — 199 LOC
  - signals: styled-jsx-block (40 LOC of styled-jsx)

- [src/components/error/ErrorRecovery.tsx](../../src/components/error/ErrorRecovery.tsx) — **score 1** — 279 LOC
  - signals: ternary-explosion (7 JSX ternaries)

- [src/components/features/MiniDrawDetailClient.tsx](../../src/components/features/MiniDrawDetailClient.tsx) — **score 1** — 256 LOC
  - signals: ternary-explosion (4 JSX ternaries)

- [src/components/features/MiniDrawsFilters.tsx](../../src/components/features/MiniDrawsFilters.tsx) — **score 1** — 166 LOC
  - signals: ternary-explosion (4 JSX ternaries)

- [src/components/features/ProductFilters.tsx](../../src/components/features/ProductFilters.tsx) — **score 1** — 400 LOC
  - signals: ternary-explosion (11 JSX ternaries)

- [src/components/KlaviyoPageTracker.tsx](../../src/components/KlaviyoPageTracker.tsx) — **score 1** — 82 LOC
  - signals: multiple-concerns (3 concern buckets: hooks, services, components)

- [src/components/loading/SkeletonLoader.tsx](../../src/components/loading/SkeletonLoader.tsx) — **score 1** — 123 LOC
  - signals: ternary-explosion (4 JSX ternaries)

- [src/components/modals/AdminBonusEntryPromoModal.tsx](../../src/components/modals/AdminBonusEntryPromoModal.tsx) — **score 1** — 483 LOC
  - signals: ternary-explosion (4 JSX ternaries)

- [src/components/modals/AdminMilestoneRewardModal.tsx](../../src/components/modals/AdminMilestoneRewardModal.tsx) — **score 1** — 279 LOC
  - signals: ternary-explosion (7 JSX ternaries)

- [src/components/modals/CancellationUpsellModal/ActionRow.tsx](../../src/components/modals/CancellationUpsellModal/ActionRow.tsx) — **score 1** — 92 LOC
  - signals: many-arbitraries (36 arbitrary-value classNames); long-className (longest className=443 chars)

- [src/components/modals/CancellationUpsellModal/index.tsx](../../src/components/modals/CancellationUpsellModal/index.tsx) — **score 1** — 320 LOC
  - signals: multiple-concerns (4 concern buckets: hooks, services, components, integrations)

- [src/components/modals/DowngradeConfirmModal/BenefitsBody.tsx](../../src/components/modals/DowngradeConfirmModal/BenefitsBody.tsx) — **score 1** — 172 LOC
  - signals: :global()-selectors (1 :global() selectors)

- [src/components/modals/GateClosedModal.tsx](../../src/components/modals/GateClosedModal.tsx) — **score 1** — 186 LOC
  - signals: multiple-concerns (3 concern buckets: hooks, services, components)

- ~~src/components/modals/PackageDetailModal.tsx~~ — **DECOMPOSED 2026-05-08** → folder at [src/components/modals/PackageDetailModal/](../../src/components/modals/PackageDetailModal/) (Shell/Hero/Body/ActionRow + tier-themed CSS module + 7-combo smoke test). Public API preserved; consumers (Header, my-account/page, MajorDrawOverview, ModalsGalleryClient) need no changes.

- [src/components/modals/PackageInclusionsSlideUp.tsx](../../src/components/modals/PackageInclusionsSlideUp.tsx) — **score 1** — 150 LOC
  - signals: multiple-concerns (3 concern buckets: hooks, services, components)

- [src/components/modals/PromoPageDetailModal.tsx](../../src/components/modals/PromoPageDetailModal.tsx) — **score 1** — 134 LOC
  - signals: multiple-concerns (3 concern buckets: hooks, services, components)

- [src/components/modals/PromoWelcomeModal.tsx](../../src/components/modals/PromoWelcomeModal.tsx) — **score 1** — 292 LOC
  - signals: ternary-explosion (4 JSX ternaries)

- [src/components/modals/RenewalFailedModal/AlertBanner.tsx](../../src/components/modals/RenewalFailedModal/AlertBanner.tsx) — **score 1** — 71 LOC
  - signals: ternary-explosion (4 JSX ternaries)

- [src/components/modals/RenewalFailedModal/InlineCardSetup.tsx](../../src/components/modals/RenewalFailedModal/InlineCardSetup.tsx) — **score 1** — 89 LOC
  - signals: multiple-concerns (3 concern buckets: services, components, integrations)

- [src/components/payment/StripeInlineCardSetupForm.tsx](../../src/components/payment/StripeInlineCardSetupForm.tsx) — **score 1** — 119 LOC
  - signals: multiple-concerns (4 concern buckets: hooks, services, components, integrations)

- [src/components/sections/LatestWinnerHero.tsx](../../src/components/sections/LatestWinnerHero.tsx) — **score 1** — 213 LOC
  - signals: long-className (longest className=501 chars); many-useState (5 useState slices)

- [src/components/sections/promo/GiveawayDetails.tsx](../../src/components/sections/promo/GiveawayDetails.tsx) — **score 1** — 168 LOC
  - signals: multiple-concerns (3 concern buckets: hooks, services, components)

- [src/components/sections/promo/PartnerBenefitsPromoSection.tsx](../../src/components/sections/promo/PartnerBenefitsPromoSection.tsx) — **score 1** — 309 LOC
  - signals: multiple-concerns (3 concern buckets: hooks, services, components)

- [src/components/sections/promo/PromoFAQs.tsx](../../src/components/sections/promo/PromoFAQs.tsx) — **score 1** — 77 LOC
  - signals: ternary-explosion (6 JSX ternaries)

- [src/components/seo/StructuredData.tsx](../../src/components/seo/StructuredData.tsx) — **score 1** — 288 LOC
  - signals: ternary-explosion (10 JSX ternaries)

- [src/components/tracking/KlaviyoUserIdentifier.tsx](../../src/components/tracking/KlaviyoUserIdentifier.tsx) — **score 1** — 100 LOC
  - signals: multiple-concerns (3 concern buckets: hooks, services, integrations)

- [src/components/ui/BrandLogoCard.tsx](../../src/components/ui/BrandLogoCard.tsx) — **score 1** — 269 LOC
  - signals: ternary-explosion (4 JSX ternaries)

- [src/components/ui/CompletedDrawRibbon.tsx](../../src/components/ui/CompletedDrawRibbon.tsx) — **score 1** — 98 LOC
  - signals: ternary-explosion (4 JSX ternaries)

- [src/components/ui/EntryProgressBar.tsx](../../src/components/ui/EntryProgressBar.tsx) — **score 1** — 95 LOC
  - signals: ternary-explosion (5 JSX ternaries)

- [src/components/ui/FullscreenImageViewer.tsx](../../src/components/ui/FullscreenImageViewer.tsx) — **score 1** — 396 LOC
  - signals: ternary-explosion (8 JSX ternaries)

- [src/components/ui/ThemeToggle.tsx](../../src/components/ui/ThemeToggle.tsx) — **score 1** — 71 LOC
  - signals: ternary-explosion (5 JSX ternaries)

- [src/components/ui/UrgencyClockIcon.tsx](../../src/components/ui/UrgencyClockIcon.tsx) — **score 1** — 165 LOC
  - signals: ternary-explosion (4 JSX ternaries)

- [src/components/UpgradeSuccessToast.tsx](../../src/components/UpgradeSuccessToast.tsx) — **score 1** — 165 LOC
  - signals: multiple-concerns (4 concern buckets: hooks, services, components, integrations)

- [src/app/(site)/draw-results/page.tsx](../../src/app/(site)/draw-results/page.tsx) — **score 1** — 199 LOC
  - signals: multiple-concerns (3 concern buckets: services, models, components)

- [src/app/(site)/membership/components/MembershipPageClient.tsx](../../src/app/(site)/membership/components/MembershipPageClient.tsx) — **score 1** — 258 LOC
  - signals: multiple-concerns (3 concern buckets: hooks, services, components)

- [src/app/(site)/mini-draws/components/HowMiniDrawsWork.tsx](../../src/app/(site)/mini-draws/components/HowMiniDrawsWork.tsx) — **score 1** — 110 LOC
  - signals: ternary-explosion (4 JSX ternaries)

- [src/app/(site)/mini-draws/[id]/page.tsx](../../src/app/(site)/mini-draws/[id]/page.tsx) — **score 1** — 288 LOC
  - signals: multiple-concerns (3 concern buckets: services, models, components)

- [src/app/(site)/my-account/membership/page.tsx](../../src/app/(site)/my-account/membership/page.tsx) — **score 1** — 84 LOC
  - signals: multiple-concerns (4 concern buckets: hooks, services, components, integrations)

- [src/app/admin/component/overview/DashboardSection.tsx](../../src/app/admin/component/overview/DashboardSection.tsx) — **score 1** — 99 LOC
  - signals: ternary-explosion (5 JSX ternaries)

- [src/app/admin/component/overview/KPIMetricsGrid.tsx](../../src/app/admin/component/overview/KPIMetricsGrid.tsx) — **score 1** — 439 LOC
  - signals: ternary-explosion (25 JSX ternaries)

- [src/app/providers.tsx](../../src/app/providers.tsx) — **score 1** — 118 LOC
  - signals: multiple-concerns (4 concern buckets: hooks, services, components, integrations)

- [src/components/admin/DateRangeToggle.tsx](../../src/components/admin/DateRangeToggle.tsx) — **score 0.5** — 98 LOC
  - signals: long-className (longest className=431 chars)

- [src/components/admin/metrics/shared/ComparisonModeToggle.tsx](../../src/components/admin/metrics/shared/ComparisonModeToggle.tsx) — **score 0.5** — 51 LOC
  - signals: long-className (longest className=396 chars)

- [src/components/admin/metrics/shared/MetricsDateFilter.tsx](../../src/components/admin/metrics/shared/MetricsDateFilter.tsx) — **score 0.5** — 70 LOC
  - signals: long-className (longest className=405 chars)

- [src/components/admin/metrics/shared/ViewSwitcher.tsx](../../src/components/admin/metrics/shared/ViewSwitcher.tsx) — **score 0.5** — 50 LOC
  - signals: long-className (longest className=435 chars)

- [src/components/admin/scheduled-promo-calendar/ScheduledPromoMonthGrid.tsx](../../src/components/admin/scheduled-promo-calendar/ScheduledPromoMonthGrid.tsx) — **score 0.5** — 81 LOC
  - signals: long-className (longest className=325 chars)

- [src/components/admin/submissions/ConversationThread.tsx](../../src/components/admin/submissions/ConversationThread.tsx) — **score 0.5** — 108 LOC
  - signals: long-className (longest className=382 chars)

- [src/components/admin/submissions/ReplyForm.tsx](../../src/components/admin/submissions/ReplyForm.tsx) — **score 0.5** — 72 LOC
  - signals: long-className (longest className=334 chars)

- [src/components/auth/OTPVerificationModal.tsx](../../src/components/auth/OTPVerificationModal.tsx) — **score 0.5** — 184 LOC
  - signals: many-useState (6 useState slices)

- [src/components/auth/PasswordlessLoginModal.tsx](../../src/components/auth/PasswordlessLoginModal.tsx) — **score 0.5** — 196 LOC
  - signals: many-useState (5 useState slices)

- [src/components/email-preview/EmailPreviewLayout.tsx](../../src/components/email-preview/EmailPreviewLayout.tsx) — **score 0.5** — 129 LOC
  - signals: long-className (longest className=396 chars)

- [src/components/features/PrizeCategories.tsx](../../src/components/features/PrizeCategories.tsx) — **score 0.5** — 196 LOC
  - signals: many-arbitraries (26 arbitrary-value classNames)

- [src/components/features/ProductSection.tsx](../../src/components/features/ProductSection.tsx) — **score 0.5** — 108 LOC
  - signals: long-className (longest className=354 chars)

- [src/components/filters/WinnerFilterToggle.tsx](../../src/components/filters/WinnerFilterToggle.tsx) — **score 0.5** — 162 LOC
  - signals: long-className (longest className=565 chars)

- [src/components/invoice/InvoiceComponent.tsx](../../src/components/invoice/InvoiceComponent.tsx) — **score 0.5** — 525 LOC
  - signals: loc-500-800 (525 LOC)

- [src/components/modals/AdminProductModal.tsx](../../src/components/modals/AdminProductModal.tsx) — **score 0.5** — 551 LOC
  - signals: loc-500-800 (551 LOC)

- [src/components/modals/CancellationUpsellModal/DowngradeCard.tsx](../../src/components/modals/CancellationUpsellModal/DowngradeCard.tsx) — **score 0.5** — 145 LOC
  - signals: many-arbitraries (57 arbitrary-value classNames)

- [src/components/modals/CancellationUpsellModal/Hero.tsx](../../src/components/modals/CancellationUpsellModal/Hero.tsx) — **score 0.5** — 82 LOC
  - signals: many-arbitraries (32 arbitrary-value classNames)

- [src/components/modals/CancellationUpsellModal/TrustBar.tsx](../../src/components/modals/CancellationUpsellModal/TrustBar.tsx) — **score 0.5** — 46 LOC
  - signals: many-arbitraries (20 arbitrary-value classNames)

- [src/components/modals/DowngradeConfirmModal/Hero.tsx](../../src/components/modals/DowngradeConfirmModal/Hero.tsx) — **score 0.5** — 171 LOC
  - signals: many-arbitraries (29 arbitrary-value classNames)

- [src/components/modals/MajorDrawEditModal.tsx](../../src/components/modals/MajorDrawEditModal.tsx) — **score 0.5** — 525 LOC
  - signals: loc-500-800 (525 LOC)

- [src/components/modals/PartnerModal.tsx](../../src/components/modals/PartnerModal.tsx) — **score 0.5** — 359 LOC
  - signals: many-useState (5 useState slices)

- [src/components/modals/ReferFriendModal.tsx](../../src/components/modals/ReferFriendModal.tsx) — **score 0.5** — 316 LOC
  - signals: long-className (longest className=320 chars)

- [src/components/modals/RenewalFailedModal/Shell.tsx](../../src/components/modals/RenewalFailedModal/Shell.tsx) — **score 0.5** — 263 LOC
  - signals: many-arbitraries (27 arbitrary-value classNames)

- [src/components/modals/ui/Checkbox.tsx](../../src/components/modals/ui/Checkbox.tsx) — **score 0.5** — 78 LOC
  - signals: long-className (longest className=457 chars)

- [src/components/modals/ui/ModalHeader.tsx](../../src/components/modals/ui/ModalHeader.tsx) — **score 0.5** — 142 LOC
  - signals: long-className (longest className=355 chars)

- [src/components/modals/ui/Textarea.tsx](../../src/components/modals/ui/Textarea.tsx) — **score 0.5** — 79 LOC
  - signals: long-className (longest className=674 chars)

- [src/components/modals/UpsellManager.tsx](../../src/components/modals/UpsellManager.tsx) — **score 0.5** — 403 LOC
  - signals: many-useState (7 useState slices)

- [src/components/modals/WinnerEditModal.tsx](../../src/components/modals/WinnerEditModal.tsx) — **score 0.5** — 306 LOC
  - signals: many-useState (6 useState slices)

- [src/components/sections/AboutToolsAustralia.tsx](../../src/components/sections/AboutToolsAustralia.tsx) — **score 0.5** — 174 LOC
  - signals: many-arbitraries (54 arbitrary-value classNames)

- [src/components/sections/CustomerTestimonials.tsx](../../src/components/sections/CustomerTestimonials.tsx) — **score 0.5** — 247 LOC
  - signals: many-arbitraries (21 arbitrary-value classNames)

- [src/components/sections/ExistingPartners.tsx](../../src/components/sections/ExistingPartners.tsx) — **score 0.5** — 230 LOC
  - signals: many-arbitraries (41 arbitrary-value classNames)

- [src/components/sections/GiveawaySection.tsx](../../src/components/sections/GiveawaySection.tsx) — **score 0.5** — 93 LOC
  - signals: many-arbitraries (22 arbitrary-value classNames)

- [src/components/sections/Hero.tsx](../../src/components/sections/Hero.tsx) — **score 0.5** — 220 LOC
  - signals: many-arbitraries (75 arbitrary-value classNames)

- [src/components/sections/HorizontalCountdown.tsx](../../src/components/sections/HorizontalCountdown.tsx) — **score 0.5** — 150 LOC
  - signals: long-className (longest className=355 chars)

- [src/components/sections/NewsletterSection.tsx](../../src/components/sections/NewsletterSection.tsx) — **score 0.5** — 124 LOC
  - signals: long-className (longest className=385 chars)

- [src/components/sections/promo/FloatingGetEntriesButton.tsx](../../src/components/sections/promo/FloatingGetEntriesButton.tsx) — **score 0.5** — 112 LOC
  - signals: long-className (longest className=437 chars)

- [src/components/sections/promo/UnlockDiscounts.tsx](../../src/components/sections/promo/UnlockDiscounts.tsx) — **score 0.5** — 319 LOC
  - signals: long-className (longest className=334 chars)

- [src/components/sections/RecentWinnersCarousel.tsx](../../src/components/sections/RecentWinnersCarousel.tsx) — **score 0.5** — 309 LOC
  - signals: long-className (longest className=515 chars)

- [src/components/ui/Button.tsx](../../src/components/ui/Button.tsx) — **score 0.5** — 94 LOC
  - signals: many-arbitraries (26 arbitrary-value classNames)

- [src/components/ui/FAQSection.tsx](../../src/components/ui/FAQSection.tsx) — **score 0.5** — 113 LOC
  - signals: long-className (longest className=577 chars)

- [src/components/ui/FloatingGiftIcon.tsx](../../src/components/ui/FloatingGiftIcon.tsx) — **score 0.5** — 93 LOC
  - signals: long-className (longest className=301 chars)

- [src/components/ui/MembershipBadge.tsx](../../src/components/ui/MembershipBadge.tsx) — **score 0.5** — 172 LOC
  - signals: long-className (longest className=339 chars)

- [src/components/ui/Toast.tsx](../../src/components/ui/Toast.tsx) — **score 0.5** — 490 LOC
  - signals: many-useState (11 useState slices)

- [src/app/(site)/competition-term-majordraw/page.tsx](../../src/app/(site)/competition-term-majordraw/page.tsx) — **score 0.5** — 565 LOC
  - signals: loc-500-800 (565 LOC)

- [src/app/(site)/contact/page.tsx](../../src/app/(site)/contact/page.tsx) — **score 0.5** — 161 LOC
  - signals: many-arbitraries (54 arbitrary-value classNames)

- [src/app/(site)/mini-draws/[id]/components/MiniDrawImageGallery.tsx](../../src/app/(site)/mini-draws/[id]/components/MiniDrawImageGallery.tsx) — **score 0.5** — 175 LOC
  - signals: long-className (longest className=378 chars)

- [src/app/(site)/my-account/components/BottomNav.tsx](../../src/app/(site)/my-account/components/BottomNav.tsx) — **score 0.5** — 91 LOC
  - signals: long-className (longest className=432 chars)

- [src/app/(site)/my-account/components/DashboardHeader.tsx](../../src/app/(site)/my-account/components/DashboardHeader.tsx) — **score 0.5** — 118 LOC
  - signals: long-className (longest className=384 chars)

- [src/app/(site)/my-account/components/QuickActions.tsx](../../src/app/(site)/my-account/components/QuickActions.tsx) — **score 0.5** — 74 LOC
  - signals: long-className (longest className=685 chars)

- [src/app/(site)/partner/components/PartnerBenefits.tsx](../../src/app/(site)/partner/components/PartnerBenefits.tsx) — **score 0.5** — 159 LOC
  - signals: many-arbitraries (34 arbitrary-value classNames)

- [src/app/(site)/partner/components/PartnerHero.tsx](../../src/app/(site)/partner/components/PartnerHero.tsx) — **score 0.5** — 250 LOC
  - signals: many-arbitraries (50 arbitrary-value classNames)

- [src/app/(site)/shop/[slug]/components/ProductInteractions.tsx](../../src/app/(site)/shop/[slug]/components/ProductInteractions.tsx) — **score 0.5** — 190 LOC
  - signals: long-className (longest className=507 chars)

- [src/app/(site)/terms/page.tsx](../../src/app/(site)/terms/page.tsx) — **score 0.5** — 547 LOC
  - signals: loc-500-800 (547 LOC)

- [src/app/admin/component/AdminPage.tsx](../../src/app/admin/component/AdminPage.tsx) — **score 0.5** — 274 LOC
  - signals: long-className (longest className=358 chars)

- [src/app/admin/component/overview/DashboardOverview.tsx](../../src/app/admin/component/overview/DashboardOverview.tsx) — **score 0.5** — 331 LOC
  - signals: many-useState (10 useState slices)

- [src/app/admin/component/overview/QuickActionsPanel.tsx](../../src/app/admin/component/overview/QuickActionsPanel.tsx) — **score 0.5** — 194 LOC
  - signals: long-className (longest className=413 chars)

- [src/app/admin/component/overview/UpcomingRenewalsSection.tsx](../../src/app/admin/component/overview/UpcomingRenewalsSection.tsx) — **score 0.5** — 171 LOC
  - signals: long-className (longest className=488 chars)

- [src/app/not-found.tsx](../../src/app/not-found.tsx) — **score 0.5** — 97 LOC
  - signals: long-className (longest className=302 chars)

