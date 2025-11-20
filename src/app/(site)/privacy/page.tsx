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
            <h1 className="mt-2 text-3xl font-bold md:text-4xl lg:text-5xl">Protecting Your Personal Information</h1>
            <p className="mt-4 max-w-3xl text-gray-300 sm:text-base">
              Tools Australia Pty Ltd ABN 54 690 397 061 (“Tools Australia”, “we”, “our”, or “us”) is committed to
              protecting your privacy in line with the Privacy Act 1988 (Cth) and the Australian Privacy Principles.
              This policy explains how we collect, use, disclose, store, and protect personal information when you shop
              with us, join our memberships, or take part in our giveaways and promotions.
            </p>
            <p className="mt-2 text-xs text-gray-400 sm:text-sm">Last updated: 13 November 2025</p>
          </header>

          {/* 1. Introduction */}
          <section id="introduction" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">1. Introduction</h2>
            <p className="text-gray-300">
              By using our website, visiting our retail experiences, purchasing a membership, or participating in any
              Tools Australia promotion, you consent to the practices described in this Privacy Policy. We only collect
              personal information that is reasonably necessary for us to deliver quality products, manage entries and
              rewards, and keep our community safe.
            </p>
          </section>

          {/* 2. Collection of Personal Information */}
          <section id="collection" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">2. Collection of Personal Information</h2>
            <p className="text-gray-300">
              We collect personal and, on occasion, sensitive information to provide and improve our services. The types
              of information we may collect include:
            </p>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>Full name and contact details (email address, phone number, postal address).</li>
              <li>Date of birth and gender (if voluntarily supplied for eligibility checks).</li>
              <li>Payment and transaction details processed securely via our payment partners.</li>
              <li>Membership activity, giveaway entry history, redemptions, and referral participation.</li>
              <li>Account login credentials, preferences, and saved settings.</li>
              <li>Feedback, reviews, support enquiries, and survey responses.</li>
              <li>Website usage data such as IP address, browser type, device identifiers, and cookies.</li>
            </ul>
            <p className="text-gray-300">
              We collect information directly from you when you sign up, make a purchase, complete forms, or contact our
              team. We also gather data automatically through cookies and analytics tools, and from trusted service
              providers including payment gateways, email platforms, and advertising partners. Sensitive information is
              only collected with your express consent and handled in accordance with the Australian Privacy Principles.
            </p>
          </section>

          {/* 3. Use of Personal Information */}
          <section id="use" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">3. Use of Personal Information</h2>
            <p className="text-gray-300">We use your personal information to:</p>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>Register and manage Tools Australia memberships and accounts.</li>
              <li>Provide access to discounts, benefits, rewards, and partner offers.</li>
              <li>Process orders, payments, shipping, and prize fulfilment.</li>
              <li>Send important service updates, notifications, and administrative messages.</li>
              <li>Run promotions, competitions, surveys, and loyalty programs responsibly.</li>
              <li>Personalise product recommendations and website experiences.</li>
              <li>Conduct analytics, reporting, and product development tasks.</li>
              <li>Comply with legal obligations, including licence and regulatory requirements.</li>
            </ul>
            <p className="text-gray-300">
              We will not use your personal information for unrelated purposes without first seeking your consent unless
              required or authorised by law.
            </p>
          </section>

          {/* 4. Disclosure of Personal Information */}
          <section id="disclosure" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">4. Disclosure of Personal Information</h2>
            <p className="text-gray-300">
              We may disclose personal information to trusted parties that help us deliver our services, including:
            </p>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>Tools Australia employees, contractors, and related corporate entities.</li>
              <li>Payment processors, IT and cloud hosting providers, email platforms, and analytics services.</li>
              <li>Mailing houses, marketing partners, and advertising platforms (where you have opted in).</li>
              <li>Regulators, law enforcement agencies, and government bodies when required by law.</li>
              <li>Any other party where you have given direct consent.</li>
            </ul>
            <p className="text-gray-300">
              We will never sell or rent your personal information. All partners are required to handle your data
              securely and only for the agreed purpose.
            </p>
          </section>

          {/* 5. Overseas Disclosure */}
          <section id="overseas" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">5. Overseas Disclosure</h2>
            <p className="text-gray-300">
              Some of our technology partners are located outside Australia, including in the United States, Singapore,
              and member states of the European Union. When we transfer personal information overseas, we take
              reasonable steps to ensure recipients adhere to privacy protections comparable to the Australian Privacy
              Principles or other applicable safeguards.
            </p>
          </section>

          {/* 6. Cookies and Tracking */}
          <section id="cookies" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">6. Cookies and Tracking Technologies</h2>
            <p className="text-gray-300">
              Our website uses cookies, pixels, and similar technologies to recognise returning visitors, monitor
              performance, and tailor advertising. You can adjust your browser settings to manage or block cookies,
              though doing so may impact site functionality. Where required, we will seek your consent before deploying
              cookies for marketing or remarketing purposes.
            </p>
          </section>

          {/* 7. Direct Marketing */}
          <section id="direct-marketing" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">7. Direct Marketing</h2>
            <p className="text-gray-300">
              We may use your personal information to send you promotions, product updates, and event invitations. You
              can opt out at any time by:
            </p>
            <ul className="list-inside list-disc space-y-2 text-gray-300">
              <li>Clicking the “unsubscribe” link in our emails.</li>
              <li>Updating your communication preferences in your Tools Australia account.</li>
              <li>
                Emailing{" "}
                <a
                  className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                  href="mailto:hello@toolsaustralia.com.au"
                >
                  hello@toolsaustralia.com.au
                </a>
                .
              </li>
            </ul>
            <p className="text-gray-300">
              We do not sell or rent personal information to third parties for marketing purposes.
            </p>
          </section>

          {/* 8. Data Security and Retention */}
          <section id="security" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">8. Data Security and Retention</h2>
            <p className="text-gray-300">
              We implement technical, administrative, and physical safeguards to protect your information from misuse,
              interference, loss, and unauthorised access. These safeguards include encrypted payment processing,
              firewalls, multi-factor authentication for internal systems, and ongoing staff training. We retain
              personal information only for as long as needed to fulfil the purposes described in this policy or as
              required by law. When data is no longer required, we destroy or de-identify it securely.
            </p>
          </section>

          {/* 9. Access and Correction */}
          <section id="access" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">9. Access and Correction</h2>
            <p className="text-gray-300">
              You may request access to the personal information we hold about you and ask us to correct any inaccurate,
              out-of-date, incomplete, or misleading data. Please contact us using the details in section 12 and include
              enough information to identify your account. We will respond within a reasonable timeframe and may charge
              a small administrative fee where permitted.
            </p>
          </section>

          {/* 10. Notifiable Data Breaches */}
          <section id="data-breaches" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">10. Notifiable Data Breaches</h2>
            <p className="text-gray-300">
              If a data breach occurs that is likely to result in serious harm, we will notify affected individuals and
              the Office of the Australian Information Commissioner (OAIC) in accordance with the Notifiable Data
              Breaches scheme. Our incident response process prioritises containment, assessment, and timely
              communication.
            </p>
          </section>

          {/* 11. Children’s Privacy */}
          <section id="children" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">11. Children’s Privacy</h2>
            <p className="text-gray-300">
              Our products, competitions, and memberships are designed for adults aged 18 and over. We do not knowingly
              collect personal information from minors without parental or guardian consent. If we learn that we have
              unintentionally collected information from someone under 18, we will delete it as soon as possible.
            </p>
          </section>

          {/* 12. Contacting Us */}
          <section id="contact" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">12. Contacting Us</h2>
            <p className="text-gray-300">
              If you have questions, concerns, or complaints about this policy or how we handle personal information,
              please contact our Privacy Officer:
            </p>
            <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-4 text-gray-200">
              <p className="font-semibold text-white">Privacy Officer</p>
              <p>Tools Australia Pty Ltd</p>
              <p>Melbourne VIC 3000, Australia</p>
              <p>
                Email:{" "}
                <a
                  className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                  href="mailto:hello@toolsaustralia.com.au"
                >
                  hello@toolsaustralia.com.au
                </a>
              </p>
            </div>
            <p className="text-gray-300">
              We aim to respond to all enquiries within a reasonable timeframe. If you are not satisfied with our
              response, you may contact the Office of the Australian Information Commissioner (OAIC) by calling 1300 363
              992 or visiting{" "}
              <a
                className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                href="https://www.oaic.gov.au"
                rel="noopener noreferrer"
              >
                www.oaic.gov.au
              </a>
              .
            </p>
          </section>

          {/* 13. Changes to This Policy */}
          <section id="changes" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">13. Changes to This Policy</h2>
            <p className="text-gray-300">
              We may update this Privacy Policy to reflect changes in our practices, technology, or legal requirements.
              When we make material updates, we will publish the revised policy on our website and, where appropriate,
              notify you through your account or email. The most recent version will always be available at{" "}
              <a
                className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                href={`${baseUrl}/privacy`}
              >
                {baseUrl}/privacy
              </a>
              .
            </p>
          </section>

          {/* 14. Policy Review */}
          <section id="review" className="space-y-4 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10">
            <h2 className="text-2xl font-semibold text-white">14. Policy Review</h2>
            <p className="text-gray-300">
              We review this policy at least annually, or more frequently if required, to ensure continuing compliance
              with Australian privacy laws and to reflect evolving business practices. Feedback from our community is
              always welcome.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
