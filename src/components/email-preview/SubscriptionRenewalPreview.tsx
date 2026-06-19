"use client";

import React from "react";
import DiskTemplatePreview from "./DiskTemplatePreview";

/** Renewal success email (Klaviyo `Subscription Renewed`). Source: email-templates/klaviyo/subscription-renewal-email-template.html */
const SubscriptionRenewalPreview: React.FC = () => (
  <DiskTemplatePreview templateKey="subscription-renewal" title="Renewal success (Klaviyo)" badge="Klaviyo" />
);

export default SubscriptionRenewalPreview;
