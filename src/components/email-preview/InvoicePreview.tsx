"use client";

import React from "react";
import DiskTemplatePreview from "./DiskTemplatePreview";

/** Invoice / receipt email (Klaviyo `Invoice Generated`). Source: email-templates/klaviyo/invoice-email-template.html */
const InvoicePreview: React.FC = () => (
  <DiskTemplatePreview templateKey="invoice" title="Invoice / Receipt (Klaviyo)" badge="Klaviyo" />
);

export default InvoicePreview;
