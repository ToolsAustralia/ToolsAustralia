"use client";

import React from "react";
import DiskTemplatePreview from "./DiskTemplatePreview";

/** Renewal payment failed (Klaviyo `Subscription Renewal Failed`). Source: email-templates/klaviyo/renewal-failed-email-template.html */
const RenewalFailedPreview: React.FC = () => (
  <DiskTemplatePreview templateKey="renewal-failed" title="Renewal failed (Klaviyo)" badge="Klaviyo" />
);

export default RenewalFailedPreview;
