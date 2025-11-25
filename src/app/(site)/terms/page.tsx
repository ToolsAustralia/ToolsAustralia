import type { Metadata } from "next";
import { BreadcrumbJsonLd } from "@/components/seo/StructuredData";
import { getNonce } from "@/utils/security/getNonce";

export const metadata: Metadata = {
  title: "Terms and Conditions | Tools Australia",
  description: "Review the membership, giveaway, and ecommerce terms that govern your use of Tools Australia.",
};

export default async function TermsPage() {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");

  // Get CSP nonce from request headers (set by middleware in production)
  const nonce = await getNonce();

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", item: `${baseUrl}/` },
          { name: "Terms and Conditions", item: `${baseUrl}/terms` },
        ]}
        nonce={nonce}
      />
      <main className="bg-slate-950 text-gray-100 pt-[110px] pb-24 sm:pt-[120px]">
        {/* Using the same layout spacing as other static pages keeps design consistent */}
        <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 sm:px-6 lg:px-8 text-sm leading-relaxed sm:text-base">
          <header>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-500">Terms &amp; Conditions</p>

            <p className="mt-4 max-w-3xl text-gray-300 sm:text-base">
              Welcome to Tools Australia (referred to as &quot;Tools Australia&quot;, &quot;we&quot;, &quot;us&quot;, or
              &quot;our&quot;). By accessing or using our website, services, or purchasing a membership, you agree to be
              bound by these Terms and Conditions (&quot;Terms&quot;). Please read them carefully.
            </p>
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
              <span className="font-semibold text-white">Registered Address:</span>
              <span>6A Aylesbury Crescent, Gladstone Park, VIC 3043</span>
              <span className="font-semibold text-white">Website:</span>
              <span>
                <a className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline" href={baseUrl}>
                  https://www.toolsaustralia.com.au
                </a>
              </span>
              <span className="font-semibold text-white">Email:</span>
              <span>
                <a
                  className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                  href="mailto:hello@toolsaustralia.com.au"
                >
                  hello@toolsaustralia.com.au
                </a>
              </span>
              <span className="font-semibold text-white">Last Updated:</span>
              <span>25/11/2025</span>
            </div>
          </section>

          {/* 2. Eligibility */}
          <section id="eligibility" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">2. Eligibility</h2>
            <p className="text-gray-300">To become a member of Tools Australia, you must:</p>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>Be at least 18 years old</li>
              <li>Be a legal resident of Australia</li>
              <li>Agree to comply with these Terms and all applicable laws and regulations</li>
            </ul>
            <p className="text-gray-300">
              <span className="font-semibold text-white">Exclusions:</span>
            </p>
            <p className="text-gray-300">
              This offer is available to residents of all Australian states and territories excluding the Australian
              Capital Territory (ACT) and South Australia (SA), due to applicable permit restrictions. It is the sole
              responsibility of the customer to consult their respective state or territory&apos;s eligibility
              requirements prior to making a purchase. By proceeding with a purchase, the customer acknowledges that
              they have read, understood, and accepted these terms, and confirms their eligibility to participate.
            </p>
          </section>

          {/* 3. Membership Types and Packages */}
          <section id="membership-types" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">3. Membership Types and Packages</h2>
            <p className="text-gray-300">
              Tools Australia offers two types of packages that provide entries into trade promotions and giveaways:
            </p>
            <div className="space-y-4 text-gray-300">
              <div>
                <h3 className="text-xl font-semibold text-white">a. One-Time Packages:</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>
                    Single purchase providing entries into both Major Giveaway Competitions and Mini Draw Competitions
                  </li>
                  <li>
                    Available in five tiers: Apprentice Pack, Tradie Pack, Foreman Pack, Boss Pack, and Power Pack
                  </li>
                  <li>Access to member discounts for specified period</li>
                  <li>Entries credited immediately upon payment</li>
                  <li>Valid for the current competition period as specified at time of purchase</li>
                  <li>Entries do not carry forward to subsequent competition periods</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">b. Membership Packages (Monthly Subscription):</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>Recurring monthly billing available in three tiers: Tradie, Foreman, and Boss</li>
                  <li>
                    Provide monthly accumulated entries into both Major Giveaway Competitions and Mini Draw Competitions
                  </li>
                  <li>Ongoing access to member discounts and benefits</li>
                  <li>&quot;Per giveaway&quot; means per calendar month</li>
                </ul>
              </div>
            </div>
            <p className="text-gray-300">
              <strong>Package Details:</strong> Entry numbers, pricing, and benefits for each package type are displayed
              on the website at time of purchase and confirmed via email.
            </p>
            <p className="text-gray-300">
              <strong>Important:</strong> One-Time Packages provide entries to both Major Giveaway and Mini Draw
              competitions for the specified period. Membership Packages provide ongoing monthly entries that apply to
              both Major Giveaway and Mini Draw competitions. Purchase confirmations clearly specify the number of
              entries and applicable competition periods.
            </p>
          </section>

          {/* 4. Reward Points System */}
          <section id="reward-points" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">4. Reward Points System</h2>
            <div className="space-y-4 text-gray-300">
              <div>
                <h3 className="text-xl font-semibold text-white">4.1 Earning Reward Points:</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>
                    Members may earn reward points through purchases, referrals, promotional activities, or other means
                    specified on the website
                  </li>
                  <li>
                    Reward points are credited to member accounts according to the terms specified at the time of
                    earning
                  </li>
                  <li>Points accumulation rates and earning opportunities are displayed on the website and may vary</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">4.2 Redeeming Reward Points:</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>
                    Reward points can be redeemed for entry packages, giveaway participation, or other benefits as
                    specified on the website
                  </li>
                  <li>Redemption values and options are clearly displayed at the time of redemption</li>
                  <li>
                    Once redeemed, reward points cannot be reversed except in cases of system error or as required by
                    law
                  </li>
                  <li>Reward points have no cash value and cannot be transferred, sold, or exchanged for cash</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">4.3 Reward Points Expiry and Cancellation:</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>
                    Reward points may expire if account remains inactive for a specified period (details on website)
                  </li>
                  <li>Upon membership cancellation, unused reward points are forfeited unless otherwise specified</li>
                  <li>
                    Tools Australia reserves the right to adjust, cancel, or modify the reward points program with
                    reasonable notice to members
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* 5. Membership Fees and Billing */}
          <section id="billing" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">5. Membership Fees and Billing</h2>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>Membership fees are outlined on our website and are non-refundable once purchased</li>
              <li>One-Time Packages are charged once for the chosen tier</li>
              <li>Membership Packages are billed on a recurring monthly basis according to the chosen tier</li>
              <li>You are responsible for maintaining accurate and up-to-date payment information</li>
              <li>
                Tools Australia reserves the right to change membership fees or plans at any time, with reasonable
                notice provided to members
              </li>
            </ul>
          </section>

          {/* 6. Competition Entries */}
          <section
            id="competition-entries"
            className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10"
          >
            <h2 className="text-2xl font-semibold text-white">6. Competition Entries</h2>
            <div className="space-y-4 text-gray-300">
              <div>
                <h3 className="text-xl font-semibold text-white">6.1 Entry Allocation:</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>
                    One-Time Packages: Entries for both Major Giveaway and Mini Draw competitions for the specified
                    period
                  </li>
                  <li>
                    Membership Packages: Monthly accumulated entries apply to both Major Giveaway and Mini Draw
                    competitions
                  </li>
                  <li>
                    Additional entries may be offered via promotions, referrals, reward points redemption, or free entry
                    methods
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">6.2 Entry Limits:</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>Entry limits specified in each competition&apos;s terms and conditions</li>
                  <li>Mini Draws may have capped entry limits. Once reached, the draw closes to new entries</li>
                  <li>Maximum entries per member may apply as specified in competition-specific terms</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">6.3 Entry Validity:</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>
                    Membership Package entries are accumulated monthly and carried forward as long as the subscription
                    remains active
                  </li>
                  <li>
                    One-Time Package entries do not carry forward to subsequent competition periods and are valid only
                    for the period specified at time of purchase
                  </li>
                  <li>
                    Upon membership cancellation or suspension, entries already credited remain valid for the current
                    competition period only
                  </li>
                  <li>
                    Suspended memberships may be eligible for entry restoration upon re-activation in accordance with
                    Section 6.10
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">6.4 Repeat Winner Restriction:</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>
                    First Prize Winners cannot win another Tools Australia major giveaway for 10 months from date of win
                  </li>
                  <li>May still enter but entries ineligible for major prize selection during exclusion period</li>
                  <li>
                    Mini Draw prizes may have different repeat winner restrictions as specified in competition-specific
                    terms
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">6.5 Employee Exclusion:</h3>
                <p>
                  Tools Australia employees and immediate family (spouse, de facto partner, child, sibling) ineligible.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">6.6 Entry Adjustments:</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>Tools Australia may adjust entries to correct errors or as compensation</li>
                  <li>Where feasible, errors rectified rather than entries cancelled</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">6.7 Competition Disruption:</h3>
                <p>
                  If competition is impacted by system failure or force majeure, Tools Australia may re-run using
                  existing entries or transfer entries to equivalent future competition.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">6.8 Competition-Specific Terms:</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>Each competition has separate terms and conditions</li>
                  <li>Review competition-specific terms in addition to these general terms</li>
                  <li>Mini Draws may have specific entry caps and closure conditions</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">6.9 Technical Failures and Notification Delays:</h3>
                <p>
                  Tools Australia is not liable for any delays or failures in sending notifications, communications, or
                  promotional messages (including SMS, email, or website notifications) due to technical issues, system
                  failures, third-party service provider failures, or circumstances beyond Tools Australia&apos;s
                  reasonable control. This includes but is not limited to:
                </p>
                <ul className="list-inside list-disc space-y-2 ml-4">
                  <li>Delayed delivery of winner notifications</li>
                  <li>Promotional messages sent outside the intended promotion period</li>
                  <li>System downtime affecting communications</li>
                  <li>Third-party messaging service failures</li>
                </ul>
                <p className="mt-2">
                  In such circumstances, Tools Australia will make reasonable efforts to rectify the issue and
                  communicate with affected members. Where notifications are delayed due to technical failure, Tools
                  Australia reserves the right to extend deadlines or make alternative arrangements on a case-by-case
                  basis to ensure fairness. Members affected by such technical issues should contact{" "}
                  <a
                    className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                    href="mailto:info@toolsaustralia.com.au"
                  >
                    info@toolsaustralia.com.au
                  </a>{" "}
                  for assistance.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">
                  6.10 Entry Restoration for Re-activated Memberships:
                </h3>
                <p>
                  If a Membership Package subscription is suspended due to payment failure and subsequently re-activated
                  within 90 days:
                </p>
                <ul className="list-inside list-disc space-y-2 ml-4">
                  <li>
                    Monthly accumulated entries that would have been credited during the suspension period may be
                    restored at Tools Australia&apos;s discretion
                  </li>
                  <li>Restoration is subject to verification of payment and account standing</li>
                  <li>
                    Requests for entry restoration must be made within 7 days of re-activation via{" "}
                    <a
                      className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                      href="mailto:info@toolsaustralia.com.au"
                    >
                      info@toolsaustralia.com.au
                    </a>
                  </li>
                  <li>
                    Restoration applies only to standard monthly accumulated entries, not promotional or bonus entries
                  </li>
                  <li>One-Time Package entries are not eligible for restoration</li>
                  <li>Entry restoration is processed within 48 hours of approval</li>
                </ul>
                <p className="mt-2">
                  Tools Australia reserves the right to decline restoration in cases of repeated payment failures (more
                  than two suspensions within 12 months), suspected fraud, or abuse of this policy.
                </p>
              </div>
            </div>
          </section>

          {/* 7. Cancellation and Termination */}
          <section id="cancellation" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">7. Cancellation and Termination</h2>
            <div className="space-y-4 text-gray-300">
              <div>
                <h3 className="text-xl font-semibold text-white">Membership Package Cancellation by You:</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>Cancel anytime via account settings on the website</li>
                  <li>Takes effect end of current billing period</li>
                  <li>No refunds for unused portion</li>
                  <li>Entries for current competition period remain valid</li>
                  <li>Unused reward points are forfeited upon cancellation</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Termination by Tools Australia:</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>For breach of terms, fraud, non-payment, or undermining competition integrity</li>
                  <li>Immediate termination for serious breach; otherwise reasonable notice provided</li>
                  <li>All access disabled upon termination</li>
                  <li>No refunds except as required by law</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 8. Intellectual Property */}
          <section
            id="intellectual-property"
            className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10"
          >
            <h2 className="text-2xl font-semibold text-white">8. Intellectual Property</h2>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>All website content owned by Tools Australia or licensed to Tools Australia</li>
              <li>Limited license for personal, non-commercial use only</li>
              <li>No reproduction, distribution, or modification without written permission</li>
              <li>
                Submitted content (photos, testimonials) grants Tools Australia royalty-free license for promotional use
              </li>
            </ul>
          </section>

          {/* 9. Acceptable Use */}
          <section id="acceptable-use" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">9. Acceptable Use</h2>
            <p className="text-gray-300">You must not:</p>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>Use services for unlawful purposes</li>
              <li>Access systems without authorization</li>
              <li>Use automated means (bots, scripts) to access site or manipulate entries</li>
              <li>Create multiple accounts to circumvent entry limits</li>
              <li>Engage in fraud or misrepresentation</li>
              <li>Interfere with site operation</li>
              <li>Abuse the reward points system or attempt to exploit system vulnerabilities</li>
            </ul>
            <p className="text-gray-300">
              You are responsible for account security. Notify us immediately of unauthorized access.
            </p>
          </section>

          {/* 10. Privacy */}
          <section id="privacy" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">10. Privacy</h2>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>Personal information handled per Privacy Act 1988 (Cth)</li>
              <li>
                Collected information: name, contact details, payment information, account activity, reward points
                balance
              </li>
              <li>
                Used for: service provision, competition administration, payment processing, communications, reward
                points management
              </li>
              <li>
                May be shared with third-party providers for payment processing, prize fulfillment, draw conduct, or
                compliance
              </li>
              <li>Retained only as long as necessary for service provision and legal obligations</li>
              <li>
                Your rights: access, correct, or request deletion via{" "}
                <a
                  className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                  href="mailto:hello@toolsaustralia.com.au"
                >
                  hello@toolsaustralia.com.au
                </a>
              </li>
              <li>
                Full Privacy Policy available at{" "}
                <a
                  className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                  href="https://www.toolsaustralia.com.au/privacy"
                >
                  https://www.toolsaustralia.com.au/privacy
                </a>
              </li>
            </ul>
          </section>

          {/* 11. Third-Party Links and Suppliers */}
          <section id="third-parties" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">11. Third-Party Links and Suppliers</h2>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>Site may link to third-party websites not controlled by Tools Australia</li>
              <li>Tools Australia not responsible for third-party content, policies, or practices</li>
              <li>Some prizes provided by third-party suppliers</li>
              <li>
                Tools Australia not responsible for third-party supplier issues beyond reasonable control, except where
                liability cannot be excluded under Australian Consumer Law
              </li>
            </ul>
          </section>

          {/* 12. Disclaimers and Liability */}
          <section id="liability" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">12. Disclaimers and Liability</h2>
            <p className="text-gray-300">
              Services provided &quot;as is&quot; without warranties. Tools Australia not liable for indirect,
              incidental, or consequential damages, except where liability cannot be excluded by law.
            </p>
            <p className="text-gray-300">
              <strong>Australian Consumer Law:</strong> Nothing in these terms limits, excludes, or modifies consumer
              guarantees, rights, or remedies under Competition and Consumer Act 2010 (Cth) or Australian Consumer Law
              that cannot be lawfully excluded.
            </p>
            <p className="text-gray-300">
              <strong>Maximum Liability:</strong> Tools Australia&apos;s total liability limited to amount paid by you
              in preceding 12 months, except where prohibited by law.
            </p>
          </section>

          {/* 13. Responsible Participation */}
          <section
            id="responsible-participation"
            className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10"
          >
            <h2 className="text-2xl font-semibold text-white">13. Responsible Participation</h2>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>Competitions involve chance; prizes not guaranteed</li>
              <li>Only spend what you can afford</li>
              <li>
                Assistance available: Gambling Help 1800 858 858 or{" "}
                <a
                  className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                  href="mailto:hello@toolsaustralia.com.au"
                >
                  hello@toolsaustralia.com.au
                </a>{" "}
                for self-exclusion options
              </li>
              <li>Tools Australia may implement purchase limits at discretion</li>
            </ul>
          </section>

          {/* 14. Tax */}
          <section id="tax" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">14. Tax</h2>
            <p className="text-gray-300">
              Winners solely responsible for any tax obligations. Seek independent tax advice.
            </p>
          </section>

          {/* 15. Force Majeure */}
          <section id="force-majeure" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">15. Force Majeure</h2>
            <p className="text-gray-300">
              Tools Australia is not liable for failure due to events beyond reasonable control (natural disasters,
              pandemic, government restrictions, system failures, third-party service failures, telecommunications or
              internet disruptions, etc.).
            </p>
          </section>

          {/* 16. Governing Law and Dispute Resolution */}
          <section id="governing-law" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">16. Governing Law and Dispute Resolution</h2>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>These Terms will be governed by and construed in accordance with the laws of Australia</li>
              <li>
                Any disputes arising out of or relating to these Terms will be resolved through binding arbitration in
                accordance with the rules of the Australian Commercial Arbitration Centre
              </li>
            </ul>
          </section>

          {/* 17. Amendments */}
          <section id="amendments" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">17. Amendments</h2>
            <p className="text-gray-300">
              Tools Australia reserves the right to amend these Terms at any time by posting the amended Terms on the
              website. Your continued use of the Service after the posting of amended Terms constitutes your acceptance
              of the amendments.
            </p>
          </section>

          {/* 18. Acknowledgment */}
          <section id="acknowledgment" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">18. Acknowledgment</h2>
            <p className="text-gray-300">By purchasing or using Tools Australia services, you confirm:</p>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>You have read and agree to these terms</li>
              <li>You meet eligibility requirements</li>
              <li>
                You understand One-Time Packages provide entries to both Major Giveaway and Mini Draw competitions for
                the specified period
              </li>
              <li>
                You understand Membership Package entries are accumulated monthly and apply to both Major Giveaway and
                Mini Draw competitions
              </li>
              <li>You understand the reward points system and redemption terms</li>
              <li>You are responsible for maintaining accurate contact details</li>
            </ul>
            <p className="text-gray-300">
              For questions:{" "}
              <a
                className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                href="mailto:hello@toolsaustralia.com.au"
              >
                hello@toolsaustralia.com.au
              </a>
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
