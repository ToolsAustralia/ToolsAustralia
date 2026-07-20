/**
 * FULL prize catalog — deep spec-sheet data. SERVER-ONLY / lazy-chunk-only.
 *
 * This module is ~170 KB of source and runs top-level side effects
 * (`applySpecItemImages` below), so it must NEVER be statically imported from a
 * client component: it would land in every page's first-load JS. Client consumers
 * use `./prize-summaries` (the lightweight subset — shared types + light fields
 * live THERE and are re-exported here so server consumers keep one import path).
 * The one client surface that needs deep specs — the specifications modal — gets
 * this module via a click-gated `await import("@/config/prizes")` in PrizeShowcase.
 *
 * Drift guard: `npm run test:prize-summaries` asserts the two catalogs agree on
 * slugs and every shared field. Edit prize data in BOTH files.
 */
import type { PrizeMedia, PrizeSlug, PrizeSummary } from "./prize-summaries";

export type { LucideIconName, PrizeHighlight, PrizeMedia, PrizeSlug, PrizeSummary } from "./prize-summaries";
export { DEFAULT_PRIZE_SLUG, getPrizeLabel } from "./prize-summaries";

export interface PrizeSpecItem {
  name: string;
  model?: string;
  description?: string;
  specifications?: string[];
  includes?: string[];
  /** Optional product photo for this item, shown on its spec card (mobile + desktop).
   *  Populated from the matched prize gallery shots; omit when no clean single-item photo exists. */
  image?: PrizeMedia;
}

export interface PrizeSpecSection {
  id: string;
  label: string;
  summary?: string;
  items: PrizeSpecItem[];
}

/** Full catalog entry = the client-safe summary + the deep fields that stay in THIS module. */
export interface PrizeCatalogEntry extends PrizeSummary {
  detailedDescription: string;
  specSections: PrizeSpecSection[];
}

/** Strict canonical name for the Ryobi prize - use consistently across labels, headings, and display. */
export const RYOBI_PRIZE_STRICT_NAME = "Custom Ryobi 18V ONE+ Kit with 36V Brushless Ryobi Lawn Mower";

export const SIDCHROME_SCMT11402_TOOL_KIT: PrizeSpecItem = {
  name: "Sidchrome SCMT11402 356 Piece Tool Kit & Storage",
  description:
    "Comprehensive Sidchrome 356-piece tool kit housed in a heavy-duty roller cabinet with full-extension drawers, foam inlays, and dedicated hand tools for every trade task.",
  specifications: [
    "Includes Sidchrome sockets, spanners, screwdrivers, pliers & precision accessories",
    "Lockable roller cabinet with side locker, peg board, and premium drawer liners",
    "Foamed tool trays and colour-coded modules for quick inventory on site",
    "Industrial casters with brakes for safe workshop mobility",
  ],
};

export const MILWAUKEE_POWER_TOOLS: PrizeSpecItem[] = [
  {
    name: "MILWAUKEE 18V FUEL™ 13mm Hammer Drill/Driver",
    model: "M18FPD30",
    description:
      'The 18V FUEL™ 13 mm Hammer Drill Driver delivers the capability to drill large holes at high speed into the densest materials. The cordless drill is a compact design and solution, featuring AutoStop™ Control Mode for Enhanced Safety. The POWERSTATE™ Brushless motor delivers the most power under load to complete 2-9/16" Self-Feed holes in dense woods for increased productivity. At only 175 mm in length, it provides maximum access and maneuverability in tight spaces.',
    specifications: [
      "Chuck Type: 13 mm Metal Chuck",
      "RPM: 0 - 500 / 0 - 2,100",
      "BPM: 0 - 33,000",
      "Torque: 158 Nm",
      "Length: 175 mm",
      "POWERSTATE™ Brushless Motor delivers 158 Nm of Max Torque with 2,100 RPM and 33,000 BPM",
      "Redesigned trigger mechanism with improved fitment and smoother acceleration",
      "Enhanced safety control mode, AUTOSTOP™, preventing over-rotations",
      "New M-Clutch design enables wider range of torque settings",
    ],
    includes: [
      "1 x 18V FUEL™ 13mm Hammer Drill/Driver (M18FPD3)",
      "1 x Bit Holder",
      "1 x Side Handle",
      "1 x Belt Clip",
    ],
  },
  {
    name: "MILWAUKEE 18V FUEL™ 1/4inch Hex Impact Driver",
    model: "M18FID30",
    description:
      'The 18V FUEL™ 1/4" Hex Impact Driver features the POWERSTATE™ Brushless motor which delivers maximum power for a full range of capabilities to complete the widest variety of applications. Increase productivity on the jobsite with fast driving speed without sacrificing power or control.',
    specifications: [
      'Chuck Type: 1/4" Hex',
      "Max Torque: 226 Nm",
      "RPM: 0 - 1,700 / 3,000 / 3,900 / 3,900",
      "IPM: 0 - 1,400 / 3,600 / 4,400 / 4,400",
      "DRIVE CONTROL™: 4 - Mode",
      "Single Hand Bit Insertion: Yes",
      "Tri-LED: Yes",
      "Enhanced motor gives 0 - 4,400 IPM and 226 Nm of Max Torque",
      "4-Mode Drive Control provides greater control over output speed and power",
    ],
    includes: ['1 x 18V FUEL™ 1/4" Hex Impact Driver (M18FID3)', "1 x Bit Holder", "1 x Belt Clip"],
  },
  {
    name: "MILWAUKEE 18V FUEL™ Brushless 125mm Angle Grinder",
    model: "M18FAG125XPD-0",
    description:
      'The M18 FUEL™ 125 mm (5") Angle Grinder with Deadman Paddle Switch is the next advancement in power and performance, fast cutting, and a lighter and more compact design when compared to the current model.',
    specifications: [
      'Wheel Diameter: 125 mm (5")',
      "Switch Type: Paddle Switch, No-Lock",
      "No Load RPM: 8,500",
      "Spindle: M14",
      "E-Clutch / Kickback Protection: Yes",
      "Overload Protection: Yes",
      "Tool-Free Guard Change: Yes",
      "Tool-Free Accessory Change: Yes",
      "Anti-Vibration Handle: Yes",
    ],
    includes: [
      "1 x Anti-Vibration Side Handle",
      '1 x 125 mm (5") Type 27 Guard',
      "1 x Type 1 Clip-On Guard",
      "1 x Backing Flange",
      "1 x Spanner Wrench",
      "2 x Vent Clips",
    ],
  },
  {
    name: "MILWAUKEE 18V Barrel FUEL™ Jigsaw",
    model: "M18FBJS-0",
    description:
      "The M18 FUEL Barrel Grip Jigsaw combines power, blade speed and precision, to provide the highest quality cuts in a wide variety of materials.",
    specifications: [
      "LED Light: Yes",
      "Speed: 6-Speed",
      "Blade: T-Shank",
      "Orbital Setting: 4-Position",
      "Tool Free Bevel: Detents at 0,15,30,45 degrees",
      "3500 strokes per minute for clean controlled cuts",
      "Up to 32m of cutting in 19mm laminated particle board",
      "On/Off Cut Line Blower keeps cut line clear",
    ],
    includes: [
      "1 x 18V FUEL™ Barrel Grip Jigsaw M18FBJS-0 (Tool Only)",
      "1 x Anti-Splinter Guard",
      "1 x Dust Collection Tube",
      "1 x Dust Cover",
      "1 x General Purpose Jigsaw Blade",
      "1 x Hex Wrench",
      "1 x LED Cover",
      "1 x Shoe Guard",
    ],
  },
  {
    name: "MILWAUKEE 18V FUEL™ HACKZALL™ Reciprocating Saw",
    model: "M18FHZ-0",
    description:
      "The MILWAUKEE M18 FUEL HACKZALL is the fastest cutting and most powerful one-handed reciprocating saw.",
    specifications: [
      "LED Light: Yes",
      "Shoe: Pivoting Shoe",
      "22mm stroke length for faster cuts",
      "Compact and lightweight design",
      "One-handed design for superior control",
      "Lower vibration for smooth cut starts",
    ],
  },
  {
    name: "MILWAUKEE 18V FUEL™ 184mm Circular Saw",
    model: "M18FCS66G30",
    description:
      "The M18 FUEL™ 184mm Circular Saw is designed for the professional carpenter, remodelers, and general contractors who rely on high-performing and durable tools.",
    specifications: [
      "Platform: M18 FUEL™",
      "Voltage: 18V",
      'Blade Size: 184mm (7-1/4")',
      "Arbor Size: 20mm",
      "No Load Rpm: 6,000",
      "Maximum Bevel Capacity: 50°",
      "Depth Of Cut At 90°: 0 To 64 Mm",
      "Depth Of Cut At 45°: 0 To 50 Mm",
      "Cut Line Blower: Yes",
      "Led Light: Yes",
      "Up to 750 cuts per charge with M18 REDLITHIUM™ FORGE™ 12.0Ah Battery",
    ],
    includes: [
      "1 x M18 FUEL™ 185mm Circular Saw (M18FCS66G30)",
      "1 x 184mm 24T Thick Kerf Framing Blade (48408740)",
      "1 x Vacuum Adaptor",
      "1 x Blade Wrench",
    ],
  },
  {
    name: "MILWAUKEE 18V FUEL™ Brushless Oscillating Multi-Tool",
    model: "M18FMT-0",
    description:
      "The MILWAUKEE® M18 FUEL™ Multi-Tool generates fast cuts, the power for demolition, and low full tool vibration.",
    specifications: [
      "Platform: M18 FUEL™",
      "OPM: 10,000 - 20,000",
      "Oscillation Angle: 4.2°",
      "Speed Settings: 10",
      "Auto-Load feature for precise cuts",
      "Variable Speed Dial with 10 settings",
      "Vibration dampening technology",
      "180° span LED for visibility",
      "Tool-free blade change",
    ],
  },
  {
    name: "MILWAUKEE 18V Bluetooth/USB-C Jobsite Speaker",
    model: "M18JSSP20",
    description:
      "The M18 FUEL™ 184mm Circular Saw is designed for the professional carpenter, remodelers, and general contractors.",
    specifications: ["Platform: M18 FUEL™", "Voltage: 18V", "Bluetooth connectivity", "USB-C charging port"],
  },
  {
    name: "MILWAUKEE 18V Compact Battery Light w/ USB Charging",
    model: "M18CBL0",
    description:
      "The M18™ Compact Battery Light w/ USB Charging offers portable convenience combined with high output lighting.",
    specifications: [
      "Platform: M18™",
      "Maximum Lumens: 1,000 Lumens",
      "Modes: High (1,000) | Medium (500) | Low (250) | Ultra-Low (85)",
      "Runtime on M18 REDLITHIUM 5.0Ah Battery: High (12 Hrs) | Medium (22 Hrs) | Low (42 Hrs) | Ultra-Low (110 Hrs)",
      "USB Charging Output: 1 x USB-C & 1 x USB-A",
      "Horizontal Rotation: 300°",
      "Vertical Rotation: 180°",
      "Drop Rating: 2.7 Metres",
    ],
  },
  {
    name: "MILWAUKEE 18V Compact Blower",
    model: "M18BBL-0",
    description: "The M18™ Compact Blower delivers fast job site cleanup for maximum productivity.",
    specifications: [
      "Platform: M18™",
      "Voltage: 18v",
      "Rpm: 18,700 (Fan Speed)",
      "Maximum Air Speed: 0 - 257 Kph",
      "Maximum Air Volume: 2.8 M3/Min",
      "Length: 521 Mm (Without 230 Mm Nozzle Extension)",
      "Weight: 1.2kg",
      "Warranty: 5 Years",
      "3-Speed electronic switch and variable speed trigger",
    ],
    includes: [
      "1 x M18 BBL M18™ Compact Blower (Tool only) [M18BBL-0]",
      "1 x 200mm Nozzle",
      "1 x 230mm Nozzle extension",
      "1 x Universal inflator/deflator attachment",
    ],
  },
  {
    name: "MILWAUKEE 18V FUEL™ 1/2inch Mid-Torque Impact Wrench",
    model: "M18FMTIW2F12-0",
    description:
      'The M18 FUEL™ 1/2" Mid-Torque Impact Wrench with Friction Ring delivers access in tight spaces, up to 881 Nm of nut-busting torque, and maximum power to weight ratio.',
    specifications: [
      "Platform: M18 FUEL™",
      'Anvil Type: 1/2" Square with Friction Ring',
      "Fastening Torque: 746 Nm",
      "Nut-Busting Torque: 881 Nm",
      "DRIVE CONTROL: 4-Mode with Auto Shut-Off Mode & Bolt Removal Mode",
      "RPM: 0 – 1,250 / 0 – 1,950 / 0 – 2,575 / 0 – 2,575",
      "IPM: 0 – 900 / 0 – 2,100 / 0 – 3,100 / 0 – 3,100",
      "152 mm in length for maximum access in tight spaces",
      "Tri-LEDs deliver high definition lighting",
    ],
  },
  {
    name: "MILWAUKEE 18V 125mm Random Orbital Sander",
    model: "M18BOS125-0",
    description: "The M18™ 125mm Random Orbital Sander delivers corded power with 12,000 Max OPM output.",
    specifications: [
      "Maximum OPM: 12,000 OPM",
      'Pad Size: 125mm (5")',
      "7,000-12,000 OPM variable speed dial",
      "Up to 35 minutes of run-time on M18™ 3.0Ah Battery Pack",
      "Electronic variable speed control",
      "Constant Power Technology",
      "Overload protection",
    ],
    includes: [
      "1 x M18™ Random Orbital Sander M18BOS125-0 (Tool Only)",
      "2 x 80 Grit Sandpaper",
      "1 x Dust Canister",
      "1 x Plastic Dust Canister",
      "1 x Universal Hose Adapter",
      "1 x Universal Vac Hose Adapter",
    ],
  },
  {
    name: "MILWAUKEE 18V FUEL™ 8inch (203Mm) Hatchet Pruning Saw",
    model: "M18FHS80",
    description:
      'The MILWAUKEE® 18V FUEL™ HATCHET™ 8" (203 mm) Pruning Saw delivers maximum control & access, has the power to cut hardwoods, while delivering fast cuts.',
    specifications: [
      'Bar Length: 8" (203 mm)',
      'Chain Gauge: 0.043" (1.1 mm)',
      'Chain Pitch: 3/8" Low Profile (9.5 mm)',
      "Drive Links: 33",
      "Trigger: Variable Speed",
      "Weight: 2.2 kg (tool only)",
      "Easy access chain tensioner",
      "Automatic oiler",
      "Metal bucking spikes",
    ],
  },
];

export const MILWAUKEE_POWER_SYSTEM: PrizeSpecItem[] = [
  {
    name: "MILWAUKEE 18V RedLithium™ 5.0Ah Battery Kit",
    model: "M18B5",
    description:
      "High-capacity REDLITHIUM-ION™ batteries engineered for maximum runtime, cooler operation, and longer life to drive the full 18V FUEL™ platform all day.",
    specifications: [
      "Pack Construction: Shock-responsive separators prevent cell damage",
      "Electronics: REDLINK™ Intelligence monitors temperature and overload",
      "Runtime: Up to 2x more recharges vs. standard lithium-ion packs",
      "Warranty: 2 years commercial use",
    ],
  },
];

// Single source Sidchrome storage so both prize packs stay in sync.
export const MILWAUKEE_WORKSHOP_STORAGE: PrizeSpecItem[] = [SIDCHROME_SCMT11402_TOOL_KIT];

// Milwaukee Toolbox specs
export const MILWAUKEE_TOOLBOX: PrizeSpecItem = {
  name: "MILWAUKEE 56\" High Capacity Combination Tool Storage",
  model: "48228559",
  description:
    "The next generation of MILWAUKEE high capacity steel tool storage featuring welded steel construction with 18 gauge steel construction and 6 gauge angle iron base. The 56\" High Capacity Combination has a 4-outlet/2USB power strip mounted inside the chest and one on the side of the trolley. Cord hooks are included to wrap the power cords for storage.",
  specifications: [
    "Heavy Duty 18 Gauge Construction built for ultimate durability",
    "68KG Soft Close Drawer Slides",
    "Electronic Lock for easy locking and unlocking without a key",
    "Reinforced angle iron Frame And 6\" Industrial Casters",
    "4-outlet/2USB power strip mounted inside chest till; cord hooks included to wrap the power cords for storage",
    "22\" Depth For additional storage capacity",
    "Includes pre-cut, premium PVC solid drawer liners and a thick top mat to keep your tools in place",
    "Power tool organiser",
    "Paper towel holder and 2 large J-hooks can be mounted on either side of the chest, high or low, to suit your preference",
    "The cabinet has 2 full-width drawers in cabinet for storage of longer items",
    "Privacy Drawer with separate lock in chest for personal items",
  ],
};

// Storage for Milwaukee toolbox prizes
export const MILWAUKEE_TOOLBOX_STORAGE: PrizeSpecItem[] = [MILWAUKEE_TOOLBOX];

/** Kincrome CONTOUR® workshop kit — matches detail level of Milwaukee toolbox prize copy */
export const KINCROME_CONTOUR_TOOLBOX: PrizeSpecItem = {
  name: "KINCROME CONTOUR® Workshop Tool Kit 470pc 17 Drawer (42\") — P1823",
  model: "P1823",
  description:
    "Premium CONTOUR® chest-and-trolley workshop kit: 470 pieces in a 42\" wide layout, with KINCROME’s contoured steel styling, UV powder-coated finish (black or blue), ADRS drawer retention, folding side trays with magnetic boards, stainless worktops, and heavy-duty swivel castors.",
  specifications: [
    "Part P1823 — 470 pieces, 17 drawers, 42\" extra-wide workshop configuration",
    "Designed in Australia; modular CONTOUR® range for carts, chests, hutches and kits",
    "ADRS automatic drawer retention, screen-printed side panels, heavy-duty steel handles",
    "Folding side work trays, stainless worktops, premium manoeuvrability on castors",
  ],
};

export const KINCROME_TOOLBOX_STORAGE: PrizeSpecItem[] = [KINCROME_CONTOUR_TOOLBOX];

export const DEWALT_SIDCHROME_POWER_TOOLS: PrizeSpecItem[] = [
  {
    name: "DeWalt DCD1007N-XJ 18V XR 3 Speed Premium Brushless Hammer Drill Driver",
    description:
      "Take on a wide range of demanding applications with DeWalt’s flagship 18V XR 3-speed hammer drill. ANTI-ROTATION technology keeps users safe, while the brushless motor and all-metal gearbox deliver the torque, speed, and endurance professionals expect.",
    specifications: [
      "Battery Voltage: 18V",
      "Brushless motor with 1,530 W output",
      "No Load Speed (RPM): 0-500 / 0-1,300 / 0-2,250",
      "Beats Per Minute: 0-8,500 / 0-22,100 / 0-38,250",
      "Max Torque: 169 Nm",
      "Max Drilling Capacity – Masonry: 12.7 mm",
      "Max Drilling Capacity – Metal: 25.4 mm",
      "Max Drilling Capacity – Wood: 66 mm",
      "Chuck Capacity: 1.5-13 mm",
      "Weight: 1.85 kg",
      "3-year DeWalt warranty (registration required)",
    ],
    includes: ["Magnetic Bit Holder", "Belt Hook"],
  },
  {
    name: "DeWalt DCF860N-XJ 18V XR Li-ion Brushless 3 Speed Premium Impact Driver",
    description:
      "The most powerful 18V XR impact driver DeWalt has released, combining 282 Nm of torque with a compact 123 mm body, four-mode control, and a high-output LED halo.",
    specifications: [
      "Voltage: 18V",
      'Chuck: 1/4" quick release',
      "Max Torque: 282 Nm",
      "Length: 123 mm",
      "LED ring output: 82 lumens with flashlight mode",
      "Brushless motor with 3 speed settings",
      "4-mode select switch for precise control",
      "1-year limited warranty + 3-year extended warranty via registration",
    ],
  },
  {
    name: 'DeWalt DCF892N-XJ 18V XR Cordless Brushless 1/2" Detent Pin Impact Wrench',
    description:
      "Ultra-compact, lightweight high-torque wrench delivering up to 1,152 Nm breakaway torque to handle seized fasteners in confined spaces.",
    specifications: [
      "Voltage: 18V",
      'Anvil Size: 1/2" detent pin',
      "Fastening Torque: 812 Nm",
      "Breakaway Torque: 1,152 Nm",
      "Overall Length: 175 mm",
      "Weight: 1.6 kg",
      "Bright LED with adjustable brightness control",
      "3-year DeWalt warranty (registration required)",
    ],
  },
  {
    name: "DeWalt DCP580N-XE 18V XR Brushless Planer",
    description:
      "A compact, well balanced 82 mm planer with brushless motor technology for long runtime, precise finishes, and effortless blade changes.",
    specifications: [
      "Voltage: 18V",
      "No Load Speed: 15,000 rpm",
      "Maximum Depth of Cut: 2 mm",
      "Rebating Depth: 9 mm",
      "Planer Width: 82 mm",
      "Shoe Length: 295 mm",
      "Drum Diameter: 48 mm",
      "Weight: 2.5 kg",
      "Sound Pressure: 88 dB(A)",
    ],
    includes: [
      "Tungsten carbide tipped reversible blades",
      "Hex wrench",
      "Torx key",
      "Guide fence",
      "Blade alignment plate",
    ],
  },
  {
    name: "DeWalt DCS334N-XJ 18V XR Brushless Top Handle Jigsaw",
    description:
      "Torque-rich brushless jigsaw for fast, controlled cuts. Features variable speed trigger, 4-position pendulum action, and tool-free shoe bevel adjustments.",
    specifications: [
      "Voltage: 18V",
      "Stroke Rate: 0 - 3,200 spm",
      "Stroke Length: 26 mm",
      "Bevel Capacity: 0 - 45°",
      "Max Cutting Capacity – Wood: 135 mm",
      "Max Cutting Capacity – Steel: 10 mm",
      "Weight: 2.1 kg",
      "Sound Pressure: 84 dB(A)",
    ],
  },
  {
    name: "DeWalt DCS356N-XJ 18V XR Brushless Multi Tool with Speed Selector",
    description:
      "18V brushless oscillating multi-tool with quick release blade clamp, dual-position trigger, 3-speed selector, and integrated LED for precision in low light.",
    specifications: [
      "Voltage: 18V",
      "Power Output: 300 W",
      "Oscillations per Minute: 0-20,000 opm",
      "Oscillation Angle: 1.6°",
      "Length: 310 mm",
      "Weight: 1.06 kg",
    ],
    includes: [
      "Universal blade adaptor",
      "Sanding pad + 9 mesh sheets",
      "31 mm x 43 mm wood with nails blade",
      "31 mm x 43 mm fast cut wood blade",
    ],
  },
  {
    name: "DeWalt DCS578N-XE 54V FlexVolt XR Brushless 184mm Circular Saw",
    description:
      "Flagship FlexVolt circular saw delivering corded performance with tool-free depth and bevel adjustments, dust extraction, and onboard storage.",
    specifications: [
      "Voltage: 54V",
      "No Load Speed: 5,800 rpm",
      "Blade Diameter: 184 mm",
      "Blade Bore: 20 mm",
      "Bevel Capacity: 57°",
      "Max Depth of Cut @ 90°: 64 mm",
      "Max Depth of Cut @ 45°: 46 mm",
      "Weight: 3.6 kg",
    ],
    includes: ["Precision 36 tooth saw blade", "Rip fence", "Blade spanner", "Dust extraction spout"],
  },
  {
    name: "DeWalt DCG418N-XJ 54V FlexVolt XR Brushless 125mm Angle Grinder",
    description:
      "High-power FlexVolt grinder with electronic brake, kickback-reducing clutch, ergonomic grip, and 1-Touch guard system.",
    specifications: [
      "Voltage: 54V",
      "Max Disc Diameter: 125 mm",
      "Power Output: 2,300 W",
      "No Load Speed: 9,000 rpm",
      "Spindle Thread: M14",
      "Length: 400 mm",
      "Weight: 2.2 kg",
    ],
  },
  {
    name: "DeWalt DCH333NT-XJ 54V FlexVolt XR Brushless 3-Mode SDS Plus Rotary Hammer",
    description:
      "Heavy-duty SDS+ rotary hammer featuring Perform & Protect vibration suppression, 3.5 J impact energy, and class-leading drilling speed.",
    specifications: [
      "Voltage: 54V",
      "No Load Speed: 0-1,000 rpm",
      "Impact Energy: 3.5 J",
      "Blows per Minute: 0-4,480 bpm",
      "Max Drilling Capacity – Concrete: 30 mm",
      "Max Drilling Capacity – Wood: 30 mm",
      "Max Drilling Capacity – Metal: 13 mm",
      "Weight: 3.7 kg",
      "Vibration – Concrete: 7.5 m/s²",
    ],
    includes: ["Heavy duty kitbox", "Belt hook", "Multi-position side handle"],
  },
  {
    name: "DeWalt DCS389N-XJ 54V FlexVolt XR Brushless Reciprocating Saw",
    description:
      "54V reciprocating saw delivering corded-level cutting power with lever blade clamp, pivoting shoe, and aggressive 28.6 mm stroke.",
    specifications: [
      "Voltage: 54V",
      "No Load Stroke Rate: 0-3,000 spm",
      "Stroke Length: 28.6 mm",
      "Max Cutting Capacity – Wood: 300 mm",
      "Max Cutting Capacity – Steel: 130 mm",
      "Max Cutting Capacity – PVC: 160 mm",
      "Weight: 3 kg",
    ],
  },
  {
    name: "DeWalt DWST1-81080-XE 18V-54V XR TSTAK Bluetooth Charger DAB Jobsite Radio",
    description:
      "Rugged TSTAK-compatible jobsite radio with twin subwoofers, BLE control via mobile app, and onboard charging for XR and FlexVolt batteries.",
    specifications: [
      "Voltage Support: 18V & 54V",
      "Output: 45 W",
      "Speakers: 4 mid-range + 2 subwoofers",
      "Frequencies: FM, AM, DAB+",
      "IP Rating: IP54",
      "Connectivity: Bluetooth Low Energy, USB charging, 3.5 mm AUX",
    ],
  },
  {
    name: "DeWalt DCV100-XE 18V XR Compact Jobsite Blower",
    description:
      "Lightweight blower with variable speed trigger and reversible transmission for cleanup, inflating, and deflating tasks.",
    specifications: [
      "Voltage: 18V",
      "Fan Speed: 18,000 rpm",
      "Power Output: 265 W",
      "Air Throughput: 2.8 m³/min",
      "Air Speed: 80 m/s",
      "Length: 508 mm",
    ],
    includes: ["Round nozzle", "Nozzle extension", "Inflator/deflator attachment"],
  },
  {
    name: "DeWalt DCV501LN-XJ 18V XR L-Class Hand-Held Stick Vacuum",
    description:
      "Compact L-class compliant stick vacuum with HEPA filtration, onboard LED, and 1,260 L/min airflow for safe dust extraction on site.",
    specifications: [
      "Voltage: 18V",
      "Max Air Flow: 21.7 L/sec",
      "Tank Capacity: 0.7 L",
      "Extraction Class: L-Class",
      "Weight (Skin): 1.5 kg",
    ],
    includes: ["Crevice tool", "Extension wand", "Floor head", "Flexi hose", "Gulper tool", "Brush", "Soft tool bag"],
  },
  {
    name: "DeWalt DCW210N-XJ 18V XR Brushless 125mm Random Orbital Sander",
    description:
      "Brushless random orbital sander with wireless tool control, variable speed dial, and overmold grip for one-handed operation.",
    specifications: [
      "Voltage: 18V",
      "Base Diameter: 125 mm",
      "Orbits per Minute: 8,000 - 12,000 opm",
      "Orbit Size: 2.6 mm",
      "Weight: 0.9 kg",
      "Wireless Tool Control compatible",
    ],
    includes: ["One-handed locking dust bag"],
  },
];

export const DEWALT_SIDCHROME_POWER_SYSTEM: PrizeSpecItem[] = [
  {
    name: "DeWalt DCB547-XJ XR FlexVolt 9.0Ah Battery (x2)",
    description:
      "Convertible 18V/54V FlexVolt batteries unlock corded performance across heavy-duty tools while remaining backward compatible with XR platforms.",
    specifications: [
      "Capacity: 9.0Ah",
      "Voltage: 18V & 54V (automatic switching)",
      "Weight: 1 kg per battery",
      "3-year DeWalt warranty",
    ],
  },
  {
    name: "DeWalt DCB184-XJ XR 5.0Ah Slide Battery (x2)",
    description:
      "High-capacity 5.0Ah XR batteries delivering 66% more runtime than 3.0Ah packs with built-in charge indicators and thermal protection.",
    specifications: [
      "Voltage: 18V",
      "Capacity: 5.0Ah",
      "Weight: 0.6 kg per battery",
      "No memory effect & minimal self-discharge",
    ],
  },
  {
    name: "DeWalt DCB132-XE Dual Port FlexVolt Charger",
    description:
      "Simultaneously charges two 18V/54V FlexVolt packs with conformal coating, wall mount, and intelligent temperature-controlled charging.",
    specifications: [
      "Charging Output: 4.0A simultaneous",
      "Compatible with 18V XR & FlexVolt packs",
      "Operating Temperature: 4°C - 40°C",
      "Weight: 1.41 kg",
    ],
  },
];

export const DEWALT_SIDCHROME_STORAGE: PrizeSpecItem[] = [
  {
    name: "DeWalt DWST1-71195 TSTAK VI Deep Power Tool Storage Box",
    description:
      "23L TSTAK storage unit with removable tray, metal latches, and modular stacking designed to transport larger power tools securely.",
    specifications: [
      "Capacity: 23 L",
      "Dimensions: 440 mm x 332 mm x 301 mm",
      "Padlock ready with heavy-duty metal latches",
      "Bi-material carry handle",
    ],
  },
  {
    name: "DeWalt DWST1-79210 Heavy Duty Wheeled Power Tool Bag",
    description:
      "Massive capacity wheeled tool bag featuring telescopic handle, hard-wearing wheels, and configurable internal storage for large kits.",
    specifications: [
      "Dimensions: 685 mm x 330 mm x 285 mm",
      "Double heavy-duty zips for full access",
      "8 external pockets, removable divider, padded shoulder strap",
      "Raised plastic rails protect against wet surfaces",
    ],
  },
  SIDCHROME_SCMT11402_TOOL_KIT,
];

export const MAKITA_SIDCHROME_POWER_TOOLS: PrizeSpecItem[] = [
  {
    name: "Makita DHP486Z - 18V Brushless Heavy Duty Hammer Driver Drill",
    model: "DHP486Z",
    description:
      "Massive drilling capacity with 152mm hole saw & 50mm auger bit capacity. Compact overall length only 178mm for use in narrow work spaces. High powered Brushless Motor produces 141Nm peak torque. High durability aluminium gear housing. Mechanical 2 speed gearing with all metal gear construction.",
    specifications: [
      "Voltage: 18V",
      "Chuck Type: 13mm",
      "Peak Torque: 141 Nm",
      "Length: 178mm",
      "Drilling Capacity - Hole Saw: 152mm",
      "Drilling Capacity - Auger Bit: 50mm",
      "Mechanical 2 speed gearing",
      "All metal gear construction",
      "Aluminium gear housing for durability",
    ],
  },
  {
    name: "Makita DTD173Z - 18V Brushless 4-Stage Impact Driver",
    model: "DTD173Z",
    description:
      "Optimised battery layout, moves center of gravity in line with the grip for enhanced control. Maximum fastening torque of 180Nm for heavy duty applications. 4 stage speed selection & 4 Assist mode variations for optimised speed control. Compact design at only 111mm in length for comfortable use in tight spaces. Quick switch button for single handed mode selection. Enhanced bit holder provides reduced bit wobble.",
    specifications: [
      "Voltage: 18V",
      "Max Fastening Torque: 180 Nm",
      "Length: 111mm",
      "4 Stage speed selection",
      "4 Assist mode variations",
      "Quick switch button for single handed mode",
      "Enhanced bit holder reduces wobble",
      "Optimised battery layout for balance",
    ],
  },
  {
    name: "Makita DGA508Z - 18V Mobile Brushless 125mm Paddle Switch Angle Grinder",
    model: "DGA508Z",
    description:
      "Electronic brake, kickback detection, anti-restart and soft start. Automatic Torque Drive increases torque to power through any cut. Extreme performance with 8,500rpm no load speed. XPT technology that protects against dust & moisture. Electronic current limiter.",
    specifications: [
      "Voltage: 18V",
      "Disc Diameter: 125mm",
      "No Load Speed: 8,500 rpm",
      "Electronic brake",
      "Kickback detection",
      "Anti-restart protection",
      "Soft start technology",
      "Automatic Torque Drive",
      "XPT technology (dust & moisture protection)",
      "Electronic current limiter",
    ],
  },
  {
    name: "Makita DHR242Z - 18V Mobile Brushless 24mm SDS Plus Rotary Hammer",
    model: "DHR242Z",
    description:
      "3 Mode operation: hammer only, rotation only, rotation & hammer. Unique rubber joint suppresses vibration to battery. 2.0j of impact energy. Compatible with DX06 optional dust extractor.",
    specifications: [
      "Voltage: 18V",
      "Chuck Type: SDS Plus",
      "Impact Energy: 2.0 J",
      "3 Mode operation (hammer, rotation, rotation & hammer)",
      "Unique rubber joint for vibration suppression",
      "Compatible with DX06 dust extractor",
    ],
  },
  {
    name: "Makita DHS680Z - 18V Mobile Brushless 165mm Circular Saw",
    model: "DHS680Z",
    description:
      "Max cut capacity of 57mm with up to 50° bevel capacity. Automatic Torque Drive increases torque to power through any cut. High cutting performance with up to 5,000rpm no load speed. Electric brake rapidly slows the blade for added safety. Blower function blows dust away from cut line for greater visibility.",
    specifications: [
      "Voltage: 18V",
      "Blade Diameter: 165mm",
      "Max Cut Capacity: 57mm",
      "Bevel Capacity: Up to 50°",
      "No Load Speed: 5,000 rpm",
      "Automatic Torque Drive",
      "Electric brake",
      "Blower function for dust clearance",
    ],
  },
  {
    name: "Makita DJR187Z - 18V Mobile Brushless Recipro Saw",
    model: "DJR187Z",
    description:
      "32mm stroke with a cutting capacity of 255mm in wood. Newly designed vertical crank mechanism reduces vibration. High performance 3,000spm no load speed. Rafter hanging hook for added convenience. XPT technology that protects against dust & moisture.",
    specifications: [
      "Voltage: 18V",
      "Stroke: 32mm",
      "Cutting Capacity - Wood: 255mm",
      "No Load Speed: 3,000 spm",
      "Vertical crank mechanism reduces vibration",
      "Rafter hanging hook",
      "XPT technology (dust & moisture protection)",
    ],
  },
  {
    name: "Makita DTM52ZX3 - 18V Brushless Multi-Tool",
    model: "DTM52ZX3",
    description:
      "Starlock Max accessory mounting system designed for heavy duty applications. Anti-Vibration Technology (AVT) with a counterbalance system significantly reducing vibration. Increased cutting efficiency with improved oscillation angle of 3.6° for rapid cutting speeds. Variable speed control dial for adjusting the speed to suit the application. Tool-less lever lock system allows for quick install and removal of accessories.",
    specifications: [
      "Voltage: 18V",
      "Mounting System: Starlock Max",
      "Oscillation Angle: 3.6°",
      "Anti-Vibration Technology (AVT)",
      "Counterbalance system",
      "Variable speed control dial",
      "Tool-less lever lock system",
    ],
  },
  {
    name: 'Makita DTW700Z - 18V Brushless 1/2" Impact Wrench',
    model: "DTW700Z",
    description:
      "Compact design for comfortable handling at only 170mm in length. 4 Stage power selection for optimum rpm and fastening torque. Maximum nut busting torque of 1,000Nm with 700Nm max. fastening. Unique rubber joint suppress vibration to battery terminals. Forward & reverse auto stop function, optimised for fastening applications.",
    specifications: [
      "Voltage: 18V",
      'Anvil Size: 1/2"',
      "Length: 170mm",
      "Max Fastening Torque: 700 Nm",
      "Max Nut Busting Torque: 1,000 Nm",
      "4 Stage power selection",
      "Unique rubber joint for vibration suppression",
      "Forward & reverse auto stop function",
    ],
  },
  {
    name: "Makita DBO180Z - 18V Mobile Random Orbital Sander",
    model: "DBO180Z",
    description:
      "Three speed settings (7,000/9,500/11,000 OPM) engineered for faster material removal. Large 2.8mm random orbit action engineered for fast sanding and swirl-free finish. Ergonomically designed body and grip for increased operator comfort. Uses quick-change 125mm hook-and-loop abrasive paper. Dust Box provides efficient through-the-pad dust collection for a cleaner work environment.",
    specifications: [
      "Voltage: 18V",
      "Pad Size: 125mm",
      "Speed Settings: 7,000 / 9,500 / 11,000 OPM",
      "Orbit Size: 2.8mm",
      "Quick-change 125mm hook-and-loop abrasive paper",
      "Dust Box for through-the-pad dust collection",
      "Ergonomically designed body and grip",
    ],
  },
  {
    name: "Makita DCL283ZBX1 - 18V Brushless Stick Vacuum",
    model: "DCL283ZBX1",
    description:
      "Weighs only 1.6kg with battery for high efficiency and ease of use. HEPA filter provides high filtration rate of 99.97%. High performance 17.5kPa max sealed suction. Easy operation with trigger or slide lock on switch. 730mL Capsule collection capacity.",
    specifications: [
      "Voltage: 18V",
      "Weight (with battery): 1.6kg",
      "Max Sealed Suction: 17.5 kPa",
      "Collection Capacity: 730mL",
      "HEPA filter (99.97% filtration rate)",
      "Trigger or slide lock on switch",
    ],
  },
  {
    name: "Makita DJV184Z - 18V Brushless Jigsaw",
    model: "DJV184Z",
    description:
      "Constant speed control maintains cutting speed under load. Tool-less blade change for quick and convenient blade changes. 3 orbital settings plus straight cutting deliver faster and more accurate cuts in a variety of materials. Variable control dial enables user to match the speed to the application. Soft No Load feature automatically reduces SPM for more accurate cutting starts.",
    specifications: [
      "Voltage: 18V",
      "Constant speed control",
      "Tool-less blade change",
      "3 orbital settings plus straight cutting",
      "Variable control dial",
      "Soft No Load feature",
    ],
  },
  {
    name: "Makita DKP181Z - 18V Brushless AWS* 82mm Planer",
    model: "DKP181Z",
    description:
      "High powered motor allows maximum 3mm cutting depth. Auto-start Wireless System (AWS) for on demand dust extraction*. 12,000rpm no load speed with Automatic Torque Drive performance. Left or right side chip ejection. Electric brake & foot on base plate protect workpiece from damage.",
    specifications: [
      "Voltage: 18V",
      "Planer Width: 82mm",
      "Max Cutting Depth: 3mm",
      "No Load Speed: 12,000 rpm",
      "Auto-start Wireless System (AWS) for dust extraction",
      "Automatic Torque Drive",
      "Left or right side chip ejection",
      "Electric brake",
      "Foot on base plate protects workpiece",
    ],
  },
  {
    name: "Makita DUB185Z - 18V Blower",
    model: "DUB185Z",
    description:
      "Increased air volume with 3.2m³/min. 3 stage air volume settings & variable speed trigger for maximum control. Wind speeds of up to 352km/h for higher blowing efficiency. Ultra-lightweight at just 2.1kg.",
    specifications: [
      "Voltage: 18V",
      "Air Volume: 3.2 m³/min",
      "Max Wind Speed: 352 km/h",
      "Weight: 2.1kg",
      "3 stage air volume settings",
      "Variable speed trigger",
    ],
  },
  {
    name: "Makita MR002GZ - 40V Max Bluetooth Jobsite Radio",
    model: "MR002GZ",
    description:
      "Audio Modes: Bluetooth, AM & FM radio frequencies. High quality sound with 2 large 89mm speakers. Durable design with an IP65 rating protection against dust and water. Powered by 40V Max, 18V, 12V Max or AC Power. Runtime up to 27.5 hours with an optional 40V Max 4.0Ah battery.",
    specifications: [
      "Voltage: 40V Max / 18V / 12V Max / AC",
      "Audio Modes: Bluetooth, AM, FM",
      "Speakers: 2 x 89mm",
      "IP Rating: IP65",
      "Runtime: Up to 27.5 hours (with 40V Max 4.0Ah battery)",
    ],
  },
  {
    name: "Makita DML812 - 18V LED Long Distance Flashlight",
    model: "DML812",
    description:
      "Long beam distance lights up objects up to 640 metres away. 4 output modes; spot light, flood light, spot/flood and strobe. High brightness neutral white LED's provide a maximum 1,250lm. Continuous runtime up to 7 hours with a 5.0Ah in spotlight mode.",
    specifications: [
      "Voltage: 18V",
      "Max Beam Distance: 640 metres",
      "Max Brightness: 1,250 lm",
      "Output Modes: Spot light, flood light, spot/flood, strobe",
      "Runtime: Up to 7 hours (with 5.0Ah battery in spotlight mode)",
    ],
  },
];

export const MAKITA_SIDCHROME_POWER_SYSTEM: PrizeSpecItem[] = [
  {
    name: "Makita BL1850B - 4x 18V Li-Ion Battery 5.0Ah",
    model: "BL1850B",
    description:
      "Fuel gauge indicator, displays charge remaining on battery in four stages. Built in memory chip communicates the usage history with the charger. Built in shock absorbers protect the cells from jobsite conditions. High energy cells pack more power per cell to reduce number of cells and overall weight. Large release button for easy removal from the tool. Built in air vents and wall cools the battery cells evenly whilst blocking damaging debris. 16 contact terminals provide consistent power and firm hold in any environment.",
    specifications: [
      "Capacity: 5.0Ah",
      "Voltage: 18V",
      "Quantity: 4 batteries",
      "Fuel gauge indicator (4 stages)",
      "Built in memory chip",
      "Shock absorbers",
      "High energy cells",
      "Large release button",
      "Built in air vents for cooling",
      "16 contact terminals",
    ],
  },
  {
    name: "Makita DC18RD - Same Time Dual Port Rapid Charger",
    model: "DC18RD",
    description:
      "Fast charging - charges 2 x 3.0Ah Lithium-Ion batteries at the same time in only 22 minutes. Built-in CPU - gathers information from the battery's memory chip to determine optimum charging method. Forced air cooling fan - cools the battery to minimise charging time. LED charging display. Full charge sound alert.",
    specifications: [
      "Charging Type: Dual Port Rapid",
      "Charging Time: 22 minutes (for 2 x 3.0Ah batteries)",
      "Built-in CPU for optimum charging",
      "Forced air cooling fan",
      "LED charging display",
      "Full charge sound alert",
    ],
  },
];

export const MAKITA_SIDCHROME_STORAGE: PrizeSpecItem[] = [
  {
    name: "Makita 2x 199936-9 - LXT Tool Carry Bag - 600mm",
    model: "199936-9",
    description:
      "Wide deep main pocket provides quick tool location and easy access. Adjustable heavy-duty shoulder belt makes lifting more comfortable. Metal hooks at the ends to unfasten the belt when not needed. 2 internal pocket + holster. 6 external pockets for quick access.",
    specifications: [
      "Bag Size: 600mm",
      "Quantity: 2 bags",
      "Main pocket design",
      "Adjustable heavy-duty shoulder belt",
      "Metal hooks for belt",
      "2 internal pockets + holster",
      "6 external pockets",
    ],
  },
  SIDCHROME_SCMT11402_TOOL_KIT,
];

export const RYOBI_POWER_TOOLS: PrizeSpecItem[] = [
  {
    name: "RYOBI 18V ONE+ 12 Piece 4Ah Kit",
    model: "R18X12C142B",
    description:
      "The RYOBI 18V ONE+ 12-Piece 4Ah Kit includes essential tools for DIY, home maintenance and repair: Drill Driver, Impact Driver, 115mm Angle Grinder, 150mm Circular Saw, Reciprocating Saw, Detail Sander, Multi Tool, Hand Vacuum, Workshop Blower, High Pressure Inflator, LED Flashlight, Bluetooth Radio, plus 2x 4Ah Batteries and 2A Charger.",
    specifications: [
      "12 tools in one kit",
      "2x 18V ONE+ 4Ah Lithium batteries",
      "18V ONE+ 2A Charger",
      "2x Tool Bags",
      "24 clutch settings on drill for precise torque control",
      "2-speed gearbox for fast drilling or slow driving",
      "45mm deep cuts at 0° with circular saw",
      "Compatible with 200+ ONE+ products",
    ],
  },
  {
    name: "RYOBI 18V ONE+ Line Trimmer & Blower 2.0Ah Kit",
    model: "R18XBLT12",
    description:
      "Combine line trimming and blower capabilities with one battery system. Ideal for garden maintenance and quick cleanup.",
    specifications: ["18V ONE+ platform", "2.0Ah battery included", "Dual-purpose kit"],
  },
  {
    name: "RYOBI 18V ONE+ HP Brushless 254mm Sliding Mitre Saw",
    model: "R18MS254X",
    description:
      "Crosscut timber with precision using the brushless HP mitre saw. 4,100rpm max, bevel and mitre cuts 0–47° left/right, LED cut line guide. Cuts up to 45mm x 310mm at 0°.",
    specifications: [
      "Blade: 254mm",
      "No Load Speed: 4,100 rpm",
      "Mitre: 0–47° both sides",
      "Bevel: 0–45°",
      "Rail locking for transport",
    ],
  },
  {
    name: "RYOBI 18V ONE+ Jigsaw",
    model: "R18JS-0",
    description:
      "Cordless jigsaw with 3,000 SPM and 25mm stroke. Cuts wood, aluminium and plastic with adjustable bevel 0–45°.",
    specifications: [
      "Stroke: 25mm",
      "Speed: 1,100–3,000 SPM",
      "Max cutting capacity: 101mm wood, 6.35mm steel",
      "Tool-less blade clamp",
    ],
  },
  {
    name: "RYOBI 18V ONE+ Compact Fan",
    model: "RCF18",
    description:
      "Portable fan for camping and outdoor use. Integrated clamp for surfaces up to 38mm. Up to 12.5hrs on 4Ah battery.",
    specifications: [
      "2 speed settings",
      "290° horizontal, 300° vertical rotation",
      "Clamp capacity: 38mm",
    ],
  },
  {
    name: "RYOBI 18V ONE+ HP Brushless 55cm Hedge Trimmer",
    model: "R18XHTR10",
    description:
      "Dual-action diamond-ground blades, 24mm cutting capacity, HEDGE SWEEP function, Anti-Jam technology.",
    specifications: [
      "Bar length: 55cm",
      "Blade speed: 3,100 SPM",
      "24mm cut capacity",
      "Up to 400m² on 2Ah battery",
    ],
  },
  {
    name: "RYOBI 36V Brushless 46cm Lawn Mower 4Ah Kit",
    model: "RLM36X46BL",
    description:
      "46cm EasyEdge deck, load-sensing blade speed, 20–70mm cutting height, 45L grass catcher. Up to 50 minutes runtime on 4Ah battery.",
    specifications: [
      "Cutting path: 46cm",
      "Brushless motor",
      "5 height settings",
      "36V 4Ah battery and 1.7A charger included",
    ],
  },
];

export const RYOBI_POWER_SYSTEM: PrizeSpecItem[] = [
  {
    name: "RYOBI 18V ONE+ HP 5Ah Battery Twin Pack",
    model: "RB185050X",
    description:
      "Two high-performance 5Ah batteries for extended runtime. Up to 2.5x runtime vs 2Ah. IntelliCell technology, temperature control, fuel gauge.",
    specifications: ["Capacity: 5Ah each", "Peak output: 1,625W", "Compatible with 200+ ONE+ tools"],
  },
  {
    name: "RYOBI 18V ONE+ 4Ah Batteries (from 12 Piece Kit)",
    description: "2x 4Ah batteries included with 12 Piece Kit. IntelliCell monitoring for balanced charging.",
    specifications: ["Capacity: 4Ah each", "18V ONE+ platform"],
  },
  {
    name: "RYOBI 18V ONE+ 2A Charger",
    description: "Charges any ONE+ 18V battery. LED display for charge status.",
    specifications: ["2A output", "Works with all 18V ONE+ batteries"],
  },
];

// HiKOKI 15pc kit = 13pc MultiVolt Mega Combo (KC36D13P) + 2pc Brushless Nailer combo (HIKNMASTER2).
export const HIKOKI_POWER_TOOLS: PrizeSpecItem[] = [
  {
    name: "HiKOKI 36V Brushless Driver Drill",
    model: "DV36DC(H4Z)",
    description:
      "36V MultiVolt brushless driver drill with Reactive Force Control (RFC) that stops the motor on detected kickback, plus LED warning signals and an 11-position side handle.",
    specifications: [
      "Voltage: 36V (MultiVolt)",
      "Chuck: 1.5–13mm",
      "Clutch: 22 stages (1.5–8.0 Nm)",
      "Max torque: 155 Nm (hard) / 100 Nm (soft)",
      "No-load speed: 0–550 / 0–2,200 rpm",
      "Capacity: 20mm steel, 118mm wood hole saw",
      "Weight: 2.1 kg",
    ],
  },
  {
    name: "HiKOKI 36V Brushless 1/4\" Impact Driver",
    model: "WH36DC(H4Z)",
    description:
      "Compact 36V brushless impact driver with a triple-hammer mechanism (three impacts per rotation), 5 drive modes and IP56 dust & water resistance.",
    specifications: [
      "Voltage: 36V (MultiVolt)",
      "Drive: 6.35mm (1/4\")",
      "Modes: 5 (Max, Bolt, Bolt Single, Soft, Self-Drilling)",
      "Max torque: 215 Nm",
      "No-load speed: 0–3,400 rpm",
      "IP56 dust & water resistant",
      "Weight: 1.6 kg",
    ],
  },
  {
    name: "HiKOKI 36V Brushless 1/2\" Impact Wrench",
    model: "WR36DE(H4Z)",
    description:
      "Compact (169mm) 36V MultiVolt brushless 1/2\" impact wrench with a 4-mode tightening selector, auto-stop to prevent over-tightening and IP56 protection.",
    specifications: [
      "Voltage: 36V (MultiVolt)",
      "Drive: 12.7mm (1/2\") square",
      "Tightening torque: 770 Nm",
      "Nut-busting torque: 1,050 Nm",
      "No-load speed: up to 0–2,400 rpm (4 modes)",
      "IP56 dust & water resistant",
      "Weight: 2.6 kg",
    ],
    includes: ["1 x Belt Hook"],
  },
  {
    name: "HiKOKI 36V Brushless Reciprocating Saw",
    model: "CR36DA(H4Z)",
    description:
      "36V MultiVolt brushless reciprocating saw with 4-step speed selection, orbital & swing cutting and a twin-rotation counterweight system for low vibration.",
    specifications: [
      "Voltage: 36V (MultiVolt)",
      "Stroke: 32mm",
      "No-load speed: 0–3,000 spm (4 steps)",
      "Max capacity: 300mm wood, 130mm steel pipe",
      "Large pivot hook + bright LED",
      "Weight: 4.0 kg",
    ],
  },
  {
    name: "HiKOKI 36V Brushless 185mm (7\") Circular Saw",
    model: "C3607DB(H4Z)",
    description:
      "Compact 36V brushless circular saw with a robust aluminium die-cast base, rafter hook, soft start and an efficient dust blower for a clear cut line.",
    specifications: [
      "Voltage: 36V (MultiVolt)",
      "Blade: 185mm",
      "Max depth of cut: 62mm @ 90°, 47.5mm @ 45°",
      "Bevel: -5° to 45°",
      "No-load speed: 6,000 rpm",
      "Weight: 3.7 kg",
    ],
  },
  {
    name: "HiKOKI 18V Cordless Grease Gun",
    model: "AL18DA(H4Z)",
    description:
      "18V cordless grease gun with a top-class 297ml/min flow rate and 69 MPa max pressure, 10-level adjustable flow, 3-way grease filling and a detachable LED light.",
    specifications: [
      "Voltage: 18V",
      "Grease capacity: 450g",
      "Max pressure: 69 MPa",
      "Flow rate: up to 297 ml/min",
      "10 levels of adjustable grease volume",
      "Hose length: 1,200mm",
      "Weight: 4.3 kg",
    ],
  },
  {
    name: "HiKOKI 18V Cordless Digital Radio with Bluetooth",
    model: "UR18DA(H4Z)",
    description:
      "Compact 18V jobsite radio with Bluetooth streaming, DAB+/FM/AM tuning, an equaliser and a backlit LCD. Includes an AC adapter cord for continuous power.",
    specifications: [
      "Voltage: 18V (or AC via adapter)",
      "Tuner: DAB+, FM, AM",
      "Bluetooth: Yes",
      "Equaliser + backlit LCD",
      "Max output: 7W",
      "Weight: 1.8 kg",
    ],
  },
  {
    name: "HiKOKI 36V Brushless SDS Plus Rotary Hammer",
    model: "DH3628DA(H4Z)",
    description:
      "36V MultiVolt brushless SDS-Plus rotary hammer delivering 3.2 J impact energy, with User Vibration Protection (UVP) and RFC anti-jerk control.",
    specifications: [
      "Voltage: 36V (MultiVolt)",
      "Impact energy: 3.2 J",
      "Drilling capacity: 28mm concrete, 13mm steel, 32mm wood",
      "Impact rate: 0–4,300 bpm",
      "No-load speed: 0–950 rpm",
      "3 modes: hammer / drill / hammer-drill",
      "Weight: 3.9 kg",
    ],
  },
  {
    name: "HiKOKI 36V Brushless 125mm (5\") Angle Grinder",
    model: "G3613DVF(H4Z)",
    description:
      "36V MultiVolt brushless 125mm paddle-switch angle grinder with a high-power 1500W-equivalent output, 6-setting speed dial, electric brake and kickback protection.",
    specifications: [
      "Voltage: 36V (MultiVolt)",
      "Wheel: 125mm (22.23mm bore)",
      "Switch: Paddle",
      "Variable speed: 6 settings (3,200–10,000 rpm)",
      "Brake, kickback, soft-start & overload protection",
      "Weight: 3.1 kg",
    ],
  },
  {
    name: "HiKOKI 18V Brushless Multi Tool",
    model: "CV18DA(H4Z)",
    description:
      "18V brushless oscillating multi-tool with tool-less accessory change, a low-vibration handle and Starlock blade compatibility for flush/plunge cuts across materials.",
    specifications: [
      "Voltage: 18V",
      "Vibration angle: 3.6° (total)",
      "No-load frequency: 6,000–20,000 opm",
      "Tool-less accessory change",
      "Starlock blade compatible",
      "Weight: 1.9 kg",
    ],
    includes: ["1 x Blade (MSD32PBC)"],
  },
  {
    name: "HiKOKI 36V Brushless Jigsaw (Top Handle)",
    model: "CJ36DA(H2Z)",
    description:
      "36V MultiVolt brushless top-handle jigsaw with tool-less blade change, 4-stage orbital action, Auto Mode and constant speed control for clean, fast cuts.",
    specifications: [
      "Voltage: 36V (MultiVolt)",
      "Stroke: 26mm",
      "No-load speed: 800–3,500 spm (Auto: 1,400–3,500)",
      "Max cut: 160mm wood, 10mm mild steel",
      "Weight: 2.7 kg",
    ],
    includes: ["1 x Jigsaw blade (wood)", "1 x 4mm Hex bar wrench", "1 x Chip cover"],
  },
  {
    name: "HiKOKI 36V Brushless 3/4\" High Torque Impact Wrench",
    model: "WR36DF(H4Z)",
    description:
      "36V MultiVolt brushless 3/4\" high-torque impact wrench delivering 2,400 Nm of nut-busting torque, with a 4-mode selector, auto-stop, auto-slow and IP56 protection.",
    specifications: [
      "Voltage: 36V (MultiVolt)",
      "Drive: 19mm (3/4\") square with friction ring",
      "Tightening torque: 1,900 Nm",
      "Nut-busting torque: 2,400 Nm",
      "No-load speed: 0–1,500 rpm",
      "IP56 dust & water resistant",
      "Weight: 3.9 kg",
    ],
  },
  {
    name: "HiKOKI 18V Cordless Blower & Vacuum",
    model: "RB18DC(H4Z)",
    description:
      "Lightweight 18V blower that doubles as a vacuum with the supplied dust bag. Variable-speed trigger and 3-mode air volume control for confined-space cleanup.",
    specifications: [
      "Voltage: 18V",
      "Air volume: 3.5 m³/min (124 CFM)",
      "Max air velocity: 95 m/s (213 mph)",
      "Blower + vacuum functions",
      "Weight: 1.8 kg",
    ],
  },
  {
    name: "HiKOKI 18V Brushless Gasless 90mm Framing Nailer",
    model: "NR1890DCA(H4Z)",
    description:
      "18V brushless gasless framing nailer using HiKOKI's Air Spring Drive system (no gas cartridges), driving 50–90mm framing nails with tool-less depth adjustment and dry-fire lockout.",
    specifications: [
      "Voltage: 18V",
      "Drive system: Air Spring (gasless)",
      "Nail length: 50–90mm (2.9–3.3mm shaft)",
      "Nail angle: 30°–34°",
      "Driving speed: up to 2.7 nails/sec",
      "Magazine: 50 D-head nails",
      "Weight: 3.78 kg",
    ],
    includes: ["1 x Configurable belt/rafter hook", "1 x Torx key", "1 x Standard magazine", "1 x Safety glasses"],
  },
  {
    name: "HiKOKI 18V Brushless Gasless 15G Finishing Nailer",
    model: "NT1865DAA(H4Z)",
    description:
      "18V brushless gasless 15-gauge finishing nailer with the Air Spring Drive system, a slimline nose for precise placement, low noise/recoil and dry-fire lockout.",
    specifications: [
      "Voltage: 18V",
      "Drive system: Air Spring (gasless)",
      "Nail length: 32–64mm (15-gauge)",
      "Nail angle: 34°",
      "Cycle rate: 3 nails/sec (intermittent)",
      "Magazine: 100 nails",
      "Weight: 2.66 kg",
    ],
    includes: ["1 x Belt hook", "1 x Safety glasses", "3 x No-mar tips"],
  },
];

export const HIKOKI_POWER_SYSTEM: PrizeSpecItem[] = [
  {
    name: "HiKOKI MultiVolt Batteries — 5 x BSL36A18X",
    model: "BSL36A18X",
    description:
      "Five dual-voltage MultiVolt slide batteries (3 from the Mega Combo + 2 from the nailer kit) that auto-switch between 18V 5.0Ah and 36V 2.5Ah, with a Multiplex Protection Circuit and no memory effect.",
    specifications: [
      "Voltage: 18V / 36V (auto-switching)",
      "Capacity: 5.0Ah (18V) / 2.5Ah (36V)",
      "Power output: 1,080W",
      "Multiplex Protection Circuit (MPC)",
      "~1,500 recharge cycles, ~32 min charge",
      "Weight: 0.7 kg each",
    ],
  },
  {
    name: "HiKOKI Rapid Battery Chargers — 2 x UC18YSL3",
    model: "UC18YSL3(H0Z)",
    description:
      "Two 14.4V–18V rapid chargers (one per kit) with an active cooling fan, 3-way overcharge protection and a USB port for charging mobile devices. Charges a 5.0Ah pack in ~32 minutes.",
    specifications: [
      "Voltage: 14.4V – 18V slide batteries",
      "5.0Ah charge time: ~32 min",
      "Battery cooling fan",
      "USB charging port",
    ],
  },
  {
    name: "HiKOKI Large Site Bag",
    model: "402094",
    description: "Heavy-duty nylon HiKOKI site bag (from the Mega Combo) with four internal pockets for transporting the kit.",
    specifications: ["Material: Nylon", "4 internal pockets"],
  },
];

// ============================================================================
// Spec-item product photos
// Single source of truth mapping each spec item (by its exact `name`) to its
// product photo. Matched by visually scanning each brand's prize photo set, so
// the photo genuinely depicts that tool. Items not listed render without a photo
// (graceful — the spec card falls back to the brand icon). Applied to the shared
// spec arrays at module load, so every prize combo that reuses an array inherits
// the images. To re-point a photo, edit one entry here.
// ============================================================================
const SPEC_ITEM_IMAGE_BY_NAME: Record<string, string> = {
  // Milwaukee — /images/majordraws/milwaukee-set/
  "MILWAUKEE 18V FUEL™ 13mm Hammer Drill/Driver": "/images/majordraws/milwaukee-set/milwaukee-18v-fuel-13mm-hammer-drill-driver.webp",
  "MILWAUKEE 18V FUEL™ 1/4inch Hex Impact Driver": "/images/majordraws/milwaukee-set/milwaukee-18v-fuel-1-4inch-hex-impact-driver.webp",
  "MILWAUKEE 18V FUEL™ Brushless 125mm Angle Grinder": "/images/majordraws/milwaukee-set/milwaukee-18v-fuel-brushless-125mm-angle-grinder.webp",
  "MILWAUKEE 18V Barrel FUEL™ Jigsaw": "/images/majordraws/milwaukee-set/milwaukee-18v-barrel-fuel-jigsaw.webp",
  "MILWAUKEE 18V FUEL™ HACKZALL™ Reciprocating Saw": "/images/majordraws/milwaukee-set/milwaukee-18v-fuel-hackzall-reciprocating-saw.webp",
  "MILWAUKEE 18V FUEL™ 184mm Circular Saw": "/images/majordraws/milwaukee-set/milwaukee-18v-fuel-184mm-circular-saw.webp",
  "MILWAUKEE 18V FUEL™ Brushless Oscillating Multi-Tool": "/images/majordraws/milwaukee-set/milwaukee-18v-fuel-brushless-oscillating-multi-tool.webp",
  "MILWAUKEE 18V Bluetooth/USB-C Jobsite Speaker": "/images/majordraws/milwaukee-set/milwaukee-18v-bluetooth-usb-c-jobsite-speaker.webp",
  "MILWAUKEE 18V Compact Battery Light w/ USB Charging": "/images/majordraws/milwaukee-set/milwaukee-18v-compact-battery-light-w-usb-charging.webp",
  "MILWAUKEE 18V Compact Blower": "/images/majordraws/milwaukee-set/milwaukee-18v-compact-blower.webp",
  "MILWAUKEE 18V FUEL™ 1/2inch Mid-Torque Impact Wrench": "/images/majordraws/milwaukee-set/milwaukee-18v-fuel-1-2inch-mid-torque-impact-wrench.webp",
  "MILWAUKEE 18V 125mm Random Orbital Sander": "/images/majordraws/milwaukee-set/milwaukee-18v-125mm-random-orbital-sander.webp",
  "MILWAUKEE 18V FUEL™ 8inch (203Mm) Hatchet Pruning Saw": "/images/majordraws/milwaukee-set/milwaukee-18v-fuel-8inch-203mm-hatchet-pruning-saw.webp",
  "MILWAUKEE 18V RedLithium™ 5.0Ah Battery Kit": "/images/majordraws/milwaukee-set/milwaukee-18v-redlithium-5-0ah-battery-kit.webp",

  // DeWalt — /images/majordraws/dewalt-set/
  "DeWalt DCD1007N-XJ 18V XR 3 Speed Premium Brushless Hammer Drill Driver": "/images/majordraws/dewalt-set/dewalt-dcd1007n-xj-18v-xr-3-speed-premium-brushless-hammer-drill-driver.webp",
  "DeWalt DCF860N-XJ 18V XR Li-ion Brushless 3 Speed Premium Impact Driver": "/images/majordraws/dewalt-set/dewalt-dcf860n-xj-18v-xr-li-ion-brushless-3-speed-premium-impact-driver.webp",
  'DeWalt DCF892N-XJ 18V XR Cordless Brushless 1/2" Detent Pin Impact Wrench': "/images/majordraws/dewalt-set/dewalt-dcf892n-xj-18v-xr-cordless-brushless-1-2-detent-pin-impact-wrench.webp",
  "DeWalt DCP580N-XE 18V XR Brushless Planer": "/images/majordraws/dewalt-set/dewalt-dcp580n-xe-18v-xr-brushless-planer.webp",
  "DeWalt DCS334N-XJ 18V XR Brushless Top Handle Jigsaw": "/images/majordraws/dewalt-set/dewalt-dcs334n-xj-18v-xr-brushless-top-handle-jigsaw.webp",
  "DeWalt DCS356N-XJ 18V XR Brushless Multi Tool with Speed Selector": "/images/majordraws/dewalt-set/dewalt-dcs356n-xj-18v-xr-brushless-multi-tool-with-speed-selector.webp",
  "DeWalt DCS578N-XE 54V FlexVolt XR Brushless 184mm Circular Saw": "/images/majordraws/dewalt-set/dewalt-dcs578n-xe-54v-flexvolt-xr-brushless-184mm-circular-saw.webp",
  "DeWalt DCG418N-XJ 54V FlexVolt XR Brushless 125mm Angle Grinder": "/images/majordraws/dewalt-set/dewalt-dcg418n-xj-54v-flexvolt-xr-brushless-125mm-angle-grinder.webp",
  "DeWalt DCH333NT-XJ 54V FlexVolt XR Brushless 3-Mode SDS Plus Rotary Hammer": "/images/majordraws/dewalt-set/dewalt-dch333nt-xj-54v-flexvolt-xr-brushless-3-mode-sds-plus-rotary-hammer.webp",
  "DeWalt DCS389N-XJ 54V FlexVolt XR Brushless Reciprocating Saw": "/images/majordraws/dewalt-set/dewalt-dcs389n-xj-54v-flexvolt-xr-brushless-reciprocating-saw.webp",
  "DeWalt DWST1-81080-XE 18V-54V XR TSTAK Bluetooth Charger DAB Jobsite Radio": "/images/majordraws/dewalt-set/dewalt-dwst1-81080-xe-18v-54v-xr-tstak-bluetooth-charger-dab-jobsite-radio.webp",
  "DeWalt DCV100-XE 18V XR Compact Jobsite Blower": "/images/majordraws/dewalt-set/dewalt-dcv100-xe-18v-xr-compact-jobsite-blower.webp",
  "DeWalt DCV501LN-XJ 18V XR L-Class Hand-Held Stick Vacuum": "/images/majordraws/dewalt-set/dewalt-dcv501ln-xj-18v-xr-l-class-hand-held-stick-vacuum.webp",
  "DeWalt DCW210N-XJ 18V XR Brushless 125mm Random Orbital Sander": "/images/majordraws/dewalt-set/dewalt-dcw210n-xj-18v-xr-brushless-125mm-random-orbital-sander.webp",
  "DeWalt DCB547-XJ XR FlexVolt 9.0Ah Battery (x2)": "/images/majordraws/dewalt-set/dewalt-dcb184-xj-xr-5-0ah-slide-battery-x2.webp",
  "DeWalt DCB184-XJ XR 5.0Ah Slide Battery (x2)": "/images/majordraws/dewalt-set/dewalt-dcb184-xj-xr-5-0ah-slide-battery-x2.webp",
  "DeWalt DCB132-XE Dual Port FlexVolt Charger": "/images/majordraws/dewalt-set/dewalt-dcb132-xe-dual-port-flexvolt-charger.webp",

  // Makita — /images/majordraws/makita-set/
  "Makita DHP486Z - 18V Brushless Heavy Duty Hammer Driver Drill": "/images/majordraws/makita-set/makita-dhp486z-18v-brushless-heavy-duty-hammer-driver-drill.webp",
  "Makita DTD173Z - 18V Brushless 4-Stage Impact Driver": "/images/majordraws/makita-set/makita-dtd173z-18v-brushless-4-stage-impact-driver.webp",
  "Makita DGA508Z - 18V Mobile Brushless 125mm Paddle Switch Angle Grinder": "/images/majordraws/makita-set/makita-dga508z-18v-mobile-brushless-125mm-paddle-switch-angle-grinder.webp",
  "Makita DHR242Z - 18V Mobile Brushless 24mm SDS Plus Rotary Hammer": "/images/majordraws/makita-set/makita-dhr242z-18v-mobile-brushless-24mm-sds-plus-rotary-hammer.webp",
  "Makita DHS680Z - 18V Mobile Brushless 165mm Circular Saw": "/images/majordraws/makita-set/makita-dhs680z-18v-mobile-brushless-165mm-circular-saw.webp",
  "Makita DJR187Z - 18V Mobile Brushless Recipro Saw": "/images/majordraws/makita-set/makita-djr187z-18v-mobile-brushless-recipro-saw.webp",
  "Makita DTM52ZX3 - 18V Brushless Multi-Tool": "/images/majordraws/makita-set/makita-dtm52zx3-18v-brushless-multi-tool.webp",
  'Makita DTW700Z - 18V Brushless 1/2" Impact Wrench': "/images/majordraws/makita-set/makita-dtw700z-18v-brushless-1-2-impact-wrench.webp",
  "Makita DBO180Z - 18V Mobile Random Orbital Sander": "/images/majordraws/makita-set/makita-dbo180z-18v-mobile-random-orbital-sander.webp",
  "Makita DJV184Z - 18V Brushless Jigsaw": "/images/majordraws/makita-set/makita-djv184z-18v-brushless-jigsaw.webp",
  "Makita DKP181Z - 18V Brushless AWS* 82mm Planer": "/images/majordraws/makita-set/makita-dkp181z-18v-brushless-aws-82mm-planer.webp",
  "Makita DUB185Z - 18V Blower": "/images/majordraws/makita-set/makita-dub185z-18v-blower.webp",
  "Makita DML812 - 18V LED Long Distance Flashlight": "/images/majordraws/makita-set/makita-dml812-18v-led-long-distance-flashlight.webp",

  // Ryobi — /images/majordraws/ryobi-set/
  "RYOBI 18V ONE+ 12 Piece 4Ah Kit": "/images/majordraws/ryobi-set/ryobi-18v-one-12-piece-4ah-kit.webp",
  "RYOBI 18V ONE+ Line Trimmer & Blower 2.0Ah Kit": "/images/majordraws/ryobi-set/ryobi-18v-one-line-trimmer-and-blower-2-0ah-kit.webp",
  "RYOBI 18V ONE+ HP Brushless 254mm Sliding Mitre Saw": "/images/majordraws/ryobi-set/ryobi-18v-one-hp-brushless-254mm-sliding-mitre-saw.webp",
  "RYOBI 18V ONE+ Jigsaw": "/images/majordraws/ryobi-set/ryobi-18v-one-jigsaw.webp",
  "RYOBI 18V ONE+ Compact Fan": "/images/majordraws/ryobi-set/ryobi-18v-one-compact-fan.webp",
  "RYOBI 18V ONE+ HP Brushless 55cm Hedge Trimmer": "/images/majordraws/ryobi-set/ryobi-18v-one-hp-brushless-55cm-hedge-trimmer.webp",
  "RYOBI 36V Brushless 46cm Lawn Mower 4Ah Kit": "/images/majordraws/ryobi-set/ryobi-36v-brushless-46cm-lawn-mower-4ah-kit.webp",
  "RYOBI 18V ONE+ 2A Charger": "/images/majordraws/ryobi-set/ryobi-18v-one-2a-charger.webp",


  // HiKOKI — /images/majordraws/hikoki-set/ (gallery photos matched by tool)
  "HiKOKI 36V Brushless Driver Drill": "/images/majordraws/hikoki-set/hikoki-gallery-04.webp",
  'HiKOKI 36V Brushless 1/4" Impact Driver': "/images/majordraws/hikoki-set/hikoki-gallery-02.webp",
  'HiKOKI 36V Brushless 1/2" Impact Wrench': "/images/majordraws/hikoki-set/hikoki-gallery-05.webp",
  "HiKOKI 36V Brushless Reciprocating Saw": "/images/majordraws/hikoki-set/hikoki-gallery-14.webp",
  'HiKOKI 36V Brushless 185mm (7") Circular Saw': "/images/majordraws/hikoki-set/hikoki-gallery-07.webp",
  "HiKOKI 18V Cordless Grease Gun": "/images/majordraws/hikoki-set/hikoki-gallery-11.webp",
  "HiKOKI 18V Cordless Digital Radio with Bluetooth": "/images/majordraws/hikoki-set/hikoki-gallery-15.webp",
  "HiKOKI 36V Brushless SDS Plus Rotary Hammer": "/images/majordraws/hikoki-set/hikoki-gallery-01.webp",
  'HiKOKI 36V Brushless 125mm (5") Angle Grinder': "/images/majordraws/hikoki-set/hikoki-gallery-16.webp",
  "HiKOKI 18V Brushless Multi Tool": "/images/majordraws/hikoki-set/hikoki-gallery-06.webp",
  "HiKOKI 36V Brushless Jigsaw (Top Handle)": "/images/majordraws/hikoki-set/hikoki-gallery-08.webp",
  'HiKOKI 36V Brushless 3/4" High Torque Impact Wrench': "/images/majordraws/hikoki-set/hikoki-gallery-09.webp",
  "HiKOKI 18V Cordless Blower & Vacuum": "/images/majordraws/hikoki-set/hikoki-gallery-10.webp",
  "HiKOKI 18V Brushless Gasless 90mm Framing Nailer": "/images/majordraws/hikoki-set/hikoki-gallery-12.webp",
  "HiKOKI 18V Brushless Gasless 15G Finishing Nailer": "/images/majordraws/hikoki-set/hikoki-gallery-13.webp",
  "HiKOKI Multi Cruiser 3-Piece Stackable Tool Box Set": "/images/majordraws/hikoki-set/hikoki-gallery-17.webp",
  // Storage systems — only Makita MAKTRAK and Ryobi LINK ship a composite system photo;
  // attached to the primary (rolling-base) piece so the storage section leads with the
  // full-system shot. Milwaukee PACKOUT and DeWalt ToughSystem have no storage photo on disk.
  "MAKITA MAKTRAK™ Rolling Tool Chest Storage": "/images/majordraws/makita-set/makita-maktrak.webp",
  "RYOBI LINK™ 3 Piece Rolling Storage Set": "/images/majordraws/ryobi-set/ryobi-link.webp",
};

/** Attach the mapped product photo (if any) to each spec item, in place. */
function applySpecItemImages(items: PrizeSpecItem[]): void {
  for (const item of items) {
    const src = SPEC_ITEM_IMAGE_BY_NAME[item.name];
    if (src && !item.image) {
      item.image = { src, alt: item.name };
    }
  }
}

[
  MILWAUKEE_POWER_TOOLS,
  MILWAUKEE_POWER_SYSTEM,
  DEWALT_SIDCHROME_POWER_TOOLS,
  DEWALT_SIDCHROME_POWER_SYSTEM,
  MAKITA_SIDCHROME_POWER_TOOLS,
  RYOBI_POWER_TOOLS,
  RYOBI_POWER_SYSTEM,
  HIKOKI_POWER_TOOLS,
  HIKOKI_POWER_SYSTEM,
].forEach(applySpecItemImages);

// ============================================================================
// MODULAR STORAGE SYSTEMS
// ============================================================================

// NOTE (2026-06-02): Prize copy labels this as an 8-piece PACKOUT system, but only 6 pieces
// are detailed below — details for the remaining 2 pieces are pending and will be added later.
export const MILWAUKEE_PACKOUT_STORAGE: PrizeSpecItem[] = [
  {
    name: "MILWAUKEE PACKOUT™ 500MM Tool Bag",
    model: "48228322",
    description:
      "Durable 500mm tool bag with impact-resistant molded base and 1680D ballistic material construction. Features open storage, two exterior pockets, and cushioned shoulder strap for comfortable transport.",
    specifications: [
      "Tear-resistant 1680D ballistic material with all-metal hardware",
      "Impact resistant polymer base connects to all PACKOUT™ components",
      "2 exterior pockets for quick access to tools and accessories",
      "Spacious storage compartment with 6 interior pockets",
      "Included shoulder strap, top handles and side handles",
      "Daisy chains for additional storage options",
    ],
  },
  {
    name: "MILWAUKEE PACKOUT™ Organiser",
    model: "48228430",
    description:
      "Secure organiser with removable bins that mount to jobsite materials. IP65 rated seal protects contents from water and debris, with No-Travel Bin seals preventing small item migration.",
    specifications: [
      "IP65 rated seal protects against water and jobsite debris",
      "No-Travel Bin seals prevent contents shifting between bins",
      "Removable bins mount to jobsite material with screws or nails",
      "Impact resistant polymer construction",
      "Connects to all Milwaukee PACKOUT™ modular storage",
    ],
  },
  {
    name: "MILWAUKEE PACKOUT™ Low Profile Organiser",
    model: "48228431",
    description:
      "Compact low-profile organiser with 5 removable storage bins and dividers. Transparent lid with IP65 weather seal keeps small parts organized and protected during transport.",
    specifications: [
      "Slim design ideal for organization of small items",
      "IP65 rated weather seal protects tools and small parts",
      "Includes 8 small and 2 large removable bins with dividers",
      "No-Travel Bins seal prevents small part migration",
      "Integrated center slot for long bits and blades",
      "Clear top for easy identification of contents",
      "Heavy duty latches and reinforced hinges",
    ],
  },
  {
    name: "MILWAUKEE PACKOUT™ Tool Box",
    model: "48228424",
    description:
      "Mid-size tool box with internal organisation tray for hand tools and accessories. Features impact resistant polymer construction with IP65 rated seals and metal reinforced corners.",
    specifications: [
      "34kg weight capacity for heavy-duty use",
      "Impact resistant polymer construction",
      "IP65 rated seal prevents water and debris damage",
      "Internal organisation trays for small parts and accessories",
      "Metal reinforced corners for durability",
      "Connects to all PACKOUT™ modular storage",
    ],
  },
  {
    name: "MILWAUKEE PACKOUT™ Large Tool Box",
    model: "48228425",
    description:
      "Large capacity tool box with 45kg weight capacity and metal top handle. Internal organisation tray keeps hand tools accessible while the IP65 seal protects against harsh jobsite conditions.",
    specifications: [
      "45kg weight capacity for maximum storage",
      "Metal top handle more durable than competitive units",
      "IP65 rated seal protects against water and debris",
      "Internal organisation tray for hand tools and accessories",
      "Impact resistant polymer construction",
      "Connects to all Milwaukee PACKOUT™ modular storage",
    ],
  },
  {
    name: "MILWAUKEE PACKOUT™ Low Profile Rolling Tool Box",
    model: "48228427",
    description:
      "Heavy-duty rolling tool box with 113kg weight capacity and 9-inch all-terrain wheels. Features fully collapsible 50cm handle, IP65 weather seal, and interior organiser tray for maximum versatility.",
    specifications: [
      "113kg (250lbs) weight capacity for tools and materials",
      "9-inch all-terrain wheels for any jobsite surface",
      "Fully collapsible 50cm handle fits under truck bed covers",
      "IP65 rated protection against water and debris",
      "Interior organisation tray for equipment storage",
      "Metal reinforced corners and locking points",
      "Impact resistant body with reinforced hinges",
      "Modular connectivity with all PACKOUT™ components",
    ],
  },
];

export const DEWALT_TOUGHSYSTEM_STORAGE: PrizeSpecItem[] = [
  {
    name: "DEWALT TOUGHSYSTEM® 2.0 DS165 Shallow Box",
    model: "DWST83293-1",
    description:
      "Shallow storage box with detachable handle for convenient storage and use in pick-up trucks. Features IP65 dust and water jet resistance with easy-close metal wire front latches.",
    specifications: [
      "Detachable handle for more convenient storage",
      "IP65 dust tight and water jet resistant seal",
      "Easy-close metal wire front latches for one-handed operation",
      "Metal reinforced padlock eye for superior security",
      "Fully backwards compatible with TOUGHSYSTEM® 1 modules",
      "DEWALT® Tracker ready with built-in fixing point",
    ],
  },
  {
    name: "DEWALT TOUGHSYSTEM® 2.0 DS300 Mid Box",
    model: "DWST83294-1",
    description:
      "Mid-size storage box offering balanced capacity and portability. High performance seal ensures dust tight and water jet resistant protection in severe weather conditions.",
    specifications: [
      "IP65 rated for dust and water jet resistance",
      "Easy-close metal wire latches for quick access",
      "Half module compatibility for future expansion",
      "Name panel insert for easy content identification",
      "Metal reinforced padlock eye for security",
      "Compatible with TOUGHSYSTEM® 1 modules",
    ],
  },
  {
    name: "DEWALT TOUGHSYSTEM® 2.0 DS450 Mobile Storage Box",
    model: "DWST83295-1",
    description:
      "Mobile storage solution with wheels and telescopic handle for easy transport. Combines maximum capacity with portability for demanding jobsite environments.",
    specifications: [
      "Mobile design with wheels and telescopic handle",
      "IP65 dust tight and water jet resistant",
      "High performance seal withstands severe weather",
      "Easy-close metal wire front latches",
      "DEWALT® Tracker ready for tool tracking",
      "Fully backwards compatible to TOUGHSYSTEM® 1",
    ],
  },
  {
    name: "DEWALT TOUGHSYSTEM® 2.0 Organiser",
    description:
      "Versatile organiser with removable compartments for small parts and accessories. Clear lid allows quick identification of contents while maintaining IP65 protection.",
    specifications: [
      "Removable compartments for flexible organization",
      "Clear lid for easy content identification",
      "IP65 rated seal protects small parts",
      "Compatible with TOUGHSYSTEM® modules",
      "Ideal for fasteners, bits, and accessories",
    ],
  },
  {
    name: "DEWALT TOUGHSYSTEM® Open Storage Box with Handle",
    description:
      "Spacious open tote with side handles and folding heavy-duty bar for transportation. Can transport up to 29.5kg of equipment with easy access to contents.",
    specifications: [
      "29.5kg weight capacity for heavy equipment",
      "Side grab handles for easy carrying",
      "Folding heavy-duty bar for secure transport",
      "Stacking latches for modular system compatibility",
      "Internal slots for dividers to maximize organization",
      "Compatible with TOUGHSYSTEM® carrier and modules",
    ],
  },
  {
    name: "DEWALT DWST82990-1 Soft Tote Tool Bag",
    model: "DWST82990-1",
    description:
      "Heavy-duty 1200 denier soft tote with injected plastic base for water protection. Features 30kg weight capacity with padded shoulder strap and multiple storage compartments.",
    specifications: [
      "1200 denier material for durability and tear resistance",
      "Injected plastic base provides water ingress protection",
      "30kg weight capacity with rivet reinforced construction",
      "TSTAK system compatible via side stacking latches",
      "Aluminium handle for durability and comfort",
      "Padded shoulder strap for heavy tool transportation",
      "Close zip compartment for storing valuables securely",
      "Dimensions: 35cm x 45cm x 25cm",
    ],
  },
  {
    name: "DEWALT TOUGHSYSTEM® 2.0 Adapter",
    description:
      "Cross-platform adapter enabling connectivity between TOUGHSYSTEM® 2.0, TSTAK, and TOUGHCASE® storage solutions. Integrated power tool holder stores drills via belt hook.",
    specifications: [
      "Connects TOUGHSYSTEM® 2.0 to TSTAK and TOUGHCASE® sets",
      "Integrated power tool holder for drills and accessories",
      "Slots on both sides for hanging tools via belt hook",
      "Maximum accessibility and flexibility",
      "Creates highly flexible modular storage system",
    ],
  },
];

export const MAKITA_MAKTRAK_STORAGE: PrizeSpecItem[] = [
  {
    name: "MAKITA MAKTRAK™ Rolling Tool Chest Storage",
    model: "T-90009",
    description:
      "Next generation rolling tool chest with Trak Mount Lid system and one-hand latch release. Features 113.4kg max weight capacity, Gecko Grip rubberized handle, and all-terrain rugged wheels.",
    specifications: [
      "113.4kg maximum weight capacity",
      "Horizontal design for maximum accessibility and storage",
      "Gecko Grip™ rubberized handle for easy loading/unloading",
      "All-terrain jobsite rugged wheels (229mm diameter)",
      "Dual hinged removable lid for easy access without unstacking",
      "Impact resistant copolymer resin for durability",
      "81.9L holding capacity with 387.4mm extended handle",
    ],
    includes: ["1 x 455.6mm x 233.4mm x 85.8mm Storage Tray", "1 x 254mm Molle Panel Divider"],
  },
  {
    name: "MAKITA MAKTRAK™ Extra Large Tool Box Storage",
    model: "T-90021",
    description:
      "Extra large extension tool box with dual-hinged removable lid for access from both sides. Cleat mount on either side allows easy mounting to Rolling Tool Chest for transportation.",
    specifications: [
      "45.4kg weight capacity with impact resistant copolymer",
      "Dual-hinged removable lid allows access from both sides",
      "Fits oversized tools and accessories",
      "Cleat mount for easy attachment to Rolling Tool Chest",
      "58.5L holding capacity",
      "Trak Mount Lid system with one-hand latch release",
    ],
    includes: ["1 x 462.8mm x 310.4mm x 85.8mm Storage Tray"],
  },
  {
    name: "MAKITA MAKTRAK™ Medium Tool Box Storage",
    model: "T-90037",
    description:
      "Medium tool box ideal for smaller tool storage combined with accessories. Features shallow and deep trays with multiple dividers for organizing small parts and hand tools.",
    specifications: [
      "34kg weight capacity with impact resistant copolymer",
      "Single hinge lid with positive locking latches",
      "18.4L holding capacity",
      "Fits tools, accessories, batteries, chargers and small parts",
      "Trak Mount Lid system stacks from either direction",
    ],
    includes: [
      "2 x 310.5mm x 110.7mm x 74.4mm Deep Storage Trays",
      "2 x 310.5mm x 110.7mm x 47.2mm Shallow Storage Trays",
    ],
  },
  {
    name: "MAKITA MAKTRAK™ Large Tool Box Storage",
    model: "T-90015",
    description:
      "Large horizontal tool box with dual hinged removable lid for easy access without unstacking. Fits long tools with impact resistant copolymer construction for durability.",
    specifications: [
      "45.4kg maximum weight capacity",
      "63.2L holding capacity for long tools",
      "Dual hinged removable lid for easy access",
      "Horizontal design for maximum accessibility",
      "One-Touch latch release for quick stacking/unstacking",
      "Impact resistant copolymer for durability",
    ],
    includes: ["1 x 455.6mm x 233.4mm x 85.8mm Storage Tray", "1 x 205mm Molle Panel Divider"],
  },
  {
    name: "MAKITA MAKTRAK™ Deep Medium Organiser Storage",
    model: "T-90043",
    description:
      "Deep medium organiser with clear lid and 11 removable bins in 3 different sizes. Able to hold up to 125mm longer fasteners with rib design securing items in place.",
    specifications: [
      "22.68kg maximum weight capacity",
      "18.4L holding capacity",
      "Clear lid for easy visibility with rib design security",
      "11 removable organizer bins (3 different sizes)",
      "Holds up to 125mm longer fasteners",
      "Bins can mount on wall or outside of lid for easy access",
    ],
    includes: [
      "8 x 85mm x 85mm Organizer Bins",
      "2 x 91mm x 184mm Organizer Bins",
      "1 x 290mm x 68mm x 128.5mm Deep Organizer Bin",
    ],
  },
  {
    name: "MAKITA MAKTRAK™ Low Medium Organiser Storage",
    model: "T-90059",
    description:
      "Low-profile medium organiser with clear lid and 11 removable bins. Features 8 small bin dividers for compartment space suitable for small fasteners or components.",
    specifications: [
      "8.14L holding capacity",
      "Clear lid for easy visibility with rib design security",
      "11 removable organizer bins in 3 different sizes",
      "8 x Small Bin Dividers for additional compartments",
      "Up to 50% more holding capacity vs leading competitors",
      "Bins can mount on wall or outside of lid",
    ],
    includes: [
      "8 x 85mm x 85mm Organizer Bins",
      "2 x 91mm x 184mm Organizer Bins",
      "1 x 290mm x 68mm x 63.5mm Shallow Organizer Bin",
      "4 x Dividers",
    ],
  },
  {
    name: "MAKITA MAKTRAK™ Deep Compact Organiser Storage",
    model: "T-90065",
    description:
      "Deep compact organiser with 5 removable bins for versatile storage. Able to hold up to 125mm longer fasteners with clear lid for easy identification of contents.",
    specifications: [
      "8.5L holding capacity",
      "Clear lid for easy visibility with rib design security",
      "5 removable organizer bins for versatile storage",
      "Holds up to 125mm longer fasteners",
      "Up to 25% more holding capacity vs leading competitors",
      "Bins can mount on wall or outside of lid for easy access",
    ],
    includes: ["4 x 85mm x 85mm Organizer Bins", "1 x 91mm x 184mm / 128.5mm Deep Organizer Bin"],
  },
];

export const RYOBI_LINK_STORAGE: PrizeSpecItem[] = [
  {
    name: "RYOBI LINK™ 3 Piece Rolling Storage Set",
    description:
      "Complete rolling storage solution including Standard Toolbox, Medium Toolbox, and Rolling Tool Box. IP65-rated water and dust resistant with impact-resistant materials and integrated bit storage.",
    specifications: [
      "IP65-rated water and dust resistant construction",
      "Made from impact-resistant materials for durability",
      "Integrated bit storage on lids for quick access",
      "Double Organiser Tub (Rolling and Medium Tool Boxes)",
      "Double and Single Organiser Tubs (Standard Tool Box)",
      "36kg weight capacity when mounted on LINK Wall Rails",
      "9 inch all-terrain wheels with removable telescopic handle",
      "90kg weight capacity for Rolling Tool Box with LINK products",
      "Unique LINK design for secure stacking and locking",
      "Compatible with LINK Crates, Organisers and Wall Rails",
    ],
    includes: [
      "1 x LINK Standard Toolbox",
      "1 x LINK Medium Toolbox",
      "1 x LINK Rolling Tool Box with telescopic handle",
    ],
  },
  {
    name: "RYOBI LINK™ Wall Mountable Cabinet",
    description:
      "Versatile wall-mounted cabinet with 21Ga steel construction. Mounts onto LINK Wall Rails or wall studs with integrated cord access for charging power tool batteries inside.",
    specifications: [
      "Durable 21Ga steel construction for secure storage",
      "Mounts onto LINK Wall Rails or wall studs",
      "Integrated cord access for powering items inside",
      "Internal shelf adjusts to six positions",
      "Magnetic closure keeps doors shut securely",
      "Locking point on doors for enhanced security",
      "Dedicated mounting holes for additional LINK products",
      "Compatible with LINK Hooks and Half Wall Rails",
    ],
  },
  {
    name: "RYOBI LINK™ 15-Piece Wall Storage Kit",
    description:
      "Complete wall storage system with 5 Wall Rails, hooks, holders, crates and tubs. Create a modular wall storage system to eliminate clutter and maximize storage space in garage, shed, or laundry.",
    specifications: [
      "5 x Wall Rails (838mm wide, supports up to 94kg)",
      "High strength polymer material (31kg per 280mm section)",
      "Visible mounting points and channels for easy installation",
      "Metal hooks with non-slip coating for extra grip",
      "Reversible hooks mount in multiple positions",
      "Double Organiser Tub clips into LINK mobile storage",
      "Ideal for power tools, garden equipment, camping and sports gear",
      "Complete system compatibility with all LINK products",
    ],
    includes: [
      "5 x LINK Wall Rails (838mm each)",
      "1 x Double Organiser Tub",
      "2 x Reversible Hooks",
      "2 x Reversible J Hooks",
      "1 x Large Multi Purpose Hook",
      "1 x Double Hook",
      "1 x S Hook",
      "1 x Large Standard Hook",
      "Mounting screws and wall plugs included",
    ],
  },
];

export const HIKOKI_CRUISER_STORAGE: PrizeSpecItem[] = [
  {
    name: "HiKOKI Multi Cruiser 3-Piece Stackable Tool Box Set",
    model: "HIKCRUISERCOMBO",
    description:
      "HiKOKI's modular Multi Cruiser storage system — three stackable, interlocking IP65-rated boxes (rolling base, large and medium) that latch together and reorder to suit the load.",
    specifications: [
      "3 stackable, interlocking boxes (customisable order)",
      "Rolling Carry Box (379487): 120kg load, 9\" wheels + handle, inner tray",
      "Large Tool Box (379484): 40kg load, inner tray",
      "Medium Tool Box (379481): 30kg load, 2 accessory cases",
      "IP65 dust & water ingress protection",
      "Up to 120kg combined load when stacked",
    ],
    includes: [
      "1 x 379487 Rolling Carry Tool Box (+ inner tray)",
      "1 x 379484 Large Tool Box (+ inner tray)",
      "1 x 379481 Medium Tool Box (+ 2 accessory cases)",
    ],
  },
];

// Storage systems are defined after the photo map above, so apply images to them here.
[
  MILWAUKEE_PACKOUT_STORAGE,
  DEWALT_TOUGHSYSTEM_STORAGE,
  MAKITA_MAKTRAK_STORAGE,
  RYOBI_LINK_STORAGE,
  HIKOKI_CRUISER_STORAGE,
].forEach(applySpecItemImages);

/**
 * Prize catalog entries are the single source of truth for prize imagery/copy.
 * Add new prize packs here – frontend components resolve everything dynamically.
 */
export const PRIZE_CATALOG: PrizeCatalogEntry[] = [
  {
    slug: "milwaukee-sidchrome",
    label: "Sidchrome Toolbox, Milwaukee 13pc Power Tool Kit + Milwaukee Packout 8pc Modular System, $5000 cash",
    heroHeading: "Sidchrome Toolbox, Milwaukee 13pc Power Tool Kit + Milwaukee Packout 8pc Modular System, $5000 cash",
    heroSubheading:
      "Complete Milwaukee 18V FUEL™ professional toolkit with Milwaukee PACKOUT™ 8pc modular storage system and Sidchrome SCMT11402 356-piece workshop tower plus $5000 cash.",
    summary:
      "Milwaukee 18V FUEL™ power tools, REDLITHIUM™ battery ecosystem, Milwaukee PACKOUT™ 8pc modular storage system, and the Sidchrome SCMT11402 356-piece storage cabinet plus $5000 cash.",
    detailedDescription:
      "Win the ultimate Milwaukee 18V FUEL™ professional toolkit featuring 13 premium cordless power tools including a hammer drill, impact driver, angle grinder, jigsaw, reciprocating saw, circular saw, oscillating multi-tool, jobsite speaker, compact battery light, blower, mid-torque impact wrench, random orbital sander, and pruning saw. Keep every skin running with Milwaukee REDLITHIUM™ 5.0Ah battery packs, then transport and organise everything with the Milwaukee PACKOUT™ 8-piece modular storage system featuring rolling tool box, large and standard tool boxes, organisers, and tool bag. Complete your workshop with the Sidchrome SCMT11402 356-piece cabinet stocked with precision hand tools, foam inlays, and mobile workshop storage.",
    prizeValueLabel: "$35,000+ Value",
    cardBackgroundImage: "/images/majordraws/milwaukee-set/milwaukee-sidchrome.webp",
    gallery: [
      { src: "/images/majordraws/milwaukee-set/milwaukee-sidchrome.webp", alt: "Milwaukee set with Sidchrome toolbox" },
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
    ],
    highlights: [
      { icon: "Zap", title: "13 Power Tools", description: "Complete Milwaukee 18V FUEL™ collection." },
      {
        icon: "Package",
        title: "PACKOUT™ Modular Storage",
        description: "8-piece modular storage system with rolling tool box and organisers.",
      },
      {
        icon: "Battery",
        title: "REDLITHIUM™ Power System",
        description: "High-output 5.0Ah packs keep every skin running.",
      },
      {
        icon: "Wrench",
        title: "Sidchrome 356pc Kit",
        description: "Complete hand-tool cabinet for workshop builds.",
      },
    ],
    specSections: [
      {
        id: "power-tools",
        label: "Power Tools",
        summary: "Everyday essentials through to specialised cutting, fastening, and lighting tools.",
        items: MILWAUKEE_POWER_TOOLS,
      },
      {
        id: "power-system",
        label: "Power System",
        summary: "REDLITHIUM™ 5.0Ah batteries deliver long runtime and intelligent overload protection.",
        items: MILWAUKEE_POWER_SYSTEM,
      },
      {
        id: "modular-storage",
        label: "PACKOUT™ Modular Storage",
        summary: "Milwaukee PACKOUT™ 8pc modular storage system with IP65 rated protection, rolling tool box, organisers, and tool bag for complete jobsite organization.",
        items: MILWAUKEE_PACKOUT_STORAGE,
      },
      {
        id: "storage",
        label: "Workshop Storage & Hand Tools",
        summary: "Sidchrome SCMT11402 roller cabinet loaded with 356 precision hand tools and foam inlays.",
        items: MILWAUKEE_WORKSHOP_STORAGE,
      },
    ],
  },
  {
    slug: "dewalt-sidchrome",
    label: "Sidchrome Toolbox, DeWalt 14pc Power Tool Kit + DeWalt Tough System 2.0 Mobile Storage, $5000 cash",
    heroHeading: "Sidchrome Toolbox, DeWalt 14pc Power Tool Kit + DeWalt Tough System 2.0 Mobile Storage, $5000 cash",
    heroSubheading:
      "Heavy-duty DeWalt FlexVolt and XR cordless range with DeWalt TOUGHSYSTEM® 2.0 mobile storage and Sidchrome SCMT11402 356-piece toolkit plus $5000 cash.",
    summary:
      "Heavy-duty DeWalt FlexVolt cordless lineup, TOUGHSYSTEM® 2.0 mobile storage, and a 356-piece Sidchrome toolkit plus $5000 cash.",
    detailedDescription:
      "Build your dream site setup with DeWalt's FlexVolt and XR cordless range spanning hammer drills, impact drivers, rotary hammers, saws, grinders, dust control, and lighting. Keep everything powered with high-capacity FlexVolt batteries and dual-port charging. Transport and organize with the DeWalt TOUGHSYSTEM® 2.0 7-piece mobile storage system featuring rolling boxes, organisers, soft tote bag, and cross-platform adapter. Complete your workshop with the Sidchrome 356-piece professional hand-tool kit.",
    prizeValueLabel: "$30,000+ Value",
    cardBackgroundImage: "/images/majordraws/dewalt-set/dewalt-sidchrome.webp",
    gallery: [
      { src: "/images/majordraws/dewalt-set/dewalt-sidchrome.webp", alt: "DeWalt set with Sidchrome toolbox" },
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
    ],
    highlights: [
      {
        icon: "Zap",
        title: "FlexVolt Muscle",
        description: "54V tools for circular, rotary, and reciprocating power.",
      },
      { icon: "Package", title: "TOUGHSYSTEM® 2.0 Storage", description: "7-piece mobile storage with IP65 protection and cross-platform adapter." },
      {
        icon: "Battery",
        title: "High-Capacity Power",
        description: "FlexVolt + XR batteries with twin-port fast charging.",
      },
      { icon: "Wrench", title: "Sidchrome 356pc Kit", description: "Complete hand-tool cabinet for workshop builds." },
    ],
    specSections: [
      {
        id: "power-tools",
        label: "Power Tools & Jobsite Gear",
        summary: "FlexVolt and XR tools covering drilling, fastening, demolition, cutting, dust control, and lighting.",
        items: DEWALT_SIDCHROME_POWER_TOOLS,
      },
      {
        id: "power-system",
        label: "Power System",
        summary: "FlexVolt batteries and dual-port charging to keep every tool ready.",
        items: DEWALT_SIDCHROME_POWER_SYSTEM,
      },
      {
        id: "modular-storage",
        label: "TOUGHSYSTEM® 2.0 Mobile Storage",
        summary: "DeWalt TOUGHSYSTEM® 2.0 7-piece mobile storage system with IP65 rated protection, rolling boxes, organisers, soft tote bag, and cross-platform adapter for complete jobsite flexibility.",
        items: DEWALT_TOUGHSYSTEM_STORAGE,
      },
      {
        id: "storage",
        label: "Storage & Hand Tools",
        summary: "Heavy-duty transport, organisation, and comprehensive Sidchrome hand-tool coverage.",
        items: DEWALT_SIDCHROME_STORAGE,
      },
    ],
  },
  {
    slug: "makita-sidchrome",
    label: "Sidchrome Toolbox, Makita 15pc Power Tool Kit + Makita MAKTRAK 7pc Mobile Storage, $5000 cash",
    heroHeading: "Sidchrome Toolbox, Makita 15pc Power Tool Kit + Makita MAKTRAK 7pc Mobile Storage, $5000 cash",
    heroSubheading:
      "Complete Makita 18V LXT brushless professional toolkit with Makita MAKTRAK™ 7pc mobile storage and Sidchrome SCMT11402 356-piece workshop tower plus $5000 cash.",
    summary:
      "Makita 18V LXT brushless power tools, MAKTRAK™ 7pc mobile storage system, and the Sidchrome SCMT11402 356-piece storage cabinet plus $5000 cash.",
    detailedDescription:
      "Win the ultimate Makita 18V LXT professional toolkit featuring 15 premium cordless power tools including a hammer drill, impact driver, angle grinder, rotary hammer, circular saw, reciprocating saw, multi-tool, impact wrench, random orbital sander, stick vacuum, jigsaw, planer, blower, jobsite radio, and long-distance flashlight. Keep every tool running with Makita LXT 5.0Ah battery packs and rapid dual-port charging. Transport and organize with the Makita MAKTRAK™ 7-piece mobile storage system featuring rolling tool chest, extra large, large, and medium tool boxes, plus deep and low profile organisers. Complete your workshop with the Sidchrome SCMT11402 356-piece cabinet stocked with precision hand tools, foam inlays, and mobile workshop storage. Plus, take home $5000 cold hard cash.",
    prizeValueLabel: "$30,000+ Value",
    cardBackgroundImage: "/images/majordraws/makita-set/makita-sidchrome.webp",
    gallery: [
      { src: "/images/majordraws/makita-set/makita-sidchrome.webp", alt: "Makita set with Sidchrome toolbox" },
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
    ],
    highlights: [
      { icon: "Zap", title: "15 Power Tools", description: "Complete Makita 18V LXT brushless collection." },
      {
        icon: "Package",
        title: "MAKTRAK™ Mobile Storage",
        description: "7-piece mobile storage with rolling chest and organisers.",
      },
      {
        icon: "Battery",
        title: "LXT Power System",
        description: "High-capacity 5.0Ah packs with rapid dual-port charging.",
      },
      {
        icon: "Wrench",
        title: "Sidchrome 356pc Kit",
        description: "Complete hand-tool cabinet for workshop builds.",
      },
    ],
    specSections: [
      {
        id: "power-tools",
        label: "Power Tools & Jobsite Gear",
        summary:
          "Complete Makita 18V LXT brushless tool range covering drilling, fastening, cutting, sanding, dust control, and lighting.",
        items: MAKITA_SIDCHROME_POWER_TOOLS,
      },
      {
        id: "power-system",
        label: "Power System",
        summary: "LXT 5.0Ah batteries and rapid dual-port charger keep every tool ready.",
        items: MAKITA_SIDCHROME_POWER_SYSTEM,
      },
      {
        id: "modular-storage",
        label: "MAKTRAK™ Mobile Storage",
        summary: "Makita MAKTRAK™ 7-piece mobile storage system with 113.4kg capacity rolling tool chest, extra large, large, and medium tool boxes, plus deep and low profile organisers for complete jobsite organization.",
        items: MAKITA_MAKTRAK_STORAGE,
      },
      {
        id: "storage",
        label: "Storage & Hand Tools",
        summary: "Heavy-duty transport bags, organisation, and comprehensive Sidchrome hand-tool coverage.",
        items: MAKITA_SIDCHROME_STORAGE,
      },
    ],
  },
  {
    slug: "milwaukee-milwaukee",
    label: "Milwaukee Toolbox, Milwaukee 13pc Power Tool Kit + Milwaukee Packout 8pc Modular System, $5000 cash",
    heroHeading: "Milwaukee Toolbox, Milwaukee 13pc Power Tool Kit + Milwaukee Packout 8pc Modular System, $5000 cash",
    heroSubheading:
      "Complete Milwaukee 18V FUEL™ professional toolkit with Milwaukee PACKOUT™ 8pc modular storage system and Milwaukee 56\" High Capacity Combination tool storage plus $5000 cash.",
    summary:
      "Milwaukee 18V FUEL™ power tools, REDLITHIUM™ battery ecosystem, Milwaukee PACKOUT™ 8pc modular storage system, and the Milwaukee 56\" High Capacity Combination tool storage plus $5000 cash.",
    detailedDescription:
      "Win the ultimate Milwaukee 18V FUEL™ professional toolkit featuring 13 premium cordless power tools including a hammer drill, impact driver, angle grinder, jigsaw, reciprocating saw, circular saw, oscillating multi-tool, jobsite speaker, compact battery light, blower, mid-torque impact wrench, random orbital sander, and pruning saw. Keep every skin running with Milwaukee REDLITHIUM™ 5.0Ah battery packs. Transport and organize with the Milwaukee PACKOUT™ 8-piece modular storage system featuring rolling tool box, large and standard tool boxes, organisers, and tool bag. Complete your workshop with the Milwaukee 56\" High Capacity Combination tool storage with 18 gauge construction, 68KG soft close drawer slides, electronic lock, and 4-outlet/2USB power strip. Plus, take home $5000 cold hard cash.",
    prizeValueLabel: "$35,000+ Value",
    cardBackgroundImage: "/images/majordraws/milwaukee-set/milwaukee-milwaukee.webp",
    gallery: [
      { src: "/images/majordraws/milwaukee-set/milwaukee-milwaukee.webp", alt: "Milwaukee set with Milwaukee toolbox" },
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
    ],
    highlights: [
      { icon: "Zap", title: "13 Power Tools", description: "Complete Milwaukee 18V FUEL™ collection." },
      {
        icon: "Package",
        title: "PACKOUT™ + 56\" Toolbox",
        description: "8-piece modular storage plus high capacity combination tool storage.",
      },
      {
        icon: "Battery",
        title: "REDLITHIUM™ Power System",
        description: "High-output 5.0Ah packs keep every skin running.",
      },
      {
        icon: "DollarSign",
        title: "$5000 Cash Bonus",
        description: "Cold hard cash included with your prize.",
      },
    ],
    specSections: [
      {
        id: "power-tools",
        label: "Power Tools",
        summary: "Everyday essentials through to specialised cutting, fastening, and lighting tools.",
        items: MILWAUKEE_POWER_TOOLS,
      },
      {
        id: "power-system",
        label: "Power System",
        summary: "REDLITHIUM™ 5.0Ah batteries deliver long runtime and intelligent overload protection.",
        items: MILWAUKEE_POWER_SYSTEM,
      },
      {
        id: "modular-storage",
        label: "PACKOUT™ Modular Storage",
        summary: "Milwaukee PACKOUT™ 8pc modular storage system with IP65 rated protection, rolling tool box, organisers, and tool bag for complete jobsite organization.",
        items: MILWAUKEE_PACKOUT_STORAGE,
      },
      {
        id: "storage",
        label: "Tool Storage",
        summary: "Milwaukee 56\" High Capacity Combination tool storage with premium features.",
        items: MILWAUKEE_TOOLBOX_STORAGE,
      },
    ],
  },
  {
    slug: "dewalt-milwaukee",
    label: "Milwaukee Toolbox, DeWalt 14pc Power Tool Kit + DeWalt Tough System 2.0 Mobile Storage, $5000 cash",
    heroHeading: "Milwaukee Toolbox, DeWalt 14pc Power Tool Kit + DeWalt Tough System 2.0 Mobile Storage, $5000 cash",
    heroSubheading:
      "Heavy-duty DeWalt FlexVolt and XR cordless range with DeWalt TOUGHSYSTEM® 2.0 mobile storage and Milwaukee 56\" High Capacity Combination tool storage plus $5000 cash.",
    summary:
      "Heavy-duty DeWalt FlexVolt cordless lineup, TOUGHSYSTEM® 2.0 mobile storage, premium Milwaukee tool storage, and comprehensive power tool collection plus $5000 cash.",
    detailedDescription:
      "Build your dream site setup with DeWalt's FlexVolt and XR cordless range spanning hammer drills, impact drivers, rotary hammers, saws, grinders, dust control, and lighting. Keep everything powered with high-capacity FlexVolt batteries and dual-port charging. Transport and organize with the DeWalt TOUGHSYSTEM® 2.0 7-piece mobile storage system featuring rolling boxes, organisers, soft tote bag, and cross-platform adapter. Complete your workshop with the Milwaukee 56\" High Capacity Combination tool storage with 18 gauge construction, 68KG soft close drawer slides, electronic lock, and 4-outlet/2USB power strip. Plus, take home $5000 cold hard cash.",
    prizeValueLabel: "$30,000+ Value",
    cardBackgroundImage: "/images/majordraws/dewalt-set/dewalt-milwaukee.webp",
    gallery: [
      { src: "/images/majordraws/dewalt-set/dewalt-milwaukee.webp", alt: "DeWalt set with Milwaukee toolbox" },
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
    ],
    highlights: [
      {
        icon: "Zap",
        title: "FlexVolt Muscle",
        description: "54V tools for circular, rotary, and reciprocating power.",
      },
      { icon: "Package", title: "TOUGHSYSTEM® 2.0 + Toolbox", description: "7-piece mobile storage plus Milwaukee 56\" combination tool storage." },
      {
        icon: "Battery",
        title: "High-Capacity Power",
        description: "FlexVolt + XR batteries with twin-port fast charging.",
      },
      {
        icon: "DollarSign",
        title: "$5000 Cash Bonus",
        description: "Cold hard cash included with your prize.",
      },
    ],
    specSections: [
      {
        id: "power-tools",
        label: "Power Tools & Jobsite Gear",
        summary: "FlexVolt and XR tools covering drilling, fastening, demolition, cutting, dust control, and lighting.",
        items: DEWALT_SIDCHROME_POWER_TOOLS,
      },
      {
        id: "power-system",
        label: "Power System",
        summary: "FlexVolt batteries and dual-port charging to keep every tool ready.",
        items: DEWALT_SIDCHROME_POWER_SYSTEM,
      },
      {
        id: "modular-storage",
        label: "TOUGHSYSTEM® 2.0 Mobile Storage",
        summary: "DeWalt TOUGHSYSTEM® 2.0 7-piece mobile storage system with IP65 rated protection, rolling boxes, organisers, soft tote bag, and cross-platform adapter for complete jobsite flexibility.",
        items: DEWALT_TOUGHSYSTEM_STORAGE,
      },
      {
        id: "storage",
        label: "Tool Storage",
        summary: "Milwaukee 56\" High Capacity Combination tool storage with premium features.",
        items: MILWAUKEE_TOOLBOX_STORAGE,
      },
    ],
  },
  {
    slug: "makita-milwaukee",
    label: "Milwaukee Toolbox, Makita 15pc Power Tool Kit + Makita MAKTRAK 7pc Mobile Storage, $5000 cash",
    heroHeading: "Milwaukee Toolbox, Makita 15pc Power Tool Kit + Makita MAKTRAK 7pc Mobile Storage, $5000 cash",
    heroSubheading:
      "Complete Makita 18V LXT brushless professional toolkit with Makita MAKTRAK™ 7pc mobile storage and Milwaukee 56\" High Capacity Combination tool storage plus $5000 cash.",
    summary:
      "Makita 18V LXT brushless power tools, MAKTRAK™ 7pc mobile storage system, and the Milwaukee 56\" High Capacity Combination tool storage plus $5000 cash.",
    detailedDescription:
      "Win the ultimate Makita 18V LXT professional toolkit featuring 15 premium cordless power tools including a hammer drill, impact driver, angle grinder, rotary hammer, circular saw, reciprocating saw, multi-tool, impact wrench, random orbital sander, stick vacuum, jigsaw, planer, blower, jobsite radio, and long-distance flashlight. Keep every tool running with Makita LXT 5.0Ah battery packs and rapid dual-port charging. Transport and organize with the Makita MAKTRAK™ 7-piece mobile storage system featuring rolling tool chest, extra large, large, and medium tool boxes, plus deep and low profile organisers. Complete your workshop with the Milwaukee 56\" High Capacity Combination tool storage with 18 gauge construction, 68KG soft close drawer slides, electronic lock, and 4-outlet/2USB power strip. Plus, take home $5000 cold hard cash.",
    prizeValueLabel: "$30,000+ Value",
    cardBackgroundImage: "/images/majordraws/makita-set/makita-milwaukee.webp",
    gallery: [
      { src: "/images/majordraws/makita-set/makita-milwaukee.webp", alt: "Makita set with Milwaukee toolbox" },
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
    ],
    highlights: [
      { icon: "Zap", title: "15 Power Tools", description: "Complete Makita 18V LXT brushless collection." },
      {
        icon: "Package",
        title: "MAKTRAK™ + Toolbox",
        description: "7-piece mobile storage plus Milwaukee 56\" combination tool storage.",
      },
      {
        icon: "Battery",
        title: "LXT Power System",
        description: "High-capacity 5.0Ah packs with rapid dual-port charging.",
      },
      {
        icon: "DollarSign",
        title: "$5000 Cash Bonus",
        description: "Cold hard cash included with your prize.",
      },
    ],
    specSections: [
      {
        id: "power-tools",
        label: "Power Tools & Jobsite Gear",
        summary:
          "Complete Makita 18V LXT brushless tool range covering drilling, fastening, cutting, sanding, dust control, and lighting.",
        items: MAKITA_SIDCHROME_POWER_TOOLS,
      },
      {
        id: "power-system",
        label: "Power System",
        summary: "LXT 5.0Ah batteries and rapid dual-port charger keep every tool ready.",
        items: MAKITA_SIDCHROME_POWER_SYSTEM,
      },
      {
        id: "modular-storage",
        label: "MAKTRAK™ Mobile Storage",
        summary: "Makita MAKTRAK™ 7-piece mobile storage system with 113.4kg capacity rolling tool chest, extra large, large, and medium tool boxes, plus deep and low profile organisers for complete jobsite organization.",
        items: MAKITA_MAKTRAK_STORAGE,
      },
      {
        id: "storage",
        label: "Tool Storage",
        summary: "Milwaukee 56\" High Capacity Combination tool storage with premium features.",
        items: MILWAUKEE_TOOLBOX_STORAGE,
      },
    ],
  },
  {
    slug: "ryobi-sidchrome",
    label: `Sidchrome Toolbox, Ryobi 19pc Power Tool Kit + Ryobi LINK Storage Units, $5000 cash`,
    heroHeading: `Sidchrome Toolbox, Ryobi 19pc Power Tool Kit + Ryobi LINK Storage Units, $5000 cash`,
    heroSubheading:
      `Complete Ryobi 18V ONE+ toolkit with Ryobi LINK™ modular storage system and Sidchrome SCMT11402 356-piece workshop tower plus $5000 cash.`,
    summary:
      `Ryobi 18V ONE+ power and garden tools, LINK™ modular storage system, and the Sidchrome SCMT11402 356-piece storage cabinet plus $5000 cash.`,
    detailedDescription:
      `Win the ultimate Ryobi 18V ONE+ toolkit featuring 19 power and garden tools including the 12-piece 4Ah kit (drill, impact driver, grinder, circular saw, recip saw, sander, multi-tool, vac, blower, inflator, flashlight, radio), plus Line Trimmer & Blower kit, 254mm Sliding Mitre Saw, Jigsaw, Compact Fan, 55cm Hedge Trimmer, and 36V Brushless Lawn Mower. Power everything with ONE+ HP 5Ah batteries. Transport and organize with the Ryobi LINK™ 3-piece rolling storage set, wall mountable cabinet, and 15-piece wall storage kit. Complete your workshop with the Sidchrome SCMT11402 356-piece cabinet. Plus $5000 cash.`,
    prizeValueLabel: "$25,000+ Value",
    cardBackgroundImage: "/images/majordraws/ryobi-set/ryobi-sidchrome.webp",
    gallery: [
      { src: "/images/majordraws/ryobi-set/ryobi-sidchrome.webp", alt: "Ryobi set with Sidchrome toolbox" },
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
    ],
    highlights: [
      { icon: "Zap", title: "19 Power & Garden Tools", description: "18V ONE+ 12-piece kit plus lawn mower and garden tools." },
      {
        icon: "Package",
        title: "LINK™ Modular Storage",
        description: "3-piece rolling storage, wall cabinet, and 15-piece wall kit.",
      },
      {
        icon: "Battery",
        title: "ONE+ Power System",
        description: "18V ONE+ batteries power 200+ tools across the range.",
      },
      {
        icon: "Wrench",
        title: "Sidchrome 356pc Kit",
        description: "Complete hand-tool cabinet for workshop builds.",
      },
    ],
    specSections: [
      {
        id: "power-tools",
        label: "Power Tools & Garden Equipment",
        summary: "18V ONE+ 12-piece kit, mitre saw, jigsaw, fan, hedge trimmer, lawn mower and more.",
        items: RYOBI_POWER_TOOLS,
      },
      {
        id: "power-system",
        label: "Power System",
        summary: "ONE+ HP 5Ah batteries and 2A charger keep every tool ready.",
        items: RYOBI_POWER_SYSTEM,
      },
      {
        id: "modular-storage",
        label: "LINK™ Modular Storage",
        summary: "Ryobi LINK™ modular storage system with 3-piece rolling storage set (IP65 rated), wall mountable cabinet, and 15-piece wall storage kit for complete workshop and jobsite organization.",
        items: RYOBI_LINK_STORAGE,
      },
      {
        id: "storage",
        label: "Workshop Storage & Hand Tools",
        summary: "Sidchrome SCMT11402 roller cabinet loaded with 356 precision hand tools and foam inlays.",
        items: MILWAUKEE_WORKSHOP_STORAGE,
      },
    ],
  },
  {
    slug: "ryobi-milwaukee",
    label: `Milwaukee Toolbox, Ryobi 19pc Power Tool Kit + Ryobi LINK Storage Units, $5000 cash`,
    heroHeading: `Milwaukee Toolbox, Ryobi 19pc Power Tool Kit + Ryobi LINK Storage Units, $5000 cash`,
    heroSubheading:
      `Complete Ryobi 18V ONE+ toolkit with Ryobi LINK™ modular storage system and Milwaukee 56\" High Capacity Combination tool storage plus $5000 cash.`,
    summary:
      `Ryobi 18V ONE+ power and garden tools, LINK™ modular storage system, and the Milwaukee 56\" High Capacity Combination tool storage plus $5000 cash.`,
    detailedDescription:
      `Win the ultimate Ryobi 18V ONE+ toolkit featuring 19 power and garden tools including the 12-piece 4Ah kit (drill, impact driver, grinder, circular saw, recip saw, sander, multi-tool, vac, blower, inflator, flashlight, radio), plus Line Trimmer & Blower kit, 254mm Sliding Mitre Saw, Jigsaw, Compact Fan, 55cm Hedge Trimmer, and 36V Brushless Lawn Mower. Power everything with ONE+ HP 5Ah batteries. Transport and organize with the Ryobi LINK™ 3-piece rolling storage set, wall mountable cabinet, and 15-piece wall storage kit. Complete your workshop with the Milwaukee 56\" High Capacity Combination tool storage. Plus $5000 cash.`,
    prizeValueLabel: "$25,000+ Value",
    cardBackgroundImage: "/images/majordraws/ryobi-set/ryobi-milwaukee.webp",
    gallery: [
      { src: "/images/majordraws/ryobi-set/ryobi-milwaukee.webp", alt: "Ryobi set with Milwaukee toolbox" },
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
    ],
    highlights: [
      { icon: "Zap", title: "19 Power & Garden Tools", description: "18V ONE+ 12-piece kit plus lawn mower and garden tools." },
      {
        icon: "Package",
        title: "LINK™ + Toolbox",
        description: "Modular storage system plus Milwaukee 56\" combination tool storage.",
      },
      {
        icon: "Battery",
        title: "ONE+ Power System",
        description: "18V ONE+ batteries power 200+ tools across the range.",
      },
      {
        icon: "DollarSign",
        title: "$5000 Cash Bonus",
        description: "Cold hard cash included with your prize.",
      },
    ],
    specSections: [
      {
        id: "power-tools",
        label: "Power Tools & Garden Equipment",
        summary: "18V ONE+ 12-piece kit, mitre saw, jigsaw, fan, hedge trimmer, lawn mower and more.",
        items: RYOBI_POWER_TOOLS,
      },
      {
        id: "power-system",
        label: "Power System",
        summary: "ONE+ HP 5Ah batteries and 2A charger keep every tool ready.",
        items: RYOBI_POWER_SYSTEM,
      },
      {
        id: "modular-storage",
        label: "LINK™ Modular Storage",
        summary: "Ryobi LINK™ modular storage system with 3-piece rolling storage set (IP65 rated), wall mountable cabinet, and 15-piece wall storage kit for complete workshop and jobsite organization.",
        items: RYOBI_LINK_STORAGE,
      },
      {
        id: "storage",
        label: "Tool Storage",
        summary: "Milwaukee 56\" High Capacity Combination tool storage with premium features.",
        items: MILWAUKEE_TOOLBOX_STORAGE,
      },
    ],
  },
  {
    slug: "milwaukee-kincrome",
    label: "Kincrome CONTOUR® Toolbox, Milwaukee 13pc Power Tool Kit + Milwaukee Packout 8pc Modular System, $5000 cash",
    heroHeading:
      "Kincrome CONTOUR® Toolbox, Milwaukee 13pc Power Tool Kit + Milwaukee Packout 8pc Modular System, $5000 cash",
    heroSubheading:
      "Complete Milwaukee 18V FUEL™ professional toolkit with Milwaukee PACKOUT™ 8pc modular storage and KINCROME CONTOUR® 470pc 17-drawer workshop kit plus $5000 cash.",
    summary:
      "Milwaukee 18V FUEL™ power tools, REDLITHIUM™ battery ecosystem, Milwaukee PACKOUT™ 8pc modular storage, and the KINCROME CONTOUR® workshop chest & trolley plus $5000 cash.",
    detailedDescription:
      "Win the ultimate Milwaukee 18V FUEL™ professional toolkit featuring 13 premium cordless power tools including a hammer drill, impact driver, angle grinder, jigsaw, reciprocating saw, circular saw, oscillating multi-tool, jobsite speaker, compact battery light, blower, mid-torque impact wrench, random orbital sander, and pruning saw. Keep every skin running with Milwaukee REDLITHIUM™ 5.0Ah battery packs. Transport and organize with the Milwaukee PACKOUT™ 8-piece modular storage system featuring rolling tool box, large and standard tool boxes, organisers, and tool bag. Complete your workshop with the KINCROME CONTOUR® 470-piece 17-drawer (42\") workshop kit (P1823) with premium storage and trade-ready features. Plus, take home $5000 cold hard cash.",
    prizeValueLabel: "$35,000+ Value",
    cardBackgroundImage: "/images/majordraws/milwaukee-set/milwaukee-kincrome.webp",
    gallery: [
      { src: "/images/majordraws/milwaukee-set/milwaukee-kincrome.webp", alt: "Milwaukee power tool set with Kincrome CONTOUR toolbox" },
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
    ],
    highlights: [
      { icon: "Zap", title: "13 Power Tools", description: "Complete Milwaukee 18V FUEL™ collection." },
      {
        icon: "Package",
        title: "PACKOUT™ + CONTOUR® Kit",
        description: "8-piece modular storage plus Kincrome 470pc workshop chest & trolley.",
      },
      {
        icon: "Battery",
        title: "REDLITHIUM™ Power System",
        description: "High-output 5.0Ah packs keep every skin running.",
      },
      {
        icon: "DollarSign",
        title: "$5000 Cash Bonus",
        description: "Cold hard cash included with your prize.",
      },
    ],
    specSections: [
      {
        id: "power-tools",
        label: "Power Tools",
        summary: "Everyday essentials through to specialised cutting, fastening, and lighting tools.",
        items: MILWAUKEE_POWER_TOOLS,
      },
      {
        id: "power-system",
        label: "Power System",
        summary: "REDLITHIUM™ 5.0Ah batteries deliver long runtime and intelligent overload protection.",
        items: MILWAUKEE_POWER_SYSTEM,
      },
      {
        id: "modular-storage",
        label: "PACKOUT™ Modular Storage",
        summary:
          "Milwaukee PACKOUT™ 8pc modular storage system with IP65 rated protection, rolling tool box, organisers, and tool bag for complete jobsite organization.",
        items: MILWAUKEE_PACKOUT_STORAGE,
      },
      {
        id: "storage",
        label: "Tool Storage",
        summary: "KINCROME CONTOUR® 470pc 17-drawer workshop kit with premium trade features.",
        items: KINCROME_TOOLBOX_STORAGE,
      },
    ],
  },
  {
    slug: "dewalt-kincrome",
    label: "Kincrome CONTOUR® Toolbox, DeWalt 14pc Power Tool Kit + DeWalt Tough System 2.0 Mobile Storage, $5000 cash",
    heroHeading:
      "Kincrome CONTOUR® Toolbox, DeWalt 14pc Power Tool Kit + DeWalt Tough System 2.0 Mobile Storage, $5000 cash",
    heroSubheading:
      "Heavy-duty DeWalt FlexVolt and XR cordless range with DeWalt TOUGHSYSTEM® 2.0 mobile storage and KINCROME CONTOUR® 470pc workshop kit plus $5000 cash.",
    summary:
      "Heavy-duty DeWalt FlexVolt cordless lineup, TOUGHSYSTEM® 2.0 mobile storage, KINCROME CONTOUR® workshop storage, and comprehensive power tool collection plus $5000 cash.",
    detailedDescription:
      "Build your dream site setup with DeWalt's FlexVolt and XR cordless range spanning hammer drills, impact drivers, rotary hammers, saws, grinders, dust control, and lighting. Keep everything powered with high-capacity FlexVolt batteries and dual-port charging. Transport and organize with the DeWalt TOUGHSYSTEM® 2.0 7-piece mobile storage system featuring rolling boxes, organisers, soft tote bag, and cross-platform adapter. Complete your workshop with the KINCROME CONTOUR® 470-piece 17-drawer (42\") workshop kit (P1823). Plus, take home $5000 cold hard cash.",
    prizeValueLabel: "$30,000+ Value",
    cardBackgroundImage: "/images/majordraws/dewalt-set/dewalt-kincrome.webp",
    gallery: [
      { src: "/images/majordraws/dewalt-set/dewalt-kincrome.webp", alt: "DeWalt set with Kincrome CONTOUR toolbox" },
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
    ],
    highlights: [
      {
        icon: "Zap",
        title: "FlexVolt Muscle",
        description: "54V tools for circular, rotary, and reciprocating power.",
      },
      {
        icon: "Package",
        title: "TOUGHSYSTEM® 2.0 + CONTOUR®",
        description: "7-piece mobile storage plus Kincrome 470pc workshop kit.",
      },
      {
        icon: "Battery",
        title: "High-Capacity Power",
        description: "FlexVolt + XR batteries with twin-port fast charging.",
      },
      {
        icon: "DollarSign",
        title: "$5000 Cash Bonus",
        description: "Cold hard cash included with your prize.",
      },
    ],
    specSections: [
      {
        id: "power-tools",
        label: "Power Tools & Jobsite Gear",
        summary: "FlexVolt and XR tools covering drilling, fastening, demolition, cutting, dust control, and lighting.",
        items: DEWALT_SIDCHROME_POWER_TOOLS,
      },
      {
        id: "power-system",
        label: "Power System",
        summary: "FlexVolt batteries and dual-port charging to keep every tool ready.",
        items: DEWALT_SIDCHROME_POWER_SYSTEM,
      },
      {
        id: "modular-storage",
        label: "TOUGHSYSTEM® 2.0 Mobile Storage",
        summary:
          "DeWalt TOUGHSYSTEM® 2.0 7-piece mobile storage system with IP65 rated protection, rolling boxes, organisers, soft tote bag, and cross-platform adapter for complete jobsite flexibility.",
        items: DEWALT_TOUGHSYSTEM_STORAGE,
      },
      {
        id: "storage",
        label: "Tool Storage",
        summary: "KINCROME CONTOUR® 470pc workshop kit with premium trade features.",
        items: KINCROME_TOOLBOX_STORAGE,
      },
    ],
  },
  {
    slug: "makita-kincrome",
    label: "Kincrome CONTOUR® Toolbox, Makita 15pc Power Tool Kit + Makita MAKTRAK 7pc Mobile Storage, $5000 cash",
    heroHeading:
      "Kincrome CONTOUR® Toolbox, Makita 15pc Power Tool Kit + Makita MAKTRAK 7pc Mobile Storage, $5000 cash",
    heroSubheading:
      "Complete Makita 18V LXT brushless professional toolkit with Makita MAKTRAK™ 7pc mobile storage and KINCROME CONTOUR® 470pc workshop kit plus $5000 cash.",
    summary:
      "Makita 18V LXT brushless power tools, MAKTRAK™ 7pc mobile storage system, and the KINCROME CONTOUR® workshop kit plus $5000 cash.",
    detailedDescription:
      "Win the ultimate Makita 18V LXT professional toolkit featuring 15 premium cordless power tools including a hammer drill, impact driver, angle grinder, rotary hammer, circular saw, reciprocating saw, multi-tool, impact wrench, random orbital sander, stick vacuum, jigsaw, planer, blower, jobsite radio, and long-distance flashlight. Keep every tool running with Makita LXT 5.0Ah battery packs and rapid dual-port charging. Transport and organize with the Makita MAKTRAK™ 7-piece mobile storage system featuring rolling tool chest, extra large, large, and medium tool boxes, plus deep and low profile organisers. Complete your workshop with the KINCROME CONTOUR® 470-piece 17-drawer (42\") workshop kit (P1823). Plus, take home $5000 cold hard cash.",
    prizeValueLabel: "$30,000+ Value",
    cardBackgroundImage: "/images/majordraws/makita-set/makita-kincrome.webp",
    gallery: [
      { src: "/images/majordraws/makita-set/makita-kincrome.webp", alt: "Makita set with Kincrome CONTOUR toolbox" },
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
    ],
    highlights: [
      { icon: "Zap", title: "15 Power Tools", description: "Complete Makita 18V LXT brushless collection." },
      {
        icon: "Package",
        title: "MAKTRAK™ + CONTOUR®",
        description: "7-piece mobile storage plus Kincrome 470pc workshop kit.",
      },
      {
        icon: "Battery",
        title: "LXT Power System",
        description: "High-capacity 5.0Ah packs with rapid dual-port charging.",
      },
      {
        icon: "DollarSign",
        title: "$5000 Cash Bonus",
        description: "Cold hard cash included with your prize.",
      },
    ],
    specSections: [
      {
        id: "power-tools",
        label: "Power Tools & Jobsite Gear",
        summary:
          "Complete Makita 18V LXT brushless tool range covering drilling, fastening, cutting, sanding, dust control, and lighting.",
        items: MAKITA_SIDCHROME_POWER_TOOLS,
      },
      {
        id: "power-system",
        label: "Power System",
        summary: "LXT 5.0Ah batteries and rapid dual-port charger keep every tool ready.",
        items: MAKITA_SIDCHROME_POWER_SYSTEM,
      },
      {
        id: "modular-storage",
        label: "MAKTRAK™ Mobile Storage",
        summary:
          "Makita MAKTRAK™ 7-piece mobile storage system with 113.4kg capacity rolling tool chest, extra large, large, and medium tool boxes, plus deep and low profile organisers for complete jobsite organization.",
        items: MAKITA_MAKTRAK_STORAGE,
      },
      {
        id: "storage",
        label: "Tool Storage",
        summary: "KINCROME CONTOUR® 470pc workshop kit with premium trade features.",
        items: KINCROME_TOOLBOX_STORAGE,
      },
    ],
  },
  {
    slug: "ryobi-kincrome",
    label: "Kincrome CONTOUR® Toolbox, Ryobi 19pc Power Tool Kit + Ryobi LINK Storage Units, $5000 cash",
    heroHeading: "Kincrome CONTOUR® Toolbox, Ryobi 19pc Power Tool Kit + Ryobi LINK Storage Units, $5000 cash",
    heroSubheading:
      "Complete Ryobi 18V ONE+ toolkit with Ryobi LINK™ modular storage system and KINCROME CONTOUR® 470pc workshop kit plus $5000 cash.",
    summary:
      "Ryobi 18V ONE+ power and garden tools, LINK™ modular storage system, and the KINCROME CONTOUR® workshop kit plus $5000 cash.",
    detailedDescription:
      "Win the ultimate Ryobi 18V ONE+ toolkit featuring 19 power and garden tools including the 12-piece 4Ah kit (drill, impact driver, grinder, circular saw, recip saw, sander, multi-tool, vac, blower, inflator, flashlight, radio), plus Line Trimmer & Blower kit, 254mm Sliding Mitre Saw, Jigsaw, Compact Fan, 55cm Hedge Trimmer, and 36V Brushless Lawn Mower. Power everything with ONE+ HP 5Ah batteries. Transport and organize with the Ryobi LINK™ 3-piece rolling storage set, wall mountable cabinet, and 15-piece wall storage kit. Complete your workshop with the KINCROME CONTOUR® 470-piece 17-drawer (42\") workshop kit (P1823). Plus $5000 cash.",
    prizeValueLabel: "$25,000+ Value",
    cardBackgroundImage: "/images/majordraws/ryobi-set/ryobi-kincrome.webp",
    gallery: [
      { src: "/images/majordraws/ryobi-set/ryobi-kincrome.webp", alt: "Ryobi set with Kincrome CONTOUR toolbox" },
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
    ],
    highlights: [
      { icon: "Zap", title: "19 Power & Garden Tools", description: "18V ONE+ 12-piece kit plus lawn mower and garden tools." },
      {
        icon: "Package",
        title: "LINK™ + CONTOUR®",
        description: "Modular LINK™ storage plus Kincrome 470pc workshop kit.",
      },
      {
        icon: "Battery",
        title: "ONE+ Power System",
        description: "18V ONE+ batteries power 200+ tools across the range.",
      },
      {
        icon: "DollarSign",
        title: "$5000 Cash Bonus",
        description: "Cold hard cash included with your prize.",
      },
    ],
    specSections: [
      {
        id: "power-tools",
        label: "Power Tools & Garden Equipment",
        summary: "18V ONE+ 12-piece kit, mitre saw, jigsaw, fan, hedge trimmer, lawn mower and more.",
        items: RYOBI_POWER_TOOLS,
      },
      {
        id: "power-system",
        label: "Power System",
        summary: "ONE+ HP 5Ah batteries and 2A charger keep every tool ready.",
        items: RYOBI_POWER_SYSTEM,
      },
      {
        id: "modular-storage",
        label: "LINK™ Modular Storage",
        summary:
          "Ryobi LINK™ modular storage system with 3-piece rolling storage set (IP65 rated), wall mountable cabinet, and 15-piece wall storage kit for complete workshop and jobsite organization.",
        items: RYOBI_LINK_STORAGE,
      },
      {
        id: "storage",
        label: "Tool Storage",
        summary: "KINCROME CONTOUR® 470pc workshop kit with premium trade features.",
        items: KINCROME_TOOLBOX_STORAGE,
      },
    ],
  },
  {
    slug: "hikoki-sidchrome",
    label: "Sidchrome Toolbox, HiKOKI 15pc Power Tool Kit + HiKOKI Multi Cruiser Storage, $5000 cash",
    heroHeading: "Sidchrome Toolbox, HiKOKI 15pc Power Tool Kit + HiKOKI Multi Cruiser Storage, $5000 cash",
    heroSubheading:
      "Complete HiKOKI 36V/18V MultiVolt 15-piece cordless kit with the HiKOKI Multi Cruiser 3-piece storage set and the Sidchrome SCMT11402 356-piece workshop tower plus $5000 cash.",
    summary:
      "HiKOKI MultiVolt brushless power tools and nailers, the IP65 Multi Cruiser storage system, and the Sidchrome SCMT11402 356-piece cabinet plus $5000 cash.",
    detailedDescription:
      "Win the complete HiKOKI 15-piece cordless kit on the 36V/18V MultiVolt platform. The 13-piece Mega Combo brings a brushless driver drill, 1/4\" impact driver, two impact wrenches (1/2\" and 3/4\" high-torque), reciprocating saw, 185mm circular saw, SDS-Plus rotary hammer, 125mm angle grinder, oscillating multi-tool, top-handle jigsaw, blower/vacuum, cordless grease gun and a Bluetooth DAB+ jobsite radio — plus a 90mm framing nailer and a 15-gauge finishing nailer. Powered by five BSL36A18X MultiVolt batteries with two UC18YSL3 rapid chargers, and stored in the IP65-rated HiKOKI Multi Cruiser 3-piece stackable tool box set. Complete your workshop with the Sidchrome SCMT11402 356-piece tool kit & storage cabinet. Plus $5000 cold hard cash.",
    prizeValueLabel: "$30,000+ Value",
    cardBackgroundImage: "/images/majordraws/hikoki-set/hikoki-sidchrome.webp",
    gallery: [
      { src: "/images/majordraws/hikoki-set/hikoki-sidchrome.webp", alt: "HiKOKI set with Sidchrome toolbox" },
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
    ],
    highlights: [
      { icon: "Zap", title: "15 MultiVolt Tools", description: "13pc Mega Combo plus framing & finishing nailers." },
      {
        icon: "Package",
        title: "Multi Cruiser Storage",
        description: "IP65 3-piece stackable rolling tool box set.",
      },
      {
        icon: "Battery",
        title: "MultiVolt Power System",
        description: "5x BSL36A18X 18V/36V batteries + 2 rapid chargers.",
      },
      {
        icon: "Wrench",
        title: "Sidchrome 356pc Kit",
        description: "Complete hand-tool cabinet for workshop builds.",
      },
    ],
    specSections: [
      {
        id: "power-tools",
        label: "Power Tools",
        summary: "13pc MultiVolt Mega Combo brushless tools plus framing and finishing nailers.",
        items: HIKOKI_POWER_TOOLS,
      },
      {
        id: "power-system",
        label: "Power System",
        summary: "Five BSL36A18X MultiVolt batteries and two UC18YSL3 rapid chargers keep every tool ready.",
        items: HIKOKI_POWER_SYSTEM,
      },
      {
        id: "modular-storage",
        label: "Multi Cruiser Storage",
        summary: "HiKOKI Multi Cruiser 3-piece stackable, interlocking IP65 tool box set (rolling base, large, medium).",
        items: HIKOKI_CRUISER_STORAGE,
      },
      {
        id: "storage",
        label: "Workshop Storage & Hand Tools",
        summary: "Sidchrome SCMT11402 roller cabinet loaded with 356 precision hand tools and foam inlays.",
        items: MILWAUKEE_WORKSHOP_STORAGE,
      },
    ],
  },
  {
    slug: "hikoki-milwaukee",
    label: "Milwaukee Toolbox, HiKOKI 15pc Power Tool Kit + HiKOKI Multi Cruiser Storage, $5000 cash",
    heroHeading: "Milwaukee Toolbox, HiKOKI 15pc Power Tool Kit + HiKOKI Multi Cruiser Storage, $5000 cash",
    heroSubheading:
      "Complete HiKOKI 36V/18V MultiVolt 15-piece cordless kit with the HiKOKI Multi Cruiser 3-piece storage set and the Milwaukee 56\" high-capacity tool storage chest plus $5000 cash.",
    summary:
      "HiKOKI MultiVolt brushless power tools and nailers, the IP65 Multi Cruiser storage system, and the Milwaukee 56\" high-capacity combination storage plus $5000 cash.",
    detailedDescription:
      "Win the complete HiKOKI 15-piece cordless kit on the 36V/18V MultiVolt platform. The 13-piece Mega Combo brings a brushless driver drill, 1/4\" impact driver, two impact wrenches (1/2\" and 3/4\" high-torque), reciprocating saw, 185mm circular saw, SDS-Plus rotary hammer, 125mm angle grinder, oscillating multi-tool, top-handle jigsaw, blower/vacuum, cordless grease gun and a Bluetooth DAB+ jobsite radio — plus a 90mm framing nailer and a 15-gauge finishing nailer. Powered by five BSL36A18X MultiVolt batteries with two UC18YSL3 rapid chargers, and stored in the IP65-rated HiKOKI Multi Cruiser 3-piece stackable tool box set. Complete your setup with the Milwaukee 56\" High Capacity Combination steel tool storage. Plus $5000 cold hard cash.",
    prizeValueLabel: "$30,000+ Value",
    cardBackgroundImage: "/images/majordraws/hikoki-set/hikoki-milwaukee.webp",
    gallery: [
      { src: "/images/majordraws/hikoki-set/hikoki-milwaukee.webp", alt: "HiKOKI set with Milwaukee toolbox" },
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
    ],
    highlights: [
      { icon: "Zap", title: "15 MultiVolt Tools", description: "13pc Mega Combo plus framing & finishing nailers." },
      {
        icon: "Package",
        title: "Multi Cruiser Storage",
        description: "IP65 3-piece stackable rolling tool box set.",
      },
      {
        icon: "Battery",
        title: "MultiVolt Power System",
        description: "5x BSL36A18X 18V/36V batteries + 2 rapid chargers.",
      },
      {
        icon: "Package",
        title: "Milwaukee 56\" Storage",
        description: "High-capacity combination steel tool storage chest & trolley.",
      },
    ],
    specSections: [
      {
        id: "power-tools",
        label: "Power Tools",
        summary: "13pc MultiVolt Mega Combo brushless tools plus framing and finishing nailers.",
        items: HIKOKI_POWER_TOOLS,
      },
      {
        id: "power-system",
        label: "Power System",
        summary: "Five BSL36A18X MultiVolt batteries and two UC18YSL3 rapid chargers keep every tool ready.",
        items: HIKOKI_POWER_SYSTEM,
      },
      {
        id: "modular-storage",
        label: "Multi Cruiser Storage",
        summary: "HiKOKI Multi Cruiser 3-piece stackable, interlocking IP65 tool box set (rolling base, large, medium).",
        items: HIKOKI_CRUISER_STORAGE,
      },
      {
        id: "storage",
        label: "Tool Storage",
        summary: "Milwaukee 56\" High Capacity Combination steel storage with electronic lock and power strip.",
        items: MILWAUKEE_TOOLBOX_STORAGE,
      },
    ],
  },
  {
    slug: "hikoki-kincrome",
    label: "Kincrome CONTOUR® Toolbox, HiKOKI 15pc Power Tool Kit + HiKOKI Multi Cruiser Storage, $5000 cash",
    heroHeading: "Kincrome CONTOUR® Toolbox, HiKOKI 15pc Power Tool Kit + HiKOKI Multi Cruiser Storage, $5000 cash",
    heroSubheading:
      "Complete HiKOKI 36V/18V MultiVolt 15-piece cordless kit with the HiKOKI Multi Cruiser 3-piece storage set and the KINCROME CONTOUR® 470pc 17-drawer workshop kit plus $5000 cash.",
    summary:
      "HiKOKI MultiVolt brushless power tools and nailers, the IP65 Multi Cruiser storage system, and the KINCROME CONTOUR® workshop chest & trolley plus $5000 cash.",
    detailedDescription:
      "Win the complete HiKOKI 15-piece cordless kit on the 36V/18V MultiVolt platform. The 13-piece Mega Combo brings a brushless driver drill, 1/4\" impact driver, two impact wrenches (1/2\" and 3/4\" high-torque), reciprocating saw, 185mm circular saw, SDS-Plus rotary hammer, 125mm angle grinder, oscillating multi-tool, top-handle jigsaw, blower/vacuum, cordless grease gun and a Bluetooth DAB+ jobsite radio — plus a 90mm framing nailer and a 15-gauge finishing nailer. Powered by five BSL36A18X MultiVolt batteries with two UC18YSL3 rapid chargers, and stored in the IP65-rated HiKOKI Multi Cruiser 3-piece stackable tool box set. Complete your workshop with the KINCROME CONTOUR® 470-piece 17-drawer (42\") workshop kit (P1823). Plus $5000 cold hard cash.",
    prizeValueLabel: "$30,000+ Value",
    cardBackgroundImage: "/images/majordraws/hikoki-set/hikoki-kincrome.webp",
    gallery: [
      { src: "/images/majordraws/hikoki-set/hikoki-kincrome.webp", alt: "HiKOKI set with Kincrome CONTOUR toolbox" },
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
    ],
    highlights: [
      { icon: "Zap", title: "15 MultiVolt Tools", description: "13pc Mega Combo plus framing & finishing nailers." },
      {
        icon: "Package",
        title: "Multi Cruiser Storage",
        description: "IP65 3-piece stackable rolling tool box set.",
      },
      {
        icon: "Battery",
        title: "MultiVolt Power System",
        description: "5x BSL36A18X 18V/36V batteries + 2 rapid chargers.",
      },
      {
        icon: "Wrench",
        title: "Kincrome 470pc Kit",
        description: "CONTOUR® 17-drawer workshop chest & trolley.",
      },
    ],
    specSections: [
      {
        id: "power-tools",
        label: "Power Tools",
        summary: "13pc MultiVolt Mega Combo brushless tools plus framing and finishing nailers.",
        items: HIKOKI_POWER_TOOLS,
      },
      {
        id: "power-system",
        label: "Power System",
        summary: "Five BSL36A18X MultiVolt batteries and two UC18YSL3 rapid chargers keep every tool ready.",
        items: HIKOKI_POWER_SYSTEM,
      },
      {
        id: "modular-storage",
        label: "Multi Cruiser Storage",
        summary: "HiKOKI Multi Cruiser 3-piece stackable, interlocking IP65 tool box set (rolling base, large, medium).",
        items: HIKOKI_CRUISER_STORAGE,
      },
      {
        id: "storage",
        label: "Tool Storage",
        summary: "KINCROME CONTOUR® 470pc 17-drawer workshop kit with premium trade features.",
        items: KINCROME_TOOLBOX_STORAGE,
      },
    ],
  },
  {
    slug: "cash-prize",
    label: "$10,000 Tax Free Cash",
    heroHeading: "$10,000 Tax Free Cash",
    heroSubheading: "Pure cash prize - no tools, no hassle, just $10,000 straight to your bank account.",
    summary: "$10,000 cold hard cash prize - take the money and run.",
    detailedDescription:
      "Win $10,000 in cold hard cash! No tools, no equipment, no strings attached. Just a straight $10,000 cash prize deposited directly to your bank account. Use it however you want - pay bills, take a vacation, invest in your future, or buy whatever you need. The choice is yours.",
    prizeValueLabel: "$10,000 Cash",
    gallery: [{ src: "/images/majordraws/cash-prize/cash-prize-10000.webp", alt: "$10,000 cash prize" }],
    highlights: [
      {
        icon: "DollarSign",
        title: "$10,000 Cash",
        description: "Pure cash prize - no tools included.",
      },
      {
        icon: "Banknote",
        title: "Direct Deposit",
        description: "Money goes straight to your bank account.",
      },
      {
        icon: "Gift",
        title: "Spend It Anywhere",
        description: "Use the cash however you want.",
      },
      {
        icon: "CreditCard",
        title: "No Restrictions",
        description: "Complete freedom to use as you please.",
      },
    ],
    specSections: [
      {
        id: "cash-prize",
        label: "Cash Prize Details",
        summary: "Simple cash prize with no equipment or tools included.",
        items: [
          {
            name: "$10,000 Cash Prize",
            description:
              "A straight $10,000 cash prize with no tools or equipment included. The money will be deposited directly to your bank account upon verification.",
            specifications: [
              "Prize Amount: $10,000 AUD",
              "Payment Method: Direct bank transfer",
              "Verification: Standard winner verification process required",
              "Tax: Winner responsible for applicable taxes",
              "No tools or equipment included",
              "Pure cash prize only",
            ],
          },
        ],
      },
    ],
  },
];

export function getPrizeBySlug(slug: string): PrizeCatalogEntry | undefined {
  return PRIZE_CATALOG.find((prize) => prize.slug === slug);
}

export function listPrizes(): PrizeCatalogEntry[] {
  return PRIZE_CATALOG.slice();
}

/**
 * Get full prize details from a slug
 * Returns the complete PrizeCatalogEntry for the given slug
 * @param slug - The prize slug to get details for
 * @returns The prize catalog entry, or undefined if slug is invalid
 */
export function getPrizeDetails(slug: PrizeSlug | string | undefined): PrizeCatalogEntry | undefined {
  if (!slug) return undefined;
  return getPrizeBySlug(slug);
}