"use client";

import React, { useState } from "react";

/**
 * Payment Failed Preview Component
 *
 * Displays a preview of the Klaviyo payment failed email template with mock data
 * for development purposes. Shows different failure scenarios.
 */
const PaymentFailedPreview: React.FC = () => {
  const [selectedScenario, setSelectedScenario] = useState<string>("renewal-insufficient-funds");

  // Read the payment failed template HTML
  // This matches the updated professional payment-failed-email-template.html
  const paymentFailedTemplate = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <style>
    body, table, td, p { margin: 0; padding: 0; }
    body { background-color: #f2f3f5; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; }
    .wrapper { width: 100%; background-color: #f2f3f5; padding: 40px 10px; }
    .card { max-width: 640px; width: 100%; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05); border: 1px solid #e5e7eb; }
    .header { background: linear-gradient(135deg, #0f172a 0%, #111827 30%, #1f2937 60%, #0b1220 100%); color: #fff; text-align: center; padding: 40px 20px 30px; position: relative; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 -1px 0 rgba(0, 0, 0, 0.5); }
    .header-logo { max-width: 160px; height: auto; margin: 0 auto 8px; }
    .header h1 { font-size: 26px; font-weight: bold; margin-bottom: 4px; color: #fff; }
    .header p { font-size: 14px; margin: 0; opacity: 0.9; color: #fff; }
    .content { padding: 30px; }
    .section { margin-bottom: 24px; }
    .section strong { display: inline-block; min-width: 140px; color: #111; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
    .divider { border-top: 1px solid #e6e6e6; margin: 24px 0; }
    .info-box { background-color: #fafbfc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.8; }
    .failure-alert { background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 2px solid #dc2626; border-radius: 12px; padding: 24px 20px; margin: 24px 0; text-align: center; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.15); }
    .failure-icon { font-size: 48px; margin-bottom: 12px; }
    .failure-title { font-size: 20px; font-weight: 700; color: #dc2626; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .failure-reason { font-size: 16px; font-weight: 600; color: #991b1b; margin: 12px 0; }
    .failure-amount { font-size: 24px; font-weight: 800; color: #dc2626; margin: 8px 0; }
    .opening-message { font-size: 16px; color: #4b5563; line-height: 1.7; margin-bottom: 20px; }
    .reasons-box { background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border: 2px solid #f59e0b; border-radius: 10px; padding: 20px; margin: 24px 0; }
    .reasons-title { font-size: 14px; font-weight: 700; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
    .reason-item { font-size: 13px; color: #78350f; margin: 8px 0; padding-left: 20px; position: relative; }
    .reason-item:before { content: "•"; position: absolute; left: 8px; font-weight: bold; }
    .payment-details { border-collapse: collapse; width: 100%; margin-top: 16px; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); border: 1px solid #e5e7eb; }
    .payment-details th { padding: 12px 14px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-bottom: 2px solid #e5e7eb; font-size: 12px; color: #1f2937; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; width: 40%; }
    .payment-details td { padding: 12px 14px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #4b5563; background-color: #ffffff; word-break: break-word; }
    .payment-details tbody tr:last-child td { border-bottom: none; }
    .payment-id { font-family: monospace; font-size: 11px; color: #64748b; }
    .cta-button { display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 32px; border-radius: 8px; text-align: center; margin: 12px 8px; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3); transition: all 0.3s ease; text-transform: uppercase; letter-spacing: 0.5px; }
    .cta-button-secondary { background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); box-shadow: 0 4px 12px rgba(107, 114, 128, 0.3); }
    .cta-container { text-align: center; margin: 32px 0; }
    .reassurance-box { background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 2px solid #22c55e; border-radius: 10px; padding: 20px; text-align: center; margin: 24px 0; }
    .reassurance-text { font-size: 14px; color: #166534; line-height: 1.6; }
    .step-number { display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: #ffffff; width: 24px; height: 24px; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700; margin-right: 8px; vertical-align: middle; }
    .footer { text-align: center; font-size: 12px; color: #6b7280; background-color: #f9fafb; padding: 24px 20px; border-top: 2px solid #e5e7eb; }
    .footer a { color: #6b7280; text-decoration: none; }
    .support-email { font-weight: 700; color: #1f2937; }
    @media only screen and (max-width: 600px) {
      .content { padding: 20px; }
      .header h1 { font-size: 22px; }
      .section strong { display: block; margin-bottom: 8px; min-width: auto; }
      .card { border-radius: 0; }
      .failure-amount { font-size: 20px; }
      .cta-button { display: block; margin: 8px 0; padding: 14px 24px; font-size: 14px; }
      .step-number { width: 20px; height: 20px; line-height: 20px; font-size: 11px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <img src="https://toolsaustralia.com.au/images/Tools%20Australia%20Logo/White-Text%20Logo.webp" alt="Tools Australia Logo" class="header-logo" />
        <h1>Payment Failed</h1>
        <p>We couldn't process your payment</p>
      </div>
      <div class="content">
        <div class="opening-message">
          Dear PLACEHOLDER_FIRST_NAME,<br/><br/>
          We were unable to process your membership renewal payment. Your payment method was declined, and no charges have been applied to your account.
          <br/><br/>
          <strong style="color: #dc2626;">Important:</strong> Please update your payment to ensure you are in the giveaway and do not lose all your entries!
        </div>
        <div class="failure-alert">
          <div class="failure-icon">⚠️</div>
          <div class="failure-title">Payment Transaction Failed</div>
          <div class="failure-reason" style="margin-top: 16px; margin-bottom: 16px;">PLACEHOLDER_FAILURE_REASON</div>
          <div style="font-size: 14px; color: #991b1b; margin-top: 12px; opacity: 0.9; padding-top: 12px; border-top: 1px solid rgba(220, 38, 38, 0.2);">
            <strong>Transaction Amount:</strong> <span class="failure-amount">A$PLACEHOLDER_AMOUNT</span>
          </div>
          PLACEHOLDER_PACKAGE_NAME
          PLACEHOLDER_ERROR_CODE
        </div>
        <div class="divider"></div>
        <div class="section">
          <strong>Payment Details:</strong>
          <table class="payment-details">
            <tbody>
              PLACEHOLDER_PAYMENT_DETAILS_ROWS
            </tbody>
          </table>
        </div>
        <div class="divider"></div>
        PLACEHOLDER_ENTRIES_SECTION
        <div class="cta-container">
          PLACEHOLDER_CTA_BUTTONS
        </div>
      </div>
      <div class="footer">
        <p>Need help? Contact us at <span class="support-email">support@toolsaustralia.com.au</span></p>
        <br/>
        <a href="#">Unsubscribe</a>
      </div>
    </div>
  </div>
</body>
</html>`;

  // Mock data for membership renewal failure scenarios
  const mockScenarios = {
    "renewal-insufficient-funds": {
      first_name: "David",
      failure_reason: "Your card has insufficient funds.",
      failure_code: "card_declined",
      failure_message: "card_declined:insufficient_funds",
      amount: "499.00",
      package_name: '<div style="font-size: 13px; color: #991b1b; margin-top: 8px; opacity: 0.8;"><strong>Item:</strong> Professional Membership</div>',
      error_code: '<div style="font-size: 11px; color: #991b1b; margin-top: 8px; opacity: 0.7; font-family: monospace;">Error Code: card_declined</div>',
      important_note: "",
      error_specific_guidance: "",
      package_type: "",
      payment_intent_id: "pi_3Qkz8j2eZvKYlo2C1xyz9012",
      entries: 1100,
      next_payment_attempt: "2026-01-15T14:30:00.000Z",
      payment_details_rows: `
        <tr>
          <th>Package</th>
          <td>Professional Membership</td>
        </tr>
        <tr>
          <th>Amount</th>
          <td><strong style="color: #dc2626;">A$499.00</strong></td>
        </tr>
        <tr>
          <th>Payment ID</th>
          <td class="payment-id">pi_3Qkz8j2eZvKYlo2C1xyz9012</td>
        </tr>
        <tr>
          <th>Membership Status</th>
          <td>Renewal Payment Failed</td>
        </tr>
        <tr>
          <th>Next Automatic Retry</th>
          <td>
            <strong style="color: #1f2937;">January 15, 2026 at 2:30 PM</strong>
            <br/>
            <span style="font-size: 11px; color: #6b7280; font-style: italic;">Stripe will automatically retry this payment. Update your payment method to ensure success.</span>
          </td>
        </tr>
      `,
      entries_section: `
        <div style="text-align: center; margin: 24px 0;">
          <div style="font-size: 14px; font-weight: 700; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
            Free Entries You Should Receive
          </div>
          <div style="font-size: 32px; font-weight: 800; color: #1e40af; margin: 12px 0;">
            PLACEHOLDER_ENTRIES_COUNT free entries
          </div>
          <div style="font-size: 13px; color: #4b5563; line-height: 1.6; margin-top: 8px;">
            These free entries will be added to your account once your payment succeeds. Update your payment method to receive them.
          </div>
        </div>
      `,
      next_steps: "",
      subscription_status: "",
      reference_info: "",
      cta_buttons: `
        <a href="https://toolsaustralia.com.au/my-account" class="cta-button">Update Payment Method</a>
        <a href="mailto:support@toolsaustralia.com.au?subject=Payment%20Failed%20-%20pi_3Qkz8j2eZvKYlo2C1xyz9012" class="cta-button cta-button-secondary">Contact Support</a>
      `,
    },
    "renewal-expired-card": {
      first_name: "Sarah",
      failure_reason: "Your card has expired.",
      failure_code: "expired_card",
      failure_message: "expired_card:expired_card",
      amount: "499.00",
      package_name: '<div style="font-size: 13px; color: #991b1b; margin-top: 8px; opacity: 0.8;"><strong>Item:</strong> Professional Membership</div>',
      error_code: '<div style="font-size: 11px; color: #991b1b; margin-top: 8px; opacity: 0.7; font-family: monospace;">Error Code: expired_card</div>',
      important_note: "",
      error_specific_guidance: "",
      package_type: "",
      payment_intent_id: "pi_3Qkz8j2eZvKYlo2C1xyz7890",
      entries: 550,
      next_payment_attempt: "2026-01-12T10:00:00.000Z",
      payment_details_rows: `
        <tr>
          <th>Package</th>
          <td>Professional Membership</td>
        </tr>
        <tr>
          <th>Amount</th>
          <td><strong style="color: #dc2626;">A$499.00</strong></td>
        </tr>
        <tr>
          <th>Payment ID</th>
          <td class="payment-id">pi_3Qkz8j2eZvKYlo2C1xyz7890</td>
        </tr>
        <tr>
          <th>Membership Status</th>
          <td>Renewal Payment Failed</td>
        </tr>
        <tr>
          <th>Next Automatic Retry</th>
          <td>
            <strong style="color: #1f2937;">January 12, 2026 at 10:00 AM</strong>
            <br/>
            <span style="font-size: 11px; color: #6b7280; font-style: italic;">Stripe will automatically retry this payment. Update your payment method to ensure success.</span>
          </td>
        </tr>
      `,
      entries_section: `
        <div style="text-align: center; margin: 24px 0;">
          <div style="font-size: 14px; font-weight: 700; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
            Free Entries You Should Receive
          </div>
          <div style="font-size: 32px; font-weight: 800; color: #1e40af; margin: 12px 0;">
            550 free entries
          </div>
          <div style="font-size: 13px; color: #4b5563; line-height: 1.6; margin-top: 8px;">
            These free entries will be added to your account once your payment succeeds. Update your payment method to receive them.
          </div>
        </div>
      `,
      next_steps: "",
      subscription_status: "",
      reference_info: "",
      cta_buttons: `
        <a href="https://toolsaustralia.com.au/my-account" class="cta-button">Update Payment Method</a>
        <a href="mailto:support@toolsaustralia.com.au?subject=Payment%20Failed%20-%20pi_3Qkz8j2eZvKYlo2C1xyz7890" class="cta-button cta-button-secondary">Contact Support</a>
      `,
    },
    "renewal-generic-decline": {
      first_name: "Michael",
      failure_reason: "Your card was declined.",
      failure_code: "card_declined",
      failure_message: "card_declined:generic_decline",
      amount: "499.00",
      package_name: '<div style="font-size: 13px; color: #991b1b; margin-top: 8px; opacity: 0.8;"><strong>Item:</strong> Professional Membership</div>',
      error_code: '<div style="font-size: 11px; color: #991b1b; margin-top: 8px; opacity: 0.7; font-family: monospace;">Error Code: card_declined</div>',
      important_note: "",
      error_specific_guidance: "",
      package_type: "",
      payment_intent_id: "pi_3Qkz8j2eZvKYlo2C1xyz1234",
      entries: 2200,
      next_payment_attempt: null, // No retry scheduled (retries exhausted)
      payment_details_rows: `
        <tr>
          <th>Package</th>
          <td>Professional Membership</td>
        </tr>
        <tr>
          <th>Amount</th>
          <td><strong style="color: #dc2626;">A$499.00</strong></td>
        </tr>
        <tr>
          <th>Payment ID</th>
          <td class="payment-id">pi_3Qkz8j2eZvKYlo2C1xyz1234</td>
        </tr>
        <tr>
          <th>Membership Status</th>
          <td>Renewal Payment Failed</td>
        </tr>
        <tr>
          <th>Next Automatic Retry</th>
          <td>
            <span style="color: #991b1b; font-weight: 600;">No automatic retry scheduled</span>
            <br/>
            <span style="font-size: 11px; color: #6b7280; font-style: italic;">Please update your payment method to continue</span>
          </td>
        </tr>
      `,
      entries_section: `
        <div style="text-align: center; margin: 24px 0;">
          <div style="font-size: 14px; font-weight: 700; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
            Free Entries You Should Receive
          </div>
          <div style="font-size: 32px; font-weight: 800; color: #1e40af; margin: 12px 0;">
            2,200 free entries
          </div>
          <div style="font-size: 13px; color: #4b5563; line-height: 1.6; margin-top: 8px;">
            These free entries will be added to your account once your payment succeeds. Update your payment method to receive them.
          </div>
        </div>
      `,
      next_steps: "",
      subscription_status: "",
      reference_info: "",
      cta_buttons: `
        <a href="https://toolsaustralia.com.au/my-account" class="cta-button">Update Payment Method</a>
        <a href="mailto:support@toolsaustralia.com.au?subject=Payment%20Failed%20-%20pi_3Qkz8j2eZvKYlo2C1xyz1234" class="cta-button cta-button-secondary">Contact Support</a>
      `,
    },
  };

  /**
   * Format date for display
   */
  const formatDate = (isoString: string | null | undefined): string => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      return date.toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return isoString;
    }
  };

  /**
   * Format number with commas
   */
  const formatNumber = (num: number | undefined): string => {
    if (num === undefined || num === null) return "0";
    return num.toLocaleString("en-US");
  };

  /**
   * Replace placeholders with mock data
   */
  const replacePlaceholders = (template: string, scenario: typeof mockScenarios[keyof typeof mockScenarios]) => {
    let result = template
      .replace(/PLACEHOLDER_FIRST_NAME/g, scenario.first_name)
      .replace(/PLACEHOLDER_FAILURE_REASON/g, scenario.failure_reason)
      .replace(/PLACEHOLDER_AMOUNT/g, scenario.amount)
      .replace(/PLACEHOLDER_PACKAGE_NAME/g, scenario.package_name || "")
      .replace(/PLACEHOLDER_ERROR_CODE/g, scenario.error_code || "")
      .replace(/PLACEHOLDER_IMPORTANT_NOTE/g, scenario.important_note || "")
      .replace(/PLACEHOLDER_PAYMENT_DETAILS_ROWS/g, scenario.payment_details_rows)
      .replace(/PLACEHOLDER_CTA_BUTTONS/g, scenario.cta_buttons);
    
    // Replace entries section with formatted entries count
    if (scenario.entries_section) {
      const entriesCount = formatNumber(scenario.entries);
      result = result.replace(/PLACEHOLDER_ENTRIES_SECTION/g, scenario.entries_section.replace(/PLACEHOLDER_ENTRIES_COUNT/g, entriesCount));
    } else {
      result = result.replace(/PLACEHOLDER_ENTRIES_SECTION/g, "");
    }
    
    return result;
  };

  const currentScenario = mockScenarios[selectedScenario as keyof typeof mockScenarios];
  const htmlContent = replacePlaceholders(paymentFailedTemplate, currentScenario);

  const scenarioLabels: Record<string, string> = {
    "renewal-insufficient-funds": "Renewal - Insufficient Funds",
    "renewal-expired-card": "Renewal - Expired Card",
    "renewal-generic-decline": "Renewal - Generic Decline",
  };

  return (
    <div className="space-y-6">
      {/* Scenario Selector */}
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <label htmlFor="scenario-select" className="mb-2 block text-sm font-semibold text-gray-700 dark:text-neutral-200">
          Select Failure Scenario:
        </label>
        <select
          id="scenario-select"
          value={selectedScenario}
          onChange={(e) => setSelectedScenario(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 dark:text-neutral-200 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {Object.entries(scenarioLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-gray-500">
          Current scenario: <span className="font-semibold">{scenarioLabels[selectedScenario]}</span>
        </p>
      </div>

      {/* Email Preview */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-800 dark:text-neutral-100">{scenarioLabels[selectedScenario]}</h3>
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">Payment Failed</span>
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <iframe
            title={`Payment Failed Email Preview - ${scenarioLabels[selectedScenario]}`}
            srcDoc={htmlContent}
            className="h-[900px] w-full border-0"
            sandbox="allow-same-origin"
          />
        </div>
      </div>

      {/* Mock Data Info */}
      <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-semibold">Mock Data Used:</p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Failure Reason: {currentScenario.failure_reason}</li>
          <li>Failure Code: {currentScenario.failure_code}</li>
          <li>Failure Message: {currentScenario.failure_message}</li>
          <li>Amount: A${currentScenario.amount}</li>
          <li>Payment Intent ID: {currentScenario.payment_intent_id}</li>
          <li>Expected Entries: {formatNumber(currentScenario.entries)} free entries</li>
          <li>
            Next Payment Retry:{" "}
            {currentScenario.next_payment_attempt
              ? formatDate(currentScenario.next_payment_attempt)
              : "No retry scheduled (retries exhausted)"}
          </li>
        </ul>
      </div>
    </div>
  );
};

export default PaymentFailedPreview;

