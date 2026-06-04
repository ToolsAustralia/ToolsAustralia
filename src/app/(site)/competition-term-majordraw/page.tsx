import type { Metadata } from "next";
import { BreadcrumbJsonLd } from "@/components/seo/StructuredData";
import { getNonce } from "@/utils/security/getNonce";
import { getCurrentMajorDrawServer } from "@/utils/database/queries/major-draw-server-queries";
import { getContactEmail } from "@/lib/email/sender-identities";
import { NTP_NUMBER } from "@/constants/legal";

export const metadata: Metadata = {
  title: "Major Giveaway Competition Terms | Tools Australia",
  description:
    "Trade promotion terms for the Tools Australia Major Giveaway, including eligibility, prize options, entry rules, and regulatory details.",
};

export const revalidate = 60; // ISR: refresh every 60s so dates update with active draw

/**
 * Derive "Major Giveaway February 2026" from draw name + draw date.
 * Handles formats like "February Draw", "December 2025 Draw", etc.
 */
function getGiveawayTitle(drawName: string | undefined, drawDate: Date | string | null | undefined): string {
  const year = drawDate ? new Date(drawDate).getFullYear() : new Date().getFullYear();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthMatch = drawName?.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i);
  const month = monthMatch ? monthMatch[1] : monthNames[new Date().getMonth()];
  return `Tools Australia – Major Giveaway ${month} ${year}`;
}

/**
 * Format date for promotion period (e.g. "27 November 2025 at 8:00 pm AEDT")
 * Uses Australia/Sydney timezone so AEDT/AEST is correct.
 */
function formatPromotionDate(date: Date | string | null | undefined): string {
  if (!date) return "TBA";
  const d = new Date(date);
  const formatted = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(d);
  // "27 November 2025, 8:00 pm AEDT" -> "27 November 2025 at 8:00 pm AEDT"
  return formatted.replace(", ", " at ");
}

export default async function MajorGiveawayTermsPage() {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");
  const contactEmail = getContactEmail();
  const nonce = await getNonce();

  const eligibleStates = [
    "Victoria (VIC)",
    "New South Wales (NSW)",
    "Queensland (QLD)",
    "Western Australia (WA)",
    "Tasmania (TAS)",
    "Northern Territory (NT)",
  ];
  const membershipEntryMethods = [
    "Purchase an eligible One-Time Package (Apprentice, Tradie, Foreman, Boss, or Power Pack) during the promotion period.",
    "Maintain an active Tradie, Foreman, or Boss membership package.",
    "Redeem accumulated reward points for entry packages when available.",
  ];
  const prizeOptions = [
    {
      title: "Option 1",
      items: [
        "Sidchrome 356 Piece Metric A/F Tool Kit Roll Cabinet, Top Chest & Side Cab (SCMT11402)",
        "Milwaukee M18 FUEL™ 13 Piece Power Pack 13B4 (M18FPP13B4564B)",
        "$5,000 cash (tax free)",
      ],
    },
    {
      title: "Option 2",
      items: [
        "Sidchrome 356 Piece Metric A/F Tool Kit Roll Cabinet, Top Chest & Side Cab (SCMT11402)",
        "DeWalt 18V XR 14 Piece Kit - 2X 5Ah & 2X FLEXVOLT® 9Ah (DCZ1401P2X2-XE)",
        "$5,000 cash (tax free)",
      ],
    },
    {
      title: "Option 3",
      items: [
        "Sidchrome 356 Piece Metric A/F Tool Kit Roll Cabinet, Top Chest & Side Cab (SCMT11402)",
        "Makita 18V Brushless 15 Piece Combo Kit (DLX1514TX1)",
        "$5,000 cash (tax free)",
      ],
    },
    {
      title: "Option 4",
      items: [
        "Milwaukee 56\" High Capacity Combination Tool Storage (48228559)",
        "Milwaukee M18 FUEL™ 13 Piece Power Pack 13B4 (M18FPP13B4564B)",
        "$5,000 cash (tax free)",
      ],
    },
    {
      title: "Option 5",
      items: [
        "Milwaukee 56\" High Capacity Combination Tool Storage (48228559)",
        "DeWalt 18V XR 14 Piece Kit - 2X 5Ah & 2X FLEXVOLT® 9Ah (DCZ1401P2X2-XE)",
        "$5,000 cash (tax free)",
      ],
    },
    {
      title: "Option 6",
      items: [
        "Milwaukee 56\" High Capacity Combination Tool Storage (48228559)",
        "Makita 18V Brushless 15 Piece Combo Kit (DLX1514TX1)",
        "$5,000 cash (tax free)",
      ],
    },
    {
      title: "Option 7",
      items: ["$10,000 AUD cash"],
    },
  ];

  const majorDraw = await getCurrentMajorDrawServer().catch(() => null);
  const giveawayTitle = getGiveawayTitle(majorDraw?.name, majorDraw?.drawDate ?? majorDraw?.activationDate ?? null);
  const commencesDate = formatPromotionDate(majorDraw?.activationDate);
  const closesDate = formatPromotionDate(majorDraw?.freezeEntriesAt ?? majorDraw?.drawDate);
  const drawDateFormatted = formatPromotionDate(majorDraw?.drawDate);

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", item: `${baseUrl}/` },
          { name: "Competition Terms", item: `${baseUrl}/competition-term-majordraw` },
        ]}
        nonce={nonce}
      />
      <main className="bg-slate-950 text-gray-100 pt-[110px] pb-24 sm:pt-[120px]">
        <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 sm:px-6 lg:px-8 text-sm leading-relaxed sm:text-base">
          <header className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-500">Trade Promotion Terms</p>
            <h1 className="text-3xl font-bold text-white sm:text-4xl">
              {giveawayTitle}
            </h1>
            <p className="text-gray-300">
              Authorised under NSW License TP/04720. Notification Number: {NTP_NUMBER}. These terms outline participation rules, prize details, compliance,
              and consumer protections for the Major Giveaway.
            </p>
          </header>

          <section className="space-y-6 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10" id="part-a">
            <h2 className="text-2xl font-semibold text-white">Part A – Competition Details</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-white">1. Promoter</h3>
                <dl className="grid gap-2 text-gray-300 sm:grid-cols-[max-content,1fr]">
                  <dt className="font-semibold text-white">Name:</dt>
                  <dd>Tools Australia Pty Ltd</dd>
                  <dt className="font-semibold text-white">Website:</dt>
                  <dd>
                    <a
                      className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                      href="https://www.toolsaustralia.com.au"
                    >
                      https://www.toolsaustralia.com.au
                    </a>
                  </dd>
                </dl>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-white">2. Eligible Jurisdictions</h3>
                <ul className="list-inside list-disc space-y-2 text-gray-300">
                  {eligibleStates.map((state) => (
                    <li key={state}>{state}</li>
                  ))}
                </ul>
                <p className="mt-2 text-gray-300">
                  Excludes Australian Capital Territory (ACT) and South Australia (SA) due to permit restrictions.
                  Customers must confirm eligibility before purchasing; proceeding with a purchase confirms acceptance
                  of these terms.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-white">3. Promotion Period</h3>
                <ul className="list-inside list-disc space-y-1 text-gray-300">
                  <li>Commences: {commencesDate}</li>
                  <li>Closes: {closesDate}</li>
                </ul>
              </div>

              <div className="space-y-3">
                <h3 className="text-xl font-semibold text-white">4. Eligibility Requirements</h3>
                <ul className="list-inside list-disc space-y-2 text-gray-300">
                  <li>Entrants must be Australian residents aged 18+ living in an eligible jurisdiction.</li>
                  <li>Must hold a valid Australian delivery address.</li>
                  <li>May obtain entries through any approved package or reward redemption listed below.</li>
                </ul>
                <div className="rounded-lg bg-slate-900/70 p-4">
                  <p className="font-semibold text-white">Entry Methods</p>
                  <ol className="list-inside list-decimal space-y-2 text-gray-300">
                    {membershipEntryMethods.map((method, index) => (
                      <li key={index}>{method}</li>
                    ))}
                  </ol>
                  <p className="mt-3 text-gray-300">
                    Entries allocate immediately upon successful payment, subscription billing, or reward redemption,
                    and packages always include any discounts or benefits advertised at the time of purchase. Multiple
                    One-Time Packages may be purchased to accumulate entries (subject to capacity limits) and additional
                    promotional entries, referral incentives, or bonus offers may be announced with reasonable notice.
                    Maximum 500,000 entries per entrant for the period.
                  </p>
                  <p className="mt-2 text-gray-300">
                    Employees of the promoter and their immediate family (spouse, de facto partner, child, or sibling)
                    are ineligible to enter or win any prizes.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-xl font-semibold text-white">5. Entry Package Conditions</h3>
                <ul className="list-inside list-disc space-y-2 text-gray-300">
                  <li>One-Time Package entries credit immediately once payment settles or reward points redeem.</li>
                  <li>Membership packages accumulate entries monthly per tier.</li>
                  <li>Entries are valid only for the specified Major Giveaway unless otherwise stated.</li>
                  <li>Package benefits run concurrently when holding multiple packages; days do not pause or stack.</li>
                  <li>
                    No refunds once entries are allocated, except as required by law or for genuine purchase errors
                    reported within 48 hours.
                  </li>
                </ul>
                <div className="space-y-2 text-gray-300">
                  <p>
                    Genuine error claims must be emailed to{" "}
                    <a
                      className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                      href={`mailto:${contactEmail}`}
                    >
                      {contactEmail}
                    </a>{" "}
                    within 48 hours of purchase with the receipt or transaction ID.
                  </p>
                  <p className="text-sm text-gray-400">Refund requests are not accepted for:</p>
                  <ul className="list-inside list-disc space-y-1 text-gray-300">
                    <li>Requests lodged after the draw has been conducted.</li>
                    <li>Non-winning outcomes or change-of-mind scenarios once entries are allocated.</li>
                    <li>Duplicate or incorrect package claims that lack verifiable technical evidence.</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10" id="part-b">
            <h2 className="text-2xl font-semibold text-white">Part B – Prize Details</h2>
            <p className="text-gray-300">Number of Winners: One (1). Total Prize Pool: AUD $13,000.</p>
            <div className="space-y-4">
              {prizeOptions.map((option) => (
                <div key={option.title} className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                  <p className="font-semibold text-white">{option.title}</p>
                  <ul className="list-inside list-disc space-y-1 text-gray-300">
                    {option.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="space-y-2 text-gray-300">
              <p>
                All products are supplied new; if unavailable, an equivalent or cash alternative will be offered with
                regulatory approval where required.
              </p>
              <p>
                Manufacturer warranties apply directly between the winner and the manufacturer. Once delivered and
                accepted, responsibility transfers to the winner.
              </p>
              <p>
                Delivery, installation, insurance, and ancillary costs are the winner’s responsibility unless stated
                otherwise. Prizes are not transferable, exchangeable, or redeemable for alternative products or services
                except at the promoter’s discretion.
              </p>
              <p>
                Prize delivery must be to an Australian address; cash is paid into an Australian bank account nominated
                by the winner.
              </p>
              <p>
                In exceptional circumstances where a specific prize option becomes unavailable, the promoter may
                (subject to any necessary approvals):
              </p>
              <ol className="list-inside list-decimal space-y-1 text-gray-300">
                <li>Offer the cash equivalent value of the unavailable option.</li>
                <li>Offer an alternative prize package of equal or greater value.</li>
                <li>
                  Remove the unavailable option while ensuring remaining options retain equal or greater total value.
                </li>
              </ol>
              <p>
                Any substitution will be communicated as soon as practicable and every effort will be made to preserve
                the advertised prize pool value. Nothing in these terms limits the winner’s rights under the Australian
                Consumer Law.
              </p>
            </div>
          </section>

          <section className="space-y-6 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10" id="part-c">
            <h2 className="text-2xl font-semibold text-white">Part C – Entry & Draw Procedure</h2>
            <div className="space-y-4 text-gray-300">
              <div>
                <h3 className="text-xl font-semibold text-white">1. Method of Entry</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>Entrants must confirm eligibility and secure entries before capacity is reached.</li>
                  <li>
                    Entries and receipts appear in the member dashboard and via email confirmations—entrants should
                    verify credits immediately.
                  </li>
                  <li>
                    Reward point redemptions must be completed before capacity is reached and are subject to
                    availability.
                  </li>
                  <li>
                    Technical discrepancies must be reported within 24 hours with supporting evidence to{" "}
                    <a
                      className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                      href={`mailto:${contactEmail}`}
                    >
                      {contactEmail}
                    </a>
                    .
                  </li>
                  <li>
                    No adjustments, refunds, or bonus entries are provided based on claims lodged after the draw or
                    based solely on a non-winning outcome.
                  </li>
                  <li>Incomplete, invalid, or fraudulent entries are disqualified.</li>
                </ul>
                <p className="mt-2 text-gray-300">Error reports must include:</p>
                <ol className="list-inside list-decimal space-y-1 text-gray-300 pl-4">
                  <li>The transaction receipt or confirmation number.</li>
                  <li>A screenshot of the dashboard showing the discrepancy.</li>
                  <li>A clear description of the issue.</li>
                  <li>The date and time of the transaction.</li>
                </ol>
                <p className="mt-2 text-gray-300 text-sm">
                  Claims submitted after 24 hours, or after the draw has concluded, will not be considered. This clause
                  does not apply to general dissatisfaction with outcomes.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">2. Draw Procedure</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>Draw occurs {drawDateFormatted}.</li>
                  <li>Conducted electronically via a certified random draw system.</li>
                  <li>Location: Promoter’s registered address or another approved venue.</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">3. Winner Notification & Publication</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>
                    Winner contacted via phone and email within seven (7) days (with multiple contact attempts via
                    different methods).
                  </li>
                  <li>Names published on the website and social media within fourteen (14) days.</li>
                  <li>
                    Entrants are responsible for providing accurate contact details; the promoter is not liable for
                    unsuccessful contact attempts due to incorrect information.
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">4. Prize Claim & Delivery</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>
                    Prizes delivered within 90 days of eligibility verification and receipt of proof of identity and
                    residency.
                  </li>
                  <li>
                    If a prize is not claimed within two (2) months—and after at least three contact attempts—the
                    promoter may conduct a redraw within three (3) months of the original draw.
                  </li>
                  <li>Any redraw will follow the same certified process and be publicly announced.</li>
                  <li>
                    Once the first prize winner selects an option and it is delivered or paid, the decision is final.
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section className="space-y-6 rounded-xl bg-slate-900/60 p-6 shadow-lg shadow-black/10" id="part-d">
            <h2 className="text-2xl font-semibold text-white">Part D – Liability, Warranties & General</h2>
            <div className="space-y-4 text-gray-300">
              <div>
                <h3 className="text-xl font-semibold text-white">1. Liability Exclusion</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>The promoter is not responsible for late, lost, incomplete, or misdirected entries.</li>
                  <li>
                    No liability for loss, damage, or injury suffered as a result of entering or winning, except where
                    such liability cannot be excluded by law.
                  </li>
                  <li>
                    Third-party supplier issues outside reasonable control fall outside the promoter’s responsibility.
                  </li>
                  <li>
                    Delays caused by internet, payment gateways, or communications platforms are not the promoter’s
                    responsibility where exclusion is permitted.
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">2. Technical or Human Errors</h3>
                <p>
                  If technical malfunctions or human errors affect entry allocation, the promoter may transfer affected
                  entries to an equivalent promotion or conduct a redraw. Where feasible, errors will be rectified
                  rather than voiding entries, and updates will be communicated to impacted entrants.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">3. Tax Implications Disclaimer</h3>
                <p>
                  Winners are solely responsible for seeking independent financial or tax advice. Prizes may have
                  taxation implications depending on individual circumstances.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">4. No Employment Relationship</h3>
                <p>
                  Participation does not create any employment, agency, or partnership relationship between entrants and
                  the promoter.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">5. Consumer Guarantees</h3>
                <p>
                  Nothing in these terms limits the non-excludable rights available under the Competition and Consumer
                  Act 2010 (Cth) or any similar legislation.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">6. Privacy & Data Use</h3>
                <p>
                  Personal information is collected for running the competition, delivering prizes, and meeting
                  regulatory obligations. Data may be shared with third-party providers for draw administration, prize
                  fulfilment, or compliance, and is retained only as long as necessary before being securely destroyed
                  or de-identified. Entrants may access, correct, or request deletion of their data (subject to legal
                  retention requirements) by emailing{" "}
                  <a
                    className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                    href={`mailto:${contactEmail}`}
                  >
                    {contactEmail}
                  </a>
                  . The Privacy Policy is available at https://www.toolsaustralia.com.au.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">7. Responsible Participation & Consumer Protection</h3>
                <p>
                  The promoter encourages responsible spending. Entrants should only purchase packages they can afford,
                  may request self-exclusion or spending limits, and can seek help from Gambling Help on 1800 858 858.
                  The promoter may implement purchase limits, cooling-off periods, or other consumer protection measures
                  at its discretion.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">8. Modification or Cancellation</h3>
                <p>
                  The promoter may vary, suspend, or cancel the competition due to circumstances beyond its control
                  (subject to relevant approvals). If cancelled before the draw, refunds will be issued; if cancelled
                  after the draw, prizes will still be awarded to declared winners.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">9. Disqualification & Suspension</h3>
                <p>
                  The promoter may disqualify any entrant who breaches these terms, tampers with the entry process, uses
                  automated tools or bots, or submits misleading information. Audits may occur to uphold fairness.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">10. Promoter’s Final Decision</h3>
                <p>
                  The promoter reserves the right to make final determinations on eligibility, entry validity, prize
                  allocation, and disqualification, acting reasonably and in good faith and subject to any regulatory
                  oversight.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">11. Publicity Release</h3>
                <p>
                  By accepting a prize, winners agree to participate in reasonable publicity (photos, interviews, public
                  announcements) and grant the promoter a non-exclusive royalty-free licence to use their name,
                  likeness, and city of residence. Winners may request that their surname not be published in full where
                  permitted.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">12. Force Majeure</h3>
                <p>
                  The promoter is not liable for delays or failures caused by events beyond its reasonable control
                  (e.g., natural disasters, pandemics, civil unrest). Reasonable efforts will be made to resume the
                  competition or provide alternatives, subject to regulatory approval.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">13. Dispute Resolution</h3>
                <p>
                  Disputes will be handled under the laws of New South Wales. Parties should first attempt to resolve
                  matters directly; if unresolved, disputes may proceed to mediation before litigation, without limiting
                  the right to seek urgent injunctive relief.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">14. Relationship to Other Competitions</h3>
                <p>
                  The Mini Draw Competition operates within the promoter’s broader structure (Major Giveaways plus Mini
                  Draws). Packages specify how entries apply to each draw, and every draw has its own supplementary
                  terms.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">15. Permit Compliance</h3>
                <p>
                  The competition is conducted in accordance with applicable state and territory gaming legislation.
                  Relevant permit numbers will be displayed on promotional collateral once issued.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">16. General</h3>
                <ul className="list-inside list-disc space-y-2">
                  <li>These terms are governed by the laws of New South Wales, Australia.</li>
                  <li>Any provision deemed invalid will be severed and the remainder continues in force.</li>
                  <li>Failure to enforce a right does not constitute a waiver.</li>
                  <li>These terms form the entire agreement between the promoter and entrants for this competition.</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">17. No Refunds Based on Outcomes</h3>
                <p>
                  Participation does not guarantee a prize; no refunds, credits, or compensation are provided for non-winning
                  outcomes. Refunds are only available for genuine technical errors or system failures occurring before
                  the draw and as required by law.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Contact</h3>
                <p>
                  Queries can be directed to{" "}
                  <a
                    className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline"
                    href={`mailto:${contactEmail}`}
                  >
                    {contactEmail}
                  </a>
                  .
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
