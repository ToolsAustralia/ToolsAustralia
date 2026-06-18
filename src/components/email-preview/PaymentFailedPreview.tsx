"use client";

import React from "react";
import DiskTemplatePreview from "./DiskTemplatePreview";

/** Signup/membership payment failed (Klaviyo `Subscription Payment Failed`). Source: email-templates/klaviyo/subscription-payment-failed-email-template.html */
const PaymentFailedPreview: React.FC = () => (
  <DiskTemplatePreview templateKey="payment-failed" title="Signup payment failed (Klaviyo)" badge="Klaviyo" />
);

export default PaymentFailedPreview;
