import type { Metadata } from "next";
import { BreadcrumbJsonLd } from "@/components/seo/StructuredData";

export const metadata: Metadata = {
  title: "Terms and Conditions | Tools Australia",
  description: "Review the membership, giveaway, and ecommerce terms that govern your use of Tools Australia.",
};

export default function TermsPage() {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", item: `${baseUrl}/` },
          { name: "Terms and Conditions", item: `${baseUrl}/terms` },
        ]}
      />
      <main className="bg-slate-950 text-gray-100 pt-[110px] pb-24 sm:pt-[120px]">
        {/* Using the same layout spacing as other static pages keeps design consistent */}
        <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 sm:px-6 lg:px-8 text-sm leading-relaxed sm:text-base">
          <header>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-500">Terms &amp; Conditions</p>
            <h1 className="mt-2 text-3xl font-bold md:text-4xl lg:text-5xl">Tools Australia Terms and Conditions</h1>
            <p className="mt-4 max-w-3xl text-gray-300 sm:text-base">
              Welcome to Tools Australia (also referred to as “Tools Australia Pty Ltd”, “we”, “us”, or “our”). These
              Terms and Conditions (“Terms”) govern your use of our website, memberships, giveaways, and associated
              services. By accessing our site or purchasing any membership or entry package, you agree to be bound by
              these Terms and the policies referenced here.
            </p>
            <p className="mt-2 text-xs text-gray-400 sm:text-sm">Last updated: 13 November 2025</p>
          </header>

          {/* 1. Company Information */}
          <section
            id="company-information"
            className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10"
          >
            <h2 className="text-2xl font-semibold text-white">1. Company Information</h2>
            <div className="grid gap-2 text-gray-300 sm:grid-cols-[max-content,1fr]">
              <span className="font-semibold text-white">Name:</span>
              <span>Tools Australia Pty Ltd</span>
              <span className="font-semibold text-white">ABN:</span>
              <span>54 690 397 061</span>
              <span className="font-semibold text-white">ACN:</span>
              <span>690 397 061</span>
              <span className="font-semibold text-white">Website:</span>
              <span>
                <a className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline" href={baseUrl}>
                  {baseUrl}
                </a>
              </span>
              <span className="font-semibold text-white">Competition Licence:</span>
              <span>TP/04720</span>
              <span className="font-semibold text-white">Email:</span>
              <span>
                <a
                  className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                  href="mailto:hello@toolsaustralia.com.au"
                >
                  hello@toolsaustralia.com.au
                </a>
              </span>
            </div>
          </section>

          {/* 2. Eligibility */}
          <section id="eligibility" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">2. Eligibility</h2>
            <p className="text-gray-300">To become a Tools Australia member or entry holder you must:</p>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>Be at least 18 years of age.</li>
              <li>Be a legal resident of Australia.</li>
              <li>Agree to comply with these Terms and all applicable laws and regulations.</li>
            </ul>
            <p className="text-gray-300">
              <span className="font-semibold text-white">Exclusions:</span> Memberships and competition entries are
              unavailable to residents of the Australian Capital Territory (ACT) and South Australia (SA) due to permit
              restrictions. It is your responsibility to check local eligibility prior to purchasing. By proceeding you
              confirm that you are eligible to participate.
            </p>
          </section>

          {/* 3. Membership Types */}
          <section id="membership-types" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">3. Membership Types</h2>
            <p className="text-gray-300">
              Tools Australia offers three membership products. Full details, including entry counts and pricing, are
              displayed at purchase and confirmed by email.
            </p>
            <div className="space-y-4 text-gray-300">
              <div>
                <h3 className="text-xl font-semibold text-white">a. Major Giveaway One-Time Packages</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>Single purchase providing entries into the current monthly Major Giveaway only.</li>
                  <li>Includes access to member discounts for the advertised period.</li>
                  <li>Entries are credited immediately upon successful payment.</li>
                  <li>Does not include entries into Mini Draw competitions.</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">b. Mini Draw One-Time Packages</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>Single purchase providing entries into the specific Mini Draw nominated at checkout.</li>
                  <li>Includes access to member discounts for the advertised period.</li>
                  <li>Entries are credited immediately upon payment and only apply to that Mini Draw.</li>
                  <li>Clearly labelled as “Mini Draw” at checkout and in the confirmation email.</li>
                  <li>Does not include entries into Major Giveaway competitions.</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">c. Member Packages (Monthly Subscription)</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>Recurring membership tiers (Tradie, Foreman, Boss) billed monthly per giveaway cycle.</li>
                  <li>Provide recurring entries into both Major Giveaway and Mini Draw competitions.</li>
                  <li>Include ongoing access to partner discounts, member offers, and loyalty benefits.</li>
                  <li>“Per giveaway” means per calendar month unless otherwise stated.</li>
                </ul>
              </div>
            </div>
            <p className="text-gray-300">
              One-Time Packages are competition-specific and do not transfer between Major Giveaways and Mini Draws.
              Member Package entries apply to both competition types while the subscription remains active.
            </p>
          </section>

          {/* 4. Membership Fees and Billing */}
          <section id="billing" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">4. Membership Fees and Billing</h2>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>
                Membership fees are displayed on our website and are non-refundable once purchased unless required by
                law.
              </li>
              <li>One-Time Packages are charged once for the specified competition window.</li>
              <li>
                Member Packages auto-renew monthly until cancelled via{" "}
                <a className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline" href="/my-account">
                  My Account
                </a>{" "}
                or by contacting support.
              </li>
              <li>You are responsible for keeping payment details up to date.</li>
              <li>We may adjust membership fees or plan inclusions with reasonable notice to members.</li>
            </ul>
            <p className="text-gray-300">
              <span className="font-semibold text-white">Billing exception:</span> If your billing cycle falls on the
              18th, 19th, or 20th of a month, your renewal will be processed on the 17th to ensure eligibility for the
              upcoming monthly giveaway.
            </p>
          </section>

          {/* 5. Competition Entries */}
          <section
            id="competition-entries"
            className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10"
          >
            <h2 className="text-2xl font-semibold text-white">5. Competition Entries</h2>
            <div className="space-y-4 text-gray-300">
              <div>
                <h3 className="text-xl font-semibold text-white">5.1 Entry Allocation</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>Major Giveaway One-Time Packages provide entries for the current Major Giveaway only.</li>
                  <li>Mini Draw One-Time Packages provide entries for the specified Mini Draw only.</li>
                  <li>Member Package entries cover both Major Giveaway and Mini Draw competitions each month.</li>
                  <li>Additional entries may be granted via promotions, referrals, or free entry pathways.</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">5.2 Entry Limits</h3>
                <p>Entry limits are detailed in the specific competition terms and conditions published on our site.</p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">5.3 Entry Validity</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>Member Package entries continue month to month while the subscription is active.</li>
                  <li>One-Time Package entries do not roll over and expire with the designated competition.</li>
                  <li>If you cancel a membership, credited entries remain valid for the current draw only.</li>
                  <li>Suspended memberships may be eligible for entry restoration under section 5.10.</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">5.4 Repeat Winner Restriction</h3>
                <p>
                  First prize winners are ineligible to win another Tools Australia giveaway for 10 months from the win
                  date. Entries may still be placed but will not be selected during the exclusion period.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">5.5 Employee Exclusion</h3>
                <p>
                  Employees of Tools Australia and their immediate family members (spouse, de facto partner, child,
                  sibling) are not eligible to enter our competitions.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">5.6 Entry Adjustments</h3>
                <p>
                  We may adjust entries to correct errors or as part of goodwill gestures. Wherever practical, we will
                  rectify errors rather than cancel entries.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">5.7 Competition Disruption</h3>
                <p>
                  If a competition is disrupted by a system failure, force majeure, or similar event, we may re-run the
                  draw using existing entries or transfer entries to a comparable future competition.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">5.8 Competition-Specific Terms</h3>
                <p>
                  Each competition has its own terms. You must review the relevant competition rules in addition to
                  these general Terms.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">5.9 Technical Failures and Notification Delays</h3>
                <p>
                  We are not liable for delays or failures in sending notifications or promotional messages caused by
                  technical issues, system outages, or third-party service disruptions. We will make reasonable efforts
                  to resolve issues and contact affected members. For assistance, email{" "}
                  <a
                    className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                    href="mailto:hello@toolsaustralia.com.au"
                  >
                    hello@toolsaustralia.com.au
                  </a>
                  .
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">5.10 Entry Restoration for Reactivated Memberships</h3>
                <p>
                  If a Member Package is suspended due to payment failure and reactivated within 90 days, standard
                  monthly entries may be restored at our discretion. Restoration requires payment verification, good
                  account standing, and a request within 7 days of reactivation. Promotional or One-Time Package entries
                  are not eligible. We may refuse restoration in cases of repeated payment issues, suspected fraud, or
                  misuse.
                </p>
              </div>
            </div>
          </section>

          {/* 6. Cancellation and Termination */}
          <section id="cancellation" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">6. Cancellation and Termination</h2>
            <div className="space-y-4 text-gray-300">
              <div>
                <h3 className="text-xl font-semibold text-white">6.1 Cancellation by You</h3>
                <p>
                  You may cancel a Member Package at any time via your account settings. Cancellation takes effect at
                  the end of the current billing period. Fees already paid are non-refundable except as required by law.
                  Entries already credited remain valid for the current draw.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">6.2 Termination by Tools Australia</h3>
                <p>
                  We may suspend or terminate access for breach of these Terms, suspected fraud, or non-payment. Severe
                  breaches may result in immediate termination. No refunds are provided unless required by law.
                </p>
              </div>
            </div>
          </section>

          {/* 7. Intellectual Property */}
          <section
            id="intellectual-property"
            className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10"
          >
            <h2 className="text-2xl font-semibold text-white">7. Intellectual Property</h2>
            <p className="text-gray-300">
              All website content, branding, graphics, and copy are owned or licensed by Tools Australia. You may use
              this content for personal, non-commercial purposes only. You must not reproduce, distribute, or modify our
              content without written permission. By submitting reviews, testimonials, or user-generated content, you
              grant us a royalty-free licence to use that content in marketing and promotional materials.
            </p>
          </section>

          {/* 8. Acceptable Use */}
          <section id="acceptable-use" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">8. Acceptable Use</h2>
            <p className="text-gray-300">
              You must not engage in unlawful activity, tamper with systems, exploit automated tools to gain entries, or
              create multiple accounts to bypass limits. Any suspected fraud or abuse may result in suspension or
              termination. Please notify us immediately if you believe your account has been compromised.
            </p>
          </section>

          {/* 9. Privacy */}
          <section id="privacy" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">9. Privacy</h2>
            <p className="text-gray-300">
              Personal information is managed in accordance with our{" "}
              <a className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline" href="/privacy">
                Privacy Policy
              </a>{" "}
              and the Privacy Act 1988 (Cth). To access, correct, or delete your personal information, contact{" "}
              <a
                className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                href="mailto:hello@toolsaustralia.com.au"
              >
                hello@toolsaustralia.com.au
              </a>
              .
            </p>
          </section>

          {/* 10. Third-Party Links */}
          <section id="third-parties" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">10. Third-Party Links and Suppliers</h2>
            <p className="text-gray-300">
              Our site may contain links to third-party websites or offer products fulfilled by partner suppliers. We do
              not control these third parties and are not responsible for their content or services, except where
              liability cannot be excluded under Australian Consumer Law.
            </p>
          </section>

          {/* 11. Disclaimers and Liability */}
          <section id="liability" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">11. Disclaimers and Liability</h2>
            <p className="text-gray-300">
              Our services are provided “as is” and “as available”. To the extent permitted by law, we exclude liability
              for indirect, incidental, or consequential loss. Nothing in these Terms limits or excludes your rights
              under the Australian Consumer Law. Where liability cannot be excluded, our total aggregate liability is
              limited to the amount you paid to Tools Australia in the preceding 12 months.
            </p>
          </section>

          {/* 12. Responsible Participation */}
          <section
            id="responsible-participation"
            className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10"
          >
            <h2 className="text-2xl font-semibold text-white">12. Responsible Participation</h2>
            <p className="text-gray-300">
              Competitions involve chance. Please participate responsibly and only spend what you can afford. For help,
              contact Gambling Help on 1800 858 858 or email{" "}
              <a
                className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                href="mailto:hello@toolsaustralia.com.au"
              >
                hello@toolsaustralia.com.au
              </a>{" "}
              to request self-exclusion.
            </p>
          </section>

          {/* 13. Tax */}
          <section id="tax" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">13. Tax</h2>
            <p className="text-gray-300">
              Winners are solely responsible for any tax implications associated with receiving prizes or rewards. We
              recommend obtaining independent tax advice.
            </p>
          </section>

          {/* 14. Force Majeure */}
          <section id="force-majeure" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">14. Force Majeure</h2>
            <p className="text-gray-300">
              We are not liable for delays or failures to perform obligations due to events beyond our reasonable
              control, including natural disasters, pandemics, government restrictions, power or communications outages,
              supply chain interruptions, or failures by third-party service providers.
            </p>
          </section>

          {/* 15. Governing Law */}
          <section id="governing-law" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">15. Governing Law and Dispute Resolution</h2>
            <p className="text-gray-300">
              These Terms are governed by the laws of the Commonwealth of Australia and the State of Victoria. Any
              dispute will be submitted to binding arbitration in accordance with the rules of the Australian Commercial
              Arbitration Centre. Nothing limits your rights to seek relief through applicable consumer protection
              bodies.
            </p>
          </section>

          {/* 16. Amendments */}
          <section id="amendments" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">16. Amendments</h2>
            <p className="text-gray-300">
              We may amend these Terms at any time. Updated Terms take effect when posted on our website. Continued use
              after updates constitutes acceptance of the revised Terms. For significant changes, we will provide
              reasonable notice via email or in-app notification.
            </p>
          </section>

          {/* 17. Acknowledgment */}
          <section id="acknowledgment" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">17. Acknowledgment</h2>
            <p className="text-gray-300">
              By purchasing or using Tools Australia memberships, entries, or services you acknowledge that:
            </p>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>You have read and agree to these Terms.</li>
              <li>You meet the eligibility requirements in section 2.</li>
              <li>Major Giveaway One-Time Packages and Mini Draw One-Time Packages are competition-specific.</li>
              <li>Member Package entries apply to both Major Giveaway and Mini Draw competitions.</li>
              <li>You are responsible for maintaining accurate contact and payment details.</li>
            </ul>
            <p className="text-gray-300">
              For any questions or clarifications, please contact us at{" "}
              <a
                className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                href="mailto:hello@toolsaustralia.com.au"
              >
                hello@toolsaustralia.com.au
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
