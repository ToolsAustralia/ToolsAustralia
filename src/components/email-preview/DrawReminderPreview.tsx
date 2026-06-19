"use client";

import React from "react";
import DiskTemplatePreview from "./DiskTemplatePreview";

/** Draw reminder — NOT WIRED (prepared for future use). Source: email-templates/klaviyo/draw-reminder-email-template.html */
const DrawReminderPreview: React.FC = () => (
  <DiskTemplatePreview templateKey="draw-reminder" title="Draw reminder — NOT WIRED (future)" badge="Future" />
);

export default DrawReminderPreview;
