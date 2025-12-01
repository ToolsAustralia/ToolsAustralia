import type { Metadata } from "next";
import { BreadcrumbJsonLd } from "@/components/seo/StructuredData";
import { getNonce } from "@/utils/security/getNonce";

// Metadata helps search engines understand this page.
export const metadata: Metadata = {
  title: "Privacy Policy | Tools Australia",
  description:
    "Learn how Tools Australia collects, uses, and protects your personal information across our shop, giveaways, and membership experiences.",
};

export default async function PrivacyPolicyPage() {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");

  // Get CSP nonce from request headers (set by middleware in production)
  const nonce = await getNonce();

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", item: `${baseUrl}/` },
          { name: "Privacy Policy", item: `${baseUrl}/privacy` },
        ]}
        nonce={nonce}
      />
      <main className="bg-slate-950 text-gray-100 pt-[110px] pb-24 sm:pt-[120px]">
        {/* Container keeps spacing consistent with the rest of the site */}
        <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 sm:px-6 lg:px-8 text-sm leading-relaxed sm:text-base">
          <header>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-500">Privacy Policy</p>

            <p className="mt-4 max-w-3xl text-gray-300 sm:text-base font-semibold">Tools Australia Pty Ltd</p>
            <p className="mt-2 text-xs text-gray-400 sm:text-sm">Effective Date: 25/11/2025</p>
            <p className="mt-1 text-xs text-gray-400 sm:text-sm">Last Updated: 25/11/2025</p>
          </header>

          {/* 1. ABOUT THIS POLICY */}
          <section
            id="about-this-policy"
            className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10"
          >
            <h2 className="text-2xl font-semibold text-white">1. ABOUT THIS POLICY</h2>
            <p className="text-gray-300">
              Tools Australia Pty Ltd (ABN 54690397061, ACN 690397061donr) (&quot;Tools Australia&quot;, &quot;we&quot;,
              &quot;us&quot;, &quot;our&quot;) is committed to protecting your privacy in accordance with the Privacy
              Act 1988 (Cth) and the <em>Australian Privacy Principles (APPs)</em>.
            </p>
            <p className="text-gray-300">
              This Privacy Policy applies to our website (https://www.toolsaustralia.com.au ), competitions,
              memberships, reward points program, and all related services.
            </p>
            <p className="text-gray-300">
              By using our services, you consent to the collection, use, and disclosure of your personal information as
              described in this policy. We may update this policy from time to time by posting changes on our website.
              Your continued use after changes constitutes acceptance.
            </p>
          </section>

          {/* 2. INFORMATION WE COLLECT */}
          <section
            id="information-we-collect"
            className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10"
          >
            <h2 className="text-2xl font-semibold text-white">2. INFORMATION WE COLLECT</h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">2.1 Information You Provide</h3>
                <ul className="list-inside list-disc space-y-2 text-gray-300">
                  <li>
                    <strong>Personal Details:</strong> Name, date of birth, gender, email, phone number, address
                  </li>
                  <li>
                    <strong>Account Information:</strong> Username, password, preferences, reward points balance
                  </li>
                  <li>
                    <strong>Payment Information:</strong> Credit/debit card details, bank account details, billing
                    address, transaction history
                  </li>
                  <li>
                    <strong>Competition Information:</strong> Entry details, package purchases, entry history
                  </li>
                  <li>
                    <strong>Verification Information:</strong> ID documents, proof of age, proof of residency
                  </li>
                  <li>
                    <strong>Communications:</strong> Your correspondence with us via email, phone, or social media
                  </li>
                  <li>
                    <strong>User Content:</strong> Photos, videos, testimonials, reviews you submit
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-white mb-2">2.2 Information We Collect Automatically</h3>
                <ul className="list-inside list-disc space-y-2 text-gray-300">
                  <li>
                    <strong>Technical Data:</strong> IP address, browser type, device type, operating system
                  </li>
                  <li>
                    <strong>Usage Data:</strong> Pages viewed, time on site, navigation paths, referral sources
                  </li>
                  <li>
                    <strong>Cookies and Tracking:</strong> Data from cookies, web beacons, and similar technologies
                  </li>
                  <li>
                    <strong>Location Data:</strong> General location based on IP address
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-white mb-2">2.3 Information from Third Parties</h3>
                <ul className="list-inside list-disc space-y-2 text-gray-300">
                  <li>Payment processors (transaction verification, fraud detection)</li>
                  <li>Social media platforms (if you connect accounts)</li>
                  <li>Prize suppliers (delivery confirmation)</li>
                  <li>Verification services (identity and age verification)</li>
                  <li>Competition draw services (e.g., randomdraws.com.au)</li>
                </ul>
                <p className="text-gray-300 mt-4">
                  <strong>Note on Payment Card Information:</strong> While we collect Payment and transaction details
                  for processing your membership, we do not store your full payment card number (e.g., credit card or
                  debit card number) on our systems. All payment processing is conducted securely by our third-party,
                  PCI DSS-compliant payment gateway (Stripe), who securely encrypts and stores this data for the purpose
                  of processing your recurring membership fees.
                </p>
              </div>
            </div>
          </section>

          {/* 3. HOW WE USE YOUR INFORMATION */}
          <section id="how-we-use" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">3. HOW WE USE YOUR INFORMATION</h2>
            <p className="text-gray-300">We use your personal information to:</p>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>Process membership purchases, manage accounts, and handle payments</li>
              <li>
                Allocate competition entries, conduct draws, verify eligibility, select winners, notify winners, and
                deliver prizes
              </li>
              <li>Manage reward points, process redemptions, track balances</li>
              <li>Provide customer service, respond to inquiries, resolve complaints, handle refund requests</li>
              <li>Comply with trade promotion permits, regulatory requirements, and legal obligations</li>
              <li>Detect and prevent fraud, unauthorized access, and abuse of services</li>
              <li>Improve our website, services, and user experience</li>
              <li>Send marketing communications (with your consent where required)</li>
              <li>Announce winners publicly on our website and social media (as required by permit conditions)</li>
              <li>Conduct analytics and research using aggregated, de-identified data</li>
            </ul>
            <p className="text-gray-300">
              You can opt out of marketing communications at any time using the unsubscribe link in emails, replying
              &quot;STOP&quot; to SMS, or contacting us at{" "}
              <a
                className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                href="mailto:hello@toolsaustralia.com.au"
              >
                hello@toolsaustralia.com.au
              </a>
              .
            </p>
          </section>

          {/* 4. HOW WE SHARE YOUR INFORMATION */}
          <section id="how-we-share" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">4. HOW WE SHARE YOUR INFORMATION</h2>
            <p className="text-gray-300">We may disclose your personal information to:</p>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>
                <strong>Service Providers:</strong> Payment processors, draw services, prize suppliers, delivery
                services, IT providers, marketing platforms, customer support tools, verification services, and
                professional advisors. These providers are contractually required to protect your information.
              </li>
              <li>
                <strong>Legal and Regulatory Authorities:</strong> When required by law, court orders, gaming regulators
                (NSW Gaming and Racing), ACCC, OAIC, ATO, or to protect our legal rights.
              </li>
              <li>
                <strong>Public Disclosure:</strong> Winner names (first name and initial of surname), city/state of
                residence, prize won, and draw results as required by permit conditions. Published on our website and
                social media.
              </li>
              <li>
                <strong>Business Transfers:</strong> If we are acquired, merged, or sell assets, your information may
                transfer to the new owner with prior notice to you.
              </li>
              <li>
                <strong>With Your Consent:</strong> Other parties you authorize or provide consent for.
              </li>
              <li>
                <strong>Overseas Recipients:</strong> Some service providers are located overseas (USA, EU, Singapore)
                where Australian privacy laws may not apply. By using our services, you consent to overseas disclosure.
              </li>
            </ul>
          </section>

          {/* 5. DATA SECURITY AND RETENTION */}
          <section id="data-security" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">5. DATA SECURITY AND RETENTION</h2>
            <p className="text-gray-300">
              We implement reasonable security measures including encryption (SSL/TLS), access controls, firewalls,
              monitoring, and staff training to protect your information from unauthorized access, disclosure, or loss.
            </p>
            <p className="text-gray-300">
              We retain personal information as long as necessary to provide services, comply with legal obligations
              (typically 3-7 years for competition records), and resolve disputes.
            </p>
            <p className="text-gray-300 font-semibold">Retention periods:</p>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>
                <strong>Account information:</strong> While active, plus 7 years after closure
              </li>
              <li>
                <strong>Competition records:</strong> Minimum 3 years (permit requirement)
              </li>
              <li>
                <strong>Transaction records:</strong> 7 years (tax purposes)
              </li>
              <li>
                <strong>Marketing preferences:</strong> Until unsubscribe (opt-out records maintained indefinitely)
              </li>
            </ul>
            <p className="text-gray-300">After retention periods, we securely destroy or de-identify information.</p>
            <p className="text-gray-300">
              In the event of a data breach likely to cause serious harm, we will notify you and the OAIC as required by
              law. You are responsible for maintaining password confidentiality and notifying us of any unauthorized
              access.
            </p>
          </section>

          {/* 6. YOUR RIGHTS */}
          <section id="your-rights" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">6. YOUR RIGHTS</h2>
            <p className="text-gray-300">You have the right to:</p>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>
                <strong>Access:</strong> Request access to personal information we hold about you
              </li>
              <li>
                <strong>Correction:</strong> Request correction of inaccurate, incomplete, or out-of-date information
              </li>
              <li>
                <strong>Deletion:</strong> Request deletion in certain circumstances (subject to legal retention
                requirements)
              </li>
              <li>
                <strong>Opt-Out:</strong> Unsubscribe from marketing communications at any time
              </li>
            </ul>
            <p className="text-gray-300">
              To exercise these rights, contact us at{" "}
              <a
                className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                href="mailto:hello@toolsaustralia.com.au"
              >
                hello@toolsaustralia.com.au
              </a>{" "}
              with your request and verification details. We will respond within 30 days. We may charge a reasonable fee
              for access requests and may refuse requests in circumstances permitted by law.
            </p>
            <p className="text-gray-300">
              <strong>Note:</strong> Even if you opt out of marketing, you will still receive transactional
              communications (account notifications, purchase confirmations, winner notifications).
            </p>
          </section>

          {/* 7. COOKIES AND TRACKING */}
          <section id="cookies" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">7. COOKIES AND TRACKING</h2>
            <p className="text-gray-300">
              We use cookies and similar technologies to enhance your experience and analyze website usage.
            </p>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>
                <strong>Essential Cookies:</strong> Required for website functionality (cannot be disabled)
              </li>
              <li>
                <strong>Functional Cookies:</strong> Remember preferences and settings
              </li>
              <li>
                <strong>Analytics Cookies:</strong> Track website usage (e.g., Google Analytics)
              </li>
              <li>
                <strong>Marketing Cookies:</strong> Enable targeted advertising (e.g., Facebook Pixel, Google Ads)
              </li>
            </ul>
            <p className="text-gray-300">
              You can manage cookies through your browser settings, though disabling some may affect website
              functionality. Our website does not respond to &quot;Do Not Track&quot; signals.
            </p>
            <p className="text-gray-300">
              Third-party cookies (Google Analytics, Facebook, payment processors, social media plugins) are subject to
              those providers&apos; privacy policies.
            </p>
          </section>

          {/* 8. CHILDREN'S PRIVACY */}
          <section id="children" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">8. CHILDREN&apos;S PRIVACY</h2>
            <p className="text-gray-300">
              Our services are not intended for persons under 18 years of age. We do not knowingly collect information
              from children under 18. If we discover we have collected such information, we will delete it promptly.
              Parents who believe their child has provided information to us should contact{" "}
              <a
                className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                href="mailto:hello@toolsaustralia.com.au"
              >
                hello@toolsaustralia.com.au
              </a>
              .
            </p>
          </section>

          {/* 9. THIRD-PARTY LINKS AND SOCIAL MEDIA */}
          <section id="third-party" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">9. THIRD-PARTY LINKS AND SOCIAL MEDIA</h2>
            <p className="text-gray-300">
              Our website may link to third-party websites (partner retailers, social media, prize manufacturers). We
              are not responsible for their privacy practices. Review their privacy policies before providing
              information.
            </p>
            <p className="text-gray-300">
              When you interact with our social media pages or use social login features, the social media
              platform&apos;s privacy policy applies. We may collect publicly available information you share on our
              pages.
            </p>
          </section>

          {/* 10. MARKETING COMPLIANCE */}
          <section
            id="marketing-compliance"
            className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10"
          >
            <h2 className="text-2xl font-semibold text-white">10. MARKETING COMPLIANCE</h2>
            <p className="text-gray-300">
              We comply with the Spam Act 2003 (Cth). We only send marketing messages to those who have consented,
              clearly identify ourselves, include contact information, and provide functional unsubscribe mechanisms. We
              honor opt-outs within 5 business days.
            </p>
          </section>

          {/* 11. COMPLAINTS */}
          <section id="complaints" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">11. COMPLAINTS</h2>
            <p className="text-gray-300">If you have a privacy complaint:</p>
            <ol className="list-inside list-decimal space-y-2 text-gray-300 ml-4">
              <li>
                <strong>Contact us:</strong> Email{" "}
                <a
                  className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                  href="mailto:hello@toolsaustralia.com.au"
                >
                  hello@toolsaustralia.com.au
                </a>{" "}
                with &quot;Privacy Complaint&quot; in subject line
              </li>
              <li>We will acknowledge within 7 days and respond within 30 days</li>
              <li>
                If unsatisfied, contact the Office of the Australian Information Commissioner (OAIC):
                <ul className="list-inside list-disc space-y-1 text-gray-300 ml-6 mt-2">
                  <li>Phone: 1300 363 992</li>
                  <li>
                    Email:{" "}
                    <a
                      className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                      href="mailto:enquiries@oaic.gov.au"
                    >
                      enquiries@oaic.gov.au
                    </a>
                  </li>
                  <li>
                    Website:{" "}
                    <a
                      className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                      href="https://www.oaic.gov.au"
                      rel="noopener noreferrer"
                    >
                      www.oaic.gov.au
                    </a>
                  </li>
                </ul>
              </li>
            </ol>
          </section>

          {/* 12. CONTACT US */}
          <section id="contact" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">12. CONTACT US</h2>
            <p className="text-gray-300">For privacy questions or requests, contact our Privacy Officer:</p>
            <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-4 text-gray-200">
              <p className="font-semibold text-white">Tools Australia Pty Ltd</p>
              <p className="font-semibold text-white">Attention: Privacy Officer</p>
              <p>Address: 6A Aylesbury Crescent, Gladstone Park, VIC 3043</p>
              <p>
                Email:{" "}
                <a
                  className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                  href="mailto:hello@toolsaustralia.com.au"
                >
                  hello@toolsaustralia.com.au
                </a>
              </p>
              <p>
                Website:{" "}
                <a
                  className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                  href="https://www.toolsaustralia.com.au"
                  rel="noopener noreferrer"
                >
                  https://www.toolsaustralia.com.au
                </a>
              </p>
            </div>
            <p className="text-gray-300">We aim to respond to inquiries within 5 business days.</p>
          </section>

          {/* 13. DEFINITIONS */}
          <section id="definitions" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">13. DEFINITIONS</h2>
            <p className="text-gray-300">
              <em>
                &quot;Personal Information&quot; means information about an identified or reasonably identifiable
                individual.
              </em>
            </p>
            <p className="text-gray-300">
              <em>
                &quot;Australian Privacy Principles&quot; (APPs) means the privacy standards in Schedule 1 of the
                Privacy Act 1988 (Cth).
              </em>
            </p>
          </section>

          {/* 14. GOVERNING LAW */}
          <section id="governing-law" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">14. GOVERNING LAW</h2>
            <p className="text-gray-300">
              This Privacy Policy is governed by the laws of Victoria, Australia and the Commonwealth of Australia. You
              submit to the exclusive jurisdiction of the courts of Victoria for disputes.
            </p>
            <p className="text-gray-300">
              By using our services, you acknowledge you have read, understood, and agree to this Privacy Policy.
            </p>
            <p className="text-gray-300 font-semibold mt-4">Tools Australia Pty Ltd</p>
          </section>
        </div>
      </main>
    </>
  );
}
