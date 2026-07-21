/**
 * Lightweight client-side prize catalog — the landing-graph half of the prize split.
 *
 * `./prizes.ts` (~170 KB source: deep spec-sheet arrays + top-level side effects) must
 * NOT be statically imported from client components: it lands in every page's first-load
 * JS. Client consumers import THIS module instead; the deep catalog stays server-side /
 * behind click-gated dynamic imports (see PrizeShowcase's specifications-modal handler).
 *
 * Hard rules for this file:
 * - Side-effect-free literal data ONLY (no top-level loops/mutation — keeps it tree-shakable).
 * - NEVER import from "./prizes" (that would pull the deep catalog back into the client graph).
 *
 * Drift guard: `npm run test:prize-summaries` asserts slug-set + shared-field equality
 * against PRIZE_CATALOG and a ≤40 KB source-size budget. Edit prize data in BOTH files.
 */

/**
 * Lucide icon name so we can resolve dynamically without importing every icon upfront.
 * Using string keys keeps the catalog serialisable and easy for newer developers to update.
 */
export type LucideIconName = keyof typeof import("lucide-react");

export interface PrizeMedia {
  src: string;
  alt: string;
  /** Optional art-directed URL (e.g. landing `-mobile` assets in promo gallery). */
  mobileSrc?: string;
}

export interface PrizeHighlight {
  icon: LucideIconName;
  title: string;
  description: string;
}

export type PrizeSlug =
  | "milwaukee-sidchrome"
  | "dewalt-sidchrome"
  | "makita-sidchrome"
  | "milwaukee-milwaukee"
  | "dewalt-milwaukee"
  | "makita-milwaukee"
  | "ryobi-sidchrome"
  | "ryobi-milwaukee"
  | "milwaukee-kincrome"
  | "dewalt-kincrome"
  | "makita-kincrome"
  | "ryobi-kincrome"
  | "hikoki-sidchrome"
  | "hikoki-milwaukee"
  | "hikoki-kincrome"
  | "cash-prize";

/** The client-needed subset of a prize entry — everything except the deep spec sheets. */
export interface PrizeSummary {
  slug: PrizeSlug;
  label: string;
  heroHeading: string;
  heroSubheading?: string;
  summary: string;
  prizeValueLabel?: string;
  gallery: PrizeMedia[];
  highlights: PrizeHighlight[];
  cardBackgroundImage?: string; // Optional background image for toggle cards
}

// Within a brand, the three toolbox variants share every gallery shot except the first
// (hero) image — each brand's shared product shots are defined once and spread below.
const MILWAUKEE_GALLERY_SHOTS: PrizeMedia[] = [
  { src: "/images/majordraws/milwaukee-set/MILWAUKEE.webp", alt: "Milwaukee prize collection" },
  { src: "/images/majordraws/milwaukee-set/milwaukee-18v-fuel-hackzall-reciprocating-saw.webp", alt: "Milwaukee Hackzall reciprocating saw" },
  { src: "/images/majordraws/milwaukee-set/milwaukee-18v-fuel-brushless-125mm-angle-grinder.webp", alt: "Milwaukee angle grinder" },
  { src: "/images/majordraws/milwaukee-set/milwaukee-18v-fuel-brushless-oscillating-multi-tool.webp", alt: "Milwaukee oscillating multi-tool" },
  { src: "/images/majordraws/milwaukee-set/milwaukee-18v-fuel-13mm-hammer-drill-driver.webp", alt: "Milwaukee hammer drill" },
  { src: "/images/majordraws/milwaukee-set/milwaukee-18v-fuel-184mm-circular-saw.webp", alt: "Milwaukee circular saw" },
  { src: "/images/majordraws/milwaukee-set/milwaukee-18v-fuel-8inch-203mm-hatchet-pruning-saw.webp", alt: "Milwaukee pruning saw" },
  { src: "/images/majordraws/milwaukee-set/milwaukee-gallery-01.webp", alt: "Milwaukee 18V charging station" },
  { src: "/images/majordraws/milwaukee-set/milwaukee-18v-barrel-fuel-jigsaw.webp", alt: "Milwaukee jigsaw" },
  { src: "/images/majordraws/milwaukee-set/milwaukee-18v-compact-blower.webp", alt: "Milwaukee blower" },
  { src: "/images/majordraws/milwaukee-set/milwaukee-18v-bluetooth-usb-c-jobsite-speaker.webp", alt: "Milwaukee jobsite radio" },
  { src: "/images/majordraws/milwaukee-set/milwaukee-18v-fuel-1-2inch-mid-torque-impact-wrench.webp", alt: "Milwaukee impact wrench" },
  { src: "/images/majordraws/milwaukee-set/milwaukee-18v-fuel-1-4inch-hex-impact-driver.webp", alt: "Milwaukee impact driver" },
  { src: "/images/majordraws/milwaukee-set/milwaukee-18v-125mm-random-orbital-sander.webp", alt: "Milwaukee orbital sander" },
  { src: "/images/majordraws/milwaukee-set/milwaukee-18v-redlithium-5-0ah-battery-kit.webp", alt: "Milwaukee REDLITHIUM batteries" },
  { src: "/images/majordraws/milwaukee-set/milwaukee-18v-compact-battery-light-w-usb-charging.webp", alt: "Milwaukee work light" },
];

const DEWALT_GALLERY_SHOTS: PrizeMedia[] = [
  { src: "/images/majordraws/dewalt-set/DEWALT.webp", alt: "DeWalt prize collection" },
  { src: "/images/majordraws/dewalt-set/dewalt-dcv501ln-xj-18v-xr-l-class-hand-held-stick-vacuum.webp", alt: "DeWalt 18V XR hand vacuum" },
  { src: "/images/majordraws/dewalt-set/dewalt-dcf892n-xj-18v-xr-cordless-brushless-1-2-detent-pin-impact-wrench.webp", alt: "DeWalt 18V XR impact wrench" },
  { src: "/images/majordraws/dewalt-set/dewalt-dcp580n-xe-18v-xr-brushless-planer.webp", alt: "DeWalt 18V XR planer" },
  { src: "/images/majordraws/dewalt-set/dewalt-dcd1007n-xj-18v-xr-3-speed-premium-brushless-hammer-drill-driver.webp", alt: "DeWalt 18V XR hammer drill" },
  { src: "/images/majordraws/dewalt-set/dewalt-dcs389n-xj-54v-flexvolt-xr-brushless-reciprocating-saw.webp", alt: "DeWalt 54V FlexVolt reciprocating saw" },
  { src: "/images/majordraws/dewalt-set/dewalt-dcf860n-xj-18v-xr-li-ion-brushless-3-speed-premium-impact-driver.webp", alt: "DeWalt 18V XR impact driver" },
  { src: "/images/majordraws/dewalt-set/dewalt-dcs356n-xj-18v-xr-brushless-multi-tool-with-speed-selector.webp", alt: "DeWalt 18V XR oscillating multi-tool" },
  { src: "/images/majordraws/dewalt-set/dewalt-dcw210n-xj-18v-xr-brushless-125mm-random-orbital-sander.webp", alt: "DeWalt 18V XR random orbital sander" },
  { src: "/images/majordraws/dewalt-set/dewalt-dcv100-xe-18v-xr-compact-jobsite-blower.webp", alt: "DeWalt 18V XR leaf blower" },
  { src: "/images/majordraws/dewalt-set/dewalt-dcs578n-xe-54v-flexvolt-xr-brushless-184mm-circular-saw.webp", alt: "DeWalt 54V FlexVolt circular saw" },
  { src: "/images/majordraws/dewalt-set/dewalt-dch333nt-xj-54v-flexvolt-xr-brushless-3-mode-sds-plus-rotary-hammer.webp", alt: "DeWalt 54V FlexVolt rotary hammer" },
  { src: "/images/majordraws/dewalt-set/dewalt-dcs334n-xj-18v-xr-brushless-top-handle-jigsaw.webp", alt: "DeWalt 18V XR jigsaw" },
  { src: "/images/majordraws/dewalt-set/dewalt-dcg418n-xj-54v-flexvolt-xr-brushless-125mm-angle-grinder.webp", alt: "DeWalt 54V FlexVolt angle grinder" },
  { src: "/images/majordraws/dewalt-set/dewalt-dwst1-81080-xe-18v-54v-xr-tstak-bluetooth-charger-dab-jobsite-radio.webp", alt: "DeWalt jobsite radio" },
  { src: "/images/majordraws/dewalt-set/dewalt-dcb184-xj-xr-5-0ah-slide-battery-x2.webp", alt: "DeWalt XR and FlexVolt batteries" },
  { src: "/images/majordraws/dewalt-set/dewalt-dcb132-xe-dual-port-flexvolt-charger.webp", alt: "DeWalt fast charger" },
];

const MAKITA_GALLERY_SHOTS: PrizeMedia[] = [
  { src: "/images/majordraws/makita-set/MAKITA.webp", alt: "Makita prize collection" },
  { src: "/images/majordraws/makita-set/makita-dtw700z-18v-brushless-1-2-impact-wrench.webp", alt: "Makita DTW700Z impact wrench" },
  { src: "/images/majordraws/makita-set/makita-dub185z-18v-blower.webp", alt: "Makita DUB185Z blower" },
  { src: "/images/majordraws/makita-set/makita-dhs680z-18v-mobile-brushless-165mm-circular-saw.webp", alt: "Makita DHS680Z circular saw" },
  { src: "/images/majordraws/makita-set/makita-dtm52zx3-18v-brushless-multi-tool.webp", alt: "Makita DTM52ZX3 multi-tool" },
  { src: "/images/majordraws/makita-set/makita-dhp486z-18v-brushless-heavy-duty-hammer-driver-drill.webp", alt: "Makita DHP486Z hammer drill" },
  { src: "/images/majordraws/makita-set/makita-dga508z-18v-mobile-brushless-125mm-paddle-switch-angle-grinder.webp", alt: "Makita DGA508Z angle grinder" },
  { src: "/images/majordraws/makita-set/makita-dhr242z-18v-mobile-brushless-24mm-sds-plus-rotary-hammer.webp", alt: "Makita DHR242Z rotary hammer" },
  { src: "/images/majordraws/makita-set/makita-dbo180z-18v-mobile-random-orbital-sander.webp", alt: "Makita DBO180Z orbital sander" },
  { src: "/images/majordraws/makita-set/makita-dml812-18v-led-long-distance-flashlight.webp", alt: "Makita DML812 work light" },
  { src: "/images/majordraws/makita-set/makita-dtd173z-18v-brushless-4-stage-impact-driver.webp", alt: "Makita DTD173Z impact driver" },
  { src: "/images/majordraws/makita-set/makita-djv184z-18v-brushless-jigsaw.webp", alt: "Makita DJV184Z jigsaw" },
  { src: "/images/majordraws/makita-set/makita-djr187z-18v-mobile-brushless-recipro-saw.webp", alt: "Makita DJR187Z reciprocating saw" },
  { src: "/images/majordraws/makita-set/makita-dkp181z-18v-brushless-aws-82mm-planer.webp", alt: "Makita DKP181Z planer" },
];

const RYOBI_GALLERY_SHOTS: PrizeMedia[] = [
  { src: "/images/majordraws/ryobi-set/RYOBI.webp", alt: "Ryobi prize collection" },
  { src: "/images/majordraws/ryobi-set/ryobi-gallery-01.webp", alt: "Ryobi power tools" },
  { src: "/images/majordraws/ryobi-set/ryobi-gallery-02.webp", alt: "Ryobi 18V ONE+ tools" },
  { src: "/images/majordraws/ryobi-set/ryobi-18v-one-jigsaw.webp", alt: "Ryobi drill and impact" },
  { src: "/images/majordraws/ryobi-set/ryobi-18v-one-12-piece-4ah-kit.webp", alt: "Ryobi circular saw" },
  { src: "/images/majordraws/ryobi-set/ryobi-gallery-03.webp", alt: "Ryobi angle grinder" },
  { src: "/images/majordraws/ryobi-set/ryobi-gallery-04.webp", alt: "Ryobi recip saw" },
  { src: "/images/majordraws/ryobi-set/ryobi-gallery-05.webp", alt: "Ryobi multi-tool" },
  { src: "/images/majordraws/ryobi-set/ryobi-gallery-06.webp", alt: "Ryobi workshop blower" },
  { src: "/images/majordraws/ryobi-set/ryobi-gallery-07.webp", alt: "Ryobi detail sander" },
  { src: "/images/majordraws/ryobi-set/ryobi-gallery-08.webp", alt: "Ryobi cordless caulking gun" },
  { src: "/images/majordraws/ryobi-set/ryobi-gallery-09.webp", alt: "Ryobi Bluetooth radio" },
  { src: "/images/majordraws/ryobi-set/ryobi-gallery-10.webp", alt: "Ryobi compact fan" },
  { src: "/images/majordraws/ryobi-set/ryobi-18v-one-hp-brushless-55cm-hedge-trimmer.webp", alt: "Ryobi high pressure inflator" },
  { src: "/images/majordraws/ryobi-set/ryobi-gallery-11.webp", alt: "Ryobi line trimmer" },
  { src: "/images/majordraws/ryobi-set/ryobi-18v-one-2a-charger.webp", alt: "Ryobi hedge trimmer" },
  { src: "/images/majordraws/ryobi-set/ryobi-18v-one-compact-fan.webp", alt: "Ryobi mitre saw" },
  { src: "/images/majordraws/ryobi-set/ryobi-gallery-12.webp", alt: "Ryobi lawn mower" },
  { src: "/images/majordraws/ryobi-set/ryobi-18v-one-line-trimmer-and-blower-2-0ah-kit.webp", alt: "Ryobi batteries" },
  { src: "/images/majordraws/ryobi-set/ryobi-18v-one-hp-brushless-254mm-sliding-mitre-saw.webp", alt: "Ryobi chargers" },
  { src: "/images/majordraws/ryobi-set/ryobi-gallery-13.webp", alt: "Ryobi ONE+ system" },
  { src: "/images/majordraws/ryobi-set/ryobi-36v-brushless-46cm-lawn-mower-4ah-kit.webp", alt: "Ryobi toolset" },
];

const HIKOKI_GALLERY_SHOTS: PrizeMedia[] = [
  { src: "/images/majordraws/hikoki-set/hikoki-gallery-01.webp", alt: "HiKOKI MultiVolt kit" },
  { src: "/images/majordraws/hikoki-set/hikoki-gallery-02.webp", alt: "HiKOKI brushless power tools" },
  { src: "/images/majordraws/hikoki-set/hikoki-gallery-03.webp", alt: "HiKOKI driver drill" },
  { src: "/images/majordraws/hikoki-set/hikoki-gallery-04.webp", alt: "HiKOKI impact driver" },
  { src: "/images/majordraws/hikoki-set/hikoki-gallery-05.webp", alt: "HiKOKI impact wrench" },
  { src: "/images/majordraws/hikoki-set/hikoki-gallery-06.webp", alt: "HiKOKI circular saw" },
  { src: "/images/majordraws/hikoki-set/hikoki-gallery-07.webp", alt: "HiKOKI reciprocating saw" },
  { src: "/images/majordraws/hikoki-set/hikoki-gallery-08.webp", alt: "HiKOKI rotary hammer" },
  { src: "/images/majordraws/hikoki-set/hikoki-gallery-09.webp", alt: "HiKOKI angle grinder" },
  { src: "/images/majordraws/hikoki-set/hikoki-gallery-10.webp", alt: "HiKOKI multi-tool" },
  { src: "/images/majordraws/hikoki-set/hikoki-gallery-11.webp", alt: "HiKOKI jigsaw" },
  { src: "/images/majordraws/hikoki-set/hikoki-gallery-12.webp", alt: "HiKOKI blower and vacuum" },
  { src: "/images/majordraws/hikoki-set/hikoki-gallery-13.webp", alt: "HiKOKI nailers" },
  { src: "/images/majordraws/hikoki-set/hikoki-gallery-14.webp", alt: "HiKOKI MultiVolt batteries" },
  { src: "/images/majordraws/hikoki-set/hikoki-gallery-15.webp", alt: "HiKOKI rapid charger" },
  { src: "/images/majordraws/hikoki-set/hikoki-gallery-16.webp", alt: "HiKOKI Multi Cruiser storage" },
  { src: "/images/majordraws/hikoki-set/hikoki-gallery-17.webp", alt: "HiKOKI 15pc toolset" },
];

export const PRIZE_SUMMARIES: PrizeSummary[] = [
  {
    slug: "milwaukee-sidchrome",
    label: "Sidchrome Toolbox, Milwaukee 13pc Power Tool Kit + Milwaukee Packout 8pc Modular System, $5000 cash",
    heroHeading: "Sidchrome Toolbox, Milwaukee 13pc Power Tool Kit + Milwaukee Packout 8pc Modular System, $5000 cash",
    heroSubheading: "Complete Milwaukee 18V FUEL™ professional toolkit with Milwaukee PACKOUT™ 8pc modular storage system and Sidchrome SCMT11402 356-piece workshop tower plus $5000 cash.",
    summary: "Milwaukee 18V FUEL™ power tools, REDLITHIUM™ battery ecosystem, Milwaukee PACKOUT™ 8pc modular storage system, and the Sidchrome SCMT11402 356-piece storage cabinet plus $5000 cash.",
    prizeValueLabel: "$35,000+ Value",
    cardBackgroundImage: "/images/majordraws/milwaukee-set/milwaukee-sidchrome.webp",
    gallery: [
      { src: "/images/majordraws/milwaukee-set/milwaukee-sidchrome.webp", alt: "Milwaukee set with Sidchrome toolbox" },
      ...MILWAUKEE_GALLERY_SHOTS,
    ],
    highlights: [
      { icon: "Zap", title: "13 Power Tools", description: "Complete Milwaukee 18V FUEL™ collection." },
      { icon: "Package", title: "PACKOUT™ Modular Storage", description: "8-piece modular storage system with rolling tool box and organisers." },
      { icon: "Battery", title: "REDLITHIUM™ Power System", description: "High-output 5.0Ah packs keep every skin running." },
      { icon: "Wrench", title: "Sidchrome 356pc Kit", description: "Complete hand-tool cabinet for workshop builds." },
    ],
  },
  {
    slug: "dewalt-sidchrome",
    label: "Sidchrome Toolbox, DeWalt 14pc Power Tool Kit + DeWalt Tough System 2.0 Mobile Storage, $5000 cash",
    heroHeading: "Sidchrome Toolbox, DeWalt 14pc Power Tool Kit + DeWalt Tough System 2.0 Mobile Storage, $5000 cash",
    heroSubheading: "Heavy-duty DeWalt FlexVolt and XR cordless range with DeWalt TOUGHSYSTEM® 2.0 mobile storage and Sidchrome SCMT11402 356-piece toolkit plus $5000 cash.",
    summary: "Heavy-duty DeWalt FlexVolt cordless lineup, TOUGHSYSTEM® 2.0 mobile storage, and a 356-piece Sidchrome toolkit plus $5000 cash.",
    prizeValueLabel: "$30,000+ Value",
    cardBackgroundImage: "/images/majordraws/dewalt-set/dewalt-sidchrome.webp",
    gallery: [
      { src: "/images/majordraws/dewalt-set/dewalt-sidchrome.webp", alt: "DeWalt set with Sidchrome toolbox" },
      ...DEWALT_GALLERY_SHOTS,
    ],
    highlights: [
      { icon: "Zap", title: "FlexVolt Muscle", description: "54V tools for circular, rotary, and reciprocating power." },
      { icon: "Package", title: "TOUGHSYSTEM® 2.0 Storage", description: "7-piece mobile storage with IP65 protection and cross-platform adapter." },
      { icon: "Battery", title: "High-Capacity Power", description: "FlexVolt + XR batteries with twin-port fast charging." },
      { icon: "Wrench", title: "Sidchrome 356pc Kit", description: "Complete hand-tool cabinet for workshop builds." },
    ],
  },
  {
    slug: "makita-sidchrome",
    label: "Sidchrome Toolbox, Makita 15pc Power Tool Kit + Makita MAKTRAK 7pc Mobile Storage, $5000 cash",
    heroHeading: "Sidchrome Toolbox, Makita 15pc Power Tool Kit + Makita MAKTRAK 7pc Mobile Storage, $5000 cash",
    heroSubheading: "Complete Makita 18V LXT brushless professional toolkit with Makita MAKTRAK™ 7pc mobile storage and Sidchrome SCMT11402 356-piece workshop tower plus $5000 cash.",
    summary: "Makita 18V LXT brushless power tools, MAKTRAK™ 7pc mobile storage system, and the Sidchrome SCMT11402 356-piece storage cabinet plus $5000 cash.",
    prizeValueLabel: "$30,000+ Value",
    cardBackgroundImage: "/images/majordraws/makita-set/makita-sidchrome.webp",
    gallery: [
      { src: "/images/majordraws/makita-set/makita-sidchrome.webp", alt: "Makita set with Sidchrome toolbox" },
      ...MAKITA_GALLERY_SHOTS,
    ],
    highlights: [
      { icon: "Zap", title: "15 Power Tools", description: "Complete Makita 18V LXT brushless collection." },
      { icon: "Package", title: "MAKTRAK™ Mobile Storage", description: "7-piece mobile storage with rolling chest and organisers." },
      { icon: "Battery", title: "LXT Power System", description: "High-capacity 5.0Ah packs with rapid dual-port charging." },
      { icon: "Wrench", title: "Sidchrome 356pc Kit", description: "Complete hand-tool cabinet for workshop builds." },
    ],
  },
  {
    slug: "milwaukee-milwaukee",
    label: "Milwaukee Toolbox, Milwaukee 13pc Power Tool Kit + Milwaukee Packout 8pc Modular System, $5000 cash",
    heroHeading: "Milwaukee Toolbox, Milwaukee 13pc Power Tool Kit + Milwaukee Packout 8pc Modular System, $5000 cash",
    heroSubheading: "Complete Milwaukee 18V FUEL™ professional toolkit with Milwaukee PACKOUT™ 8pc modular storage system and Milwaukee 56\" High Capacity Combination tool storage plus $5000 cash.",
    summary: "Milwaukee 18V FUEL™ power tools, REDLITHIUM™ battery ecosystem, Milwaukee PACKOUT™ 8pc modular storage system, and the Milwaukee 56\" High Capacity Combination tool storage plus $5000 cash.",
    prizeValueLabel: "$35,000+ Value",
    cardBackgroundImage: "/images/majordraws/milwaukee-set/milwaukee-milwaukee.webp",
    gallery: [
      { src: "/images/majordraws/milwaukee-set/milwaukee-milwaukee.webp", alt: "Milwaukee set with Milwaukee toolbox" },
      ...MILWAUKEE_GALLERY_SHOTS,
    ],
    highlights: [
      { icon: "Zap", title: "13 Power Tools", description: "Complete Milwaukee 18V FUEL™ collection." },
      { icon: "Package", title: "PACKOUT™ + 56\" Toolbox", description: "8-piece modular storage plus high capacity combination tool storage." },
      { icon: "Battery", title: "REDLITHIUM™ Power System", description: "High-output 5.0Ah packs keep every skin running." },
      { icon: "DollarSign", title: "$5000 Cash Bonus", description: "Cold hard cash included with your prize." },
    ],
  },
  {
    slug: "dewalt-milwaukee",
    label: "Milwaukee Toolbox, DeWalt 14pc Power Tool Kit + DeWalt Tough System 2.0 Mobile Storage, $5000 cash",
    heroHeading: "Milwaukee Toolbox, DeWalt 14pc Power Tool Kit + DeWalt Tough System 2.0 Mobile Storage, $5000 cash",
    heroSubheading: "Heavy-duty DeWalt FlexVolt and XR cordless range with DeWalt TOUGHSYSTEM® 2.0 mobile storage and Milwaukee 56\" High Capacity Combination tool storage plus $5000 cash.",
    summary: "Heavy-duty DeWalt FlexVolt cordless lineup, TOUGHSYSTEM® 2.0 mobile storage, premium Milwaukee tool storage, and comprehensive power tool collection plus $5000 cash.",
    prizeValueLabel: "$30,000+ Value",
    cardBackgroundImage: "/images/majordraws/dewalt-set/dewalt-milwaukee.webp",
    gallery: [
      { src: "/images/majordraws/dewalt-set/dewalt-milwaukee.webp", alt: "DeWalt set with Milwaukee toolbox" },
      ...DEWALT_GALLERY_SHOTS,
    ],
    highlights: [
      { icon: "Zap", title: "FlexVolt Muscle", description: "54V tools for circular, rotary, and reciprocating power." },
      { icon: "Package", title: "TOUGHSYSTEM® 2.0 + Toolbox", description: "7-piece mobile storage plus Milwaukee 56\" combination tool storage." },
      { icon: "Battery", title: "High-Capacity Power", description: "FlexVolt + XR batteries with twin-port fast charging." },
      { icon: "DollarSign", title: "$5000 Cash Bonus", description: "Cold hard cash included with your prize." },
    ],
  },
  {
    slug: "makita-milwaukee",
    label: "Milwaukee Toolbox, Makita 15pc Power Tool Kit + Makita MAKTRAK 7pc Mobile Storage, $5000 cash",
    heroHeading: "Milwaukee Toolbox, Makita 15pc Power Tool Kit + Makita MAKTRAK 7pc Mobile Storage, $5000 cash",
    heroSubheading: "Complete Makita 18V LXT brushless professional toolkit with Makita MAKTRAK™ 7pc mobile storage and Milwaukee 56\" High Capacity Combination tool storage plus $5000 cash.",
    summary: "Makita 18V LXT brushless power tools, MAKTRAK™ 7pc mobile storage system, and the Milwaukee 56\" High Capacity Combination tool storage plus $5000 cash.",
    prizeValueLabel: "$30,000+ Value",
    cardBackgroundImage: "/images/majordraws/makita-set/makita-milwaukee.webp",
    gallery: [
      { src: "/images/majordraws/makita-set/makita-milwaukee.webp", alt: "Makita set with Milwaukee toolbox" },
      ...MAKITA_GALLERY_SHOTS,
    ],
    highlights: [
      { icon: "Zap", title: "15 Power Tools", description: "Complete Makita 18V LXT brushless collection." },
      { icon: "Package", title: "MAKTRAK™ + Toolbox", description: "7-piece mobile storage plus Milwaukee 56\" combination tool storage." },
      { icon: "Battery", title: "LXT Power System", description: "High-capacity 5.0Ah packs with rapid dual-port charging." },
      { icon: "DollarSign", title: "$5000 Cash Bonus", description: "Cold hard cash included with your prize." },
    ],
  },
  {
    slug: "ryobi-sidchrome",
    label: "Sidchrome Toolbox, Ryobi 19pc Power Tool Kit + Ryobi LINK Storage Units, $5000 cash",
    heroHeading: "Sidchrome Toolbox, Ryobi 19pc Power Tool Kit + Ryobi LINK Storage Units, $5000 cash",
    heroSubheading: "Complete Ryobi 18V ONE+ toolkit with Ryobi LINK™ modular storage system and Sidchrome SCMT11402 356-piece workshop tower plus $5000 cash.",
    summary: "Ryobi 18V ONE+ power and garden tools, LINK™ modular storage system, and the Sidchrome SCMT11402 356-piece storage cabinet plus $5000 cash.",
    prizeValueLabel: "$25,000+ Value",
    cardBackgroundImage: "/images/majordraws/ryobi-set/ryobi-sidchrome.webp",
    gallery: [
      { src: "/images/majordraws/ryobi-set/ryobi-sidchrome.webp", alt: "Ryobi set with Sidchrome toolbox" },
      ...RYOBI_GALLERY_SHOTS,
    ],
    highlights: [
      { icon: "Zap", title: "19 Power & Garden Tools", description: "18V ONE+ 12-piece kit plus lawn mower and garden tools." },
      { icon: "Package", title: "LINK™ Modular Storage", description: "3-piece rolling storage, wall cabinet, and 15-piece wall kit." },
      { icon: "Battery", title: "ONE+ Power System", description: "18V ONE+ batteries power 200+ tools across the range." },
      { icon: "Wrench", title: "Sidchrome 356pc Kit", description: "Complete hand-tool cabinet for workshop builds." },
    ],
  },
  {
    slug: "ryobi-milwaukee",
    label: "Milwaukee Toolbox, Ryobi 19pc Power Tool Kit + Ryobi LINK Storage Units, $5000 cash",
    heroHeading: "Milwaukee Toolbox, Ryobi 19pc Power Tool Kit + Ryobi LINK Storage Units, $5000 cash",
    heroSubheading: "Complete Ryobi 18V ONE+ toolkit with Ryobi LINK™ modular storage system and Milwaukee 56\" High Capacity Combination tool storage plus $5000 cash.",
    summary: "Ryobi 18V ONE+ power and garden tools, LINK™ modular storage system, and the Milwaukee 56\" High Capacity Combination tool storage plus $5000 cash.",
    prizeValueLabel: "$25,000+ Value",
    cardBackgroundImage: "/images/majordraws/ryobi-set/ryobi-milwaukee.webp",
    gallery: [
      { src: "/images/majordraws/ryobi-set/ryobi-milwaukee.webp", alt: "Ryobi set with Milwaukee toolbox" },
      ...RYOBI_GALLERY_SHOTS,
    ],
    highlights: [
      { icon: "Zap", title: "19 Power & Garden Tools", description: "18V ONE+ 12-piece kit plus lawn mower and garden tools." },
      { icon: "Package", title: "LINK™ + Toolbox", description: "Modular storage system plus Milwaukee 56\" combination tool storage." },
      { icon: "Battery", title: "ONE+ Power System", description: "18V ONE+ batteries power 200+ tools across the range." },
      { icon: "DollarSign", title: "$5000 Cash Bonus", description: "Cold hard cash included with your prize." },
    ],
  },
  {
    slug: "milwaukee-kincrome",
    label: "Kincrome CONTOUR® Toolbox, Milwaukee 13pc Power Tool Kit + Milwaukee Packout 8pc Modular System, $5000 cash",
    heroHeading: "Kincrome CONTOUR® Toolbox, Milwaukee 13pc Power Tool Kit + Milwaukee Packout 8pc Modular System, $5000 cash",
    heroSubheading: "Complete Milwaukee 18V FUEL™ professional toolkit with Milwaukee PACKOUT™ 8pc modular storage and KINCROME CONTOUR® 470pc 17-drawer workshop kit plus $5000 cash.",
    summary: "Milwaukee 18V FUEL™ power tools, REDLITHIUM™ battery ecosystem, Milwaukee PACKOUT™ 8pc modular storage, and the KINCROME CONTOUR® workshop chest & trolley plus $5000 cash.",
    prizeValueLabel: "$35,000+ Value",
    cardBackgroundImage: "/images/majordraws/milwaukee-set/milwaukee-kincrome.webp",
    gallery: [
      { src: "/images/majordraws/milwaukee-set/milwaukee-kincrome.webp", alt: "Milwaukee power tool set with Kincrome CONTOUR toolbox" },
      ...MILWAUKEE_GALLERY_SHOTS,
    ],
    highlights: [
      { icon: "Zap", title: "13 Power Tools", description: "Complete Milwaukee 18V FUEL™ collection." },
      { icon: "Package", title: "PACKOUT™ + CONTOUR® Kit", description: "8-piece modular storage plus Kincrome 470pc workshop chest & trolley." },
      { icon: "Battery", title: "REDLITHIUM™ Power System", description: "High-output 5.0Ah packs keep every skin running." },
      { icon: "DollarSign", title: "$5000 Cash Bonus", description: "Cold hard cash included with your prize." },
    ],
  },
  {
    slug: "dewalt-kincrome",
    label: "Kincrome CONTOUR® Toolbox, DeWalt 14pc Power Tool Kit + DeWalt Tough System 2.0 Mobile Storage, $5000 cash",
    heroHeading: "Kincrome CONTOUR® Toolbox, DeWalt 14pc Power Tool Kit + DeWalt Tough System 2.0 Mobile Storage, $5000 cash",
    heroSubheading: "Heavy-duty DeWalt FlexVolt and XR cordless range with DeWalt TOUGHSYSTEM® 2.0 mobile storage and KINCROME CONTOUR® 470pc workshop kit plus $5000 cash.",
    summary: "Heavy-duty DeWalt FlexVolt cordless lineup, TOUGHSYSTEM® 2.0 mobile storage, KINCROME CONTOUR® workshop storage, and comprehensive power tool collection plus $5000 cash.",
    prizeValueLabel: "$30,000+ Value",
    cardBackgroundImage: "/images/majordraws/dewalt-set/dewalt-kincrome.webp",
    gallery: [
      { src: "/images/majordraws/dewalt-set/dewalt-kincrome.webp", alt: "DeWalt set with Kincrome CONTOUR toolbox" },
      ...DEWALT_GALLERY_SHOTS,
    ],
    highlights: [
      { icon: "Zap", title: "FlexVolt Muscle", description: "54V tools for circular, rotary, and reciprocating power." },
      { icon: "Package", title: "TOUGHSYSTEM® 2.0 + CONTOUR®", description: "7-piece mobile storage plus Kincrome 470pc workshop kit." },
      { icon: "Battery", title: "High-Capacity Power", description: "FlexVolt + XR batteries with twin-port fast charging." },
      { icon: "DollarSign", title: "$5000 Cash Bonus", description: "Cold hard cash included with your prize." },
    ],
  },
  {
    slug: "makita-kincrome",
    label: "Kincrome CONTOUR® Toolbox, Makita 15pc Power Tool Kit + Makita MAKTRAK 7pc Mobile Storage, $5000 cash",
    heroHeading: "Kincrome CONTOUR® Toolbox, Makita 15pc Power Tool Kit + Makita MAKTRAK 7pc Mobile Storage, $5000 cash",
    heroSubheading: "Complete Makita 18V LXT brushless professional toolkit with Makita MAKTRAK™ 7pc mobile storage and KINCROME CONTOUR® 470pc workshop kit plus $5000 cash.",
    summary: "Makita 18V LXT brushless power tools, MAKTRAK™ 7pc mobile storage system, and the KINCROME CONTOUR® workshop kit plus $5000 cash.",
    prizeValueLabel: "$30,000+ Value",
    cardBackgroundImage: "/images/majordraws/makita-set/makita-kincrome.webp",
    gallery: [
      { src: "/images/majordraws/makita-set/makita-kincrome.webp", alt: "Makita set with Kincrome CONTOUR toolbox" },
      ...MAKITA_GALLERY_SHOTS,
    ],
    highlights: [
      { icon: "Zap", title: "15 Power Tools", description: "Complete Makita 18V LXT brushless collection." },
      { icon: "Package", title: "MAKTRAK™ + CONTOUR®", description: "7-piece mobile storage plus Kincrome 470pc workshop kit." },
      { icon: "Battery", title: "LXT Power System", description: "High-capacity 5.0Ah packs with rapid dual-port charging." },
      { icon: "DollarSign", title: "$5000 Cash Bonus", description: "Cold hard cash included with your prize." },
    ],
  },
  {
    slug: "ryobi-kincrome",
    label: "Kincrome CONTOUR® Toolbox, Ryobi 19pc Power Tool Kit + Ryobi LINK Storage Units, $5000 cash",
    heroHeading: "Kincrome CONTOUR® Toolbox, Ryobi 19pc Power Tool Kit + Ryobi LINK Storage Units, $5000 cash",
    heroSubheading: "Complete Ryobi 18V ONE+ toolkit with Ryobi LINK™ modular storage system and KINCROME CONTOUR® 470pc workshop kit plus $5000 cash.",
    summary: "Ryobi 18V ONE+ power and garden tools, LINK™ modular storage system, and the KINCROME CONTOUR® workshop kit plus $5000 cash.",
    prizeValueLabel: "$25,000+ Value",
    cardBackgroundImage: "/images/majordraws/ryobi-set/ryobi-kincrome.webp",
    gallery: [
      { src: "/images/majordraws/ryobi-set/ryobi-kincrome.webp", alt: "Ryobi set with Kincrome CONTOUR toolbox" },
      ...RYOBI_GALLERY_SHOTS,
    ],
    highlights: [
      { icon: "Zap", title: "19 Power & Garden Tools", description: "18V ONE+ 12-piece kit plus lawn mower and garden tools." },
      { icon: "Package", title: "LINK™ + CONTOUR®", description: "Modular LINK™ storage plus Kincrome 470pc workshop kit." },
      { icon: "Battery", title: "ONE+ Power System", description: "18V ONE+ batteries power 200+ tools across the range." },
      { icon: "DollarSign", title: "$5000 Cash Bonus", description: "Cold hard cash included with your prize." },
    ],
  },
  {
    slug: "hikoki-sidchrome",
    label: "Sidchrome Toolbox, HiKOKI 15pc Power Tool Kit + HiKOKI Multi Cruiser Storage, $5000 cash",
    heroHeading: "Sidchrome Toolbox, HiKOKI 15pc Power Tool Kit + HiKOKI Multi Cruiser Storage, $5000 cash",
    heroSubheading: "Complete HiKOKI 36V/18V MultiVolt 15-piece cordless kit with the HiKOKI Multi Cruiser 3-piece storage set and the Sidchrome SCMT11402 356-piece workshop tower plus $5000 cash.",
    summary: "HiKOKI MultiVolt brushless power tools and nailers, the IP65 Multi Cruiser storage system, and the Sidchrome SCMT11402 356-piece cabinet plus $5000 cash.",
    prizeValueLabel: "$30,000+ Value",
    cardBackgroundImage: "/images/majordraws/hikoki-set/hikoki-sidchrome.webp",
    gallery: [
      { src: "/images/majordraws/hikoki-set/hikoki-sidchrome.webp", alt: "HiKOKI set with Sidchrome toolbox" },
      ...HIKOKI_GALLERY_SHOTS,
    ],
    highlights: [
      { icon: "Zap", title: "15 MultiVolt Tools", description: "13pc Mega Combo plus framing & finishing nailers." },
      { icon: "Package", title: "Multi Cruiser Storage", description: "IP65 3-piece stackable rolling tool box set." },
      { icon: "Battery", title: "MultiVolt Power System", description: "5x BSL36A18X 18V/36V batteries + 2 rapid chargers." },
      { icon: "Wrench", title: "Sidchrome 356pc Kit", description: "Complete hand-tool cabinet for workshop builds." },
    ],
  },
  {
    slug: "hikoki-milwaukee",
    label: "Milwaukee Toolbox, HiKOKI 15pc Power Tool Kit + HiKOKI Multi Cruiser Storage, $5000 cash",
    heroHeading: "Milwaukee Toolbox, HiKOKI 15pc Power Tool Kit + HiKOKI Multi Cruiser Storage, $5000 cash",
    heroSubheading: "Complete HiKOKI 36V/18V MultiVolt 15-piece cordless kit with the HiKOKI Multi Cruiser 3-piece storage set and the Milwaukee 56\" high-capacity tool storage chest plus $5000 cash.",
    summary: "HiKOKI MultiVolt brushless power tools and nailers, the IP65 Multi Cruiser storage system, and the Milwaukee 56\" high-capacity combination storage plus $5000 cash.",
    prizeValueLabel: "$30,000+ Value",
    cardBackgroundImage: "/images/majordraws/hikoki-set/hikoki-milwaukee.webp",
    gallery: [
      { src: "/images/majordraws/hikoki-set/hikoki-milwaukee.webp", alt: "HiKOKI set with Milwaukee toolbox" },
      ...HIKOKI_GALLERY_SHOTS,
    ],
    highlights: [
      { icon: "Zap", title: "15 MultiVolt Tools", description: "13pc Mega Combo plus framing & finishing nailers." },
      { icon: "Package", title: "Multi Cruiser Storage", description: "IP65 3-piece stackable rolling tool box set." },
      { icon: "Battery", title: "MultiVolt Power System", description: "5x BSL36A18X 18V/36V batteries + 2 rapid chargers." },
      { icon: "Package", title: "Milwaukee 56\" Storage", description: "High-capacity combination steel tool storage chest & trolley." },
    ],
  },
  {
    slug: "hikoki-kincrome",
    label: "Kincrome CONTOUR® Toolbox, HiKOKI 15pc Power Tool Kit + HiKOKI Multi Cruiser Storage, $5000 cash",
    heroHeading: "Kincrome CONTOUR® Toolbox, HiKOKI 15pc Power Tool Kit + HiKOKI Multi Cruiser Storage, $5000 cash",
    heroSubheading: "Complete HiKOKI 36V/18V MultiVolt 15-piece cordless kit with the HiKOKI Multi Cruiser 3-piece storage set and the KINCROME CONTOUR® 470pc 17-drawer workshop kit plus $5000 cash.",
    summary: "HiKOKI MultiVolt brushless power tools and nailers, the IP65 Multi Cruiser storage system, and the KINCROME CONTOUR® workshop chest & trolley plus $5000 cash.",
    prizeValueLabel: "$30,000+ Value",
    cardBackgroundImage: "/images/majordraws/hikoki-set/hikoki-kincrome.webp",
    gallery: [
      { src: "/images/majordraws/hikoki-set/hikoki-kincrome.webp", alt: "HiKOKI set with Kincrome CONTOUR toolbox" },
      ...HIKOKI_GALLERY_SHOTS,
    ],
    highlights: [
      { icon: "Zap", title: "15 MultiVolt Tools", description: "13pc Mega Combo plus framing & finishing nailers." },
      { icon: "Package", title: "Multi Cruiser Storage", description: "IP65 3-piece stackable rolling tool box set." },
      { icon: "Battery", title: "MultiVolt Power System", description: "5x BSL36A18X 18V/36V batteries + 2 rapid chargers." },
      { icon: "Wrench", title: "Kincrome 470pc Kit", description: "CONTOUR® 17-drawer workshop chest & trolley." },
    ],
  },
  {
    slug: "cash-prize",
    label: "$10,000 Tax Free Cash",
    heroHeading: "$10,000 Tax Free Cash",
    heroSubheading: "Pure cash prize - no tools, no hassle, just $10,000 straight to your bank account.",
    summary: "$10,000 cold hard cash prize - take the money and run.",
    prizeValueLabel: "$10,000 Cash",
    gallery: [
      { src: "/images/majordraws/cash-prize/cash-prize-10000.webp", alt: "$10,000 cash prize" },
    ],
    highlights: [
      { icon: "DollarSign", title: "$10,000 Cash", description: "Pure cash prize - no tools included." },
      { icon: "Banknote", title: "Direct Deposit", description: "Money goes straight to your bank account." },
      { icon: "Gift", title: "Spend It Anywhere", description: "Use the cash however you want." },
      { icon: "CreditCard", title: "No Restrictions", description: "Complete freedom to use as you please." },
    ],
  },
];

export const DEFAULT_PRIZE_SLUG: PrizeSlug = "milwaukee-milwaukee";

export function getPrizeSummaryBySlug(slug: string): PrizeSummary | undefined {
  return PRIZE_SUMMARIES.find((prize) => prize.slug === slug);
}

export function listPrizeSummaries(): PrizeSummary[] {
  return PRIZE_SUMMARIES.slice();
}

/** Short display-friendly labels for winner cards / admin tables (see getPrizeLabel). */
const SHORT_PRIZE_LABELS: Record<PrizeSlug, string> = {
  "milwaukee-sidchrome": "Sidchrome + Milwaukee 13pc + PACKOUT + $5,000 Cash",
  "dewalt-sidchrome": "Sidchrome + DeWalt 14pc + ToughSystem + $5,000 Cash",
  "makita-sidchrome": "Sidchrome + Makita 15pc + MAKTRAK + $5,000 Cash",
  "milwaukee-milwaukee": "Milwaukee Toolbox + Milwaukee 13pc + PACKOUT + $5,000 Cash",
  "dewalt-milwaukee": "Milwaukee Toolbox + DeWalt 14pc + ToughSystem + $5,000 Cash",
  "makita-milwaukee": "Milwaukee Toolbox + Makita 15pc + MAKTRAK + $5,000 Cash",
  "ryobi-sidchrome": "Sidchrome + Ryobi 19pc + LINK + $5,000 Cash",
  "ryobi-milwaukee": "Milwaukee Toolbox + Ryobi 19pc + LINK + $5,000 Cash",
  "milwaukee-kincrome": "Kincrome CONTOUR® + Milwaukee 13pc + PACKOUT + $5,000 Cash",
  "dewalt-kincrome": "Kincrome CONTOUR® + DeWalt 14pc + ToughSystem + $5,000 Cash",
  "makita-kincrome": "Kincrome CONTOUR® + Makita 15pc + MAKTRAK + $5,000 Cash",
  "ryobi-kincrome": "Kincrome CONTOUR® + Ryobi 19pc + LINK + $5,000 Cash",
  "hikoki-sidchrome": "Sidchrome + HiKOKI 15pc + Multi Cruiser + $5,000 Cash",
  "hikoki-milwaukee": "Milwaukee Toolbox + HiKOKI 15pc + Multi Cruiser + $5,000 Cash",
  "hikoki-kincrome": "Kincrome CONTOUR® + HiKOKI 15pc + Multi Cruiser + $5,000 Cash",
  "cash-prize": "$10,000 Cash",
};

/**
 * Get a short, user-friendly label for a prize slug
 * Useful for displaying selected prize in winner cards and admin interfaces
 * @param slug - The prize slug to get the label for
 * @returns A short label string, or undefined if slug is invalid
 */
export function getPrizeLabel(slug: PrizeSlug | string | undefined): string | undefined {
  if (!slug) return undefined;
  const prize = getPrizeSummaryBySlug(slug);
  if (!prize) return undefined;
  return SHORT_PRIZE_LABELS[prize.slug] ?? prize.label;
}
