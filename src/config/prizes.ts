/**
 * Lucide icon name so we can resolve dynamically without importing every icon upfront.
 * Using string keys keeps the catalog serialisable and easy for newer developers to update.
 */
export type LucideIconName = keyof typeof import("lucide-react");

export interface PrizeMedia {
  src: string;
  alt: string;
}

export interface PrizeHighlight {
  icon: LucideIconName;
  title: string;
  description: string;
}

export interface PrizeSpecItem {
  name: string;
  model?: string;
  description?: string;
  specifications?: string[];
  includes?: string[];
}

export interface PrizeSpecSection {
  id: string;
  label: string;
  summary?: string;
  items: PrizeSpecItem[];
}

export interface PrizeCatalogEntry {
  slug: PrizeSlug;
  label: string;
  heroHeading: string;
  heroSubheading?: string;
  summary: string;
  detailedDescription: string;
  prizeValueLabel?: string;
  gallery: PrizeMedia[];
  highlights: PrizeHighlight[];
  specSections: PrizeSpecSection[];
  cardBackgroundImage?: string; // Optional background image for toggle cards
}

export type PrizeSlug = "milwaukee-sidchrome" | "dewalt-sidchrome" | "makita-sidchrome" | "cash-prize";

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
/**
 * Prize catalog entries are the single source of truth for prize imagery/copy.
 * Add new prize packs here – frontend components resolve everything dynamically.
 */
export const PRIZE_CATALOG: PrizeCatalogEntry[] = [
  {
    slug: "milwaukee-sidchrome",
    label: "Sidchrome Toolbox, Milwaukee Power Tool Kit, $5000 cash",
    heroHeading: "Sidchrome Toolbox, Milwaukee Power Tool Kit, $5000 cash",
    heroSubheading:
      "Complete Milwaukee 18V FUEL™ professional toolkit with Sidchrome SCMT11402 356-piece workshop tower plus $5000 cash.",
    summary:
      "Milwaukee 18V FUEL™ power tools, REDLITHIUM™ battery ecosystem, and the Sidchrome SCMT11402 356-piece storage cabinet plus $5000 cash.",
    detailedDescription:
      "Win the ultimate Milwaukee 18V FUEL™ professional toolkit featuring 13 premium cordless power tools including a hammer drill, impact driver, angle grinder, jigsaw, reciprocating saw, circular saw, oscillating multi-tool, jobsite speaker, compact battery light, blower, mid-torque impact wrench, random orbital sander, and pruning saw. Keep every skin running with Milwaukee REDLITHIUM™ 5.0Ah battery packs, then organise the lot inside the Sidchrome SCMT11402 356-piece cabinet stocked with precision hand tools, foam inlays, and mobile workshop storage.",
    prizeValueLabel: "$35,000+ Value",
    cardBackgroundImage: "/images/majordraws/prize1/sidchrome-milwaukee-toggle.png",
    gallery: [
      { src: "/images/majordraws/prize1/Milwaukee 13pc Kit - Giveaway 1.webp", alt: "Milwaukee 13 piece kit" },
      { src: "/images/majordraws/prize1/Sidchrome SCMT11402.jpg", alt: "Sidchrome 356 piece tool kit and storage" },
      { src: "/images/majordraws/prize1/Milwaukee 1_4 Impact Gun.webp", alt: "Milwaukee impact gun" },
      { src: "/images/majordraws/prize1/Milwaukee 18V Charging Station.webp", alt: "Milwaukee charging station" },
      { src: "/images/majordraws/prize1/Milwaukee 5_ Grinder.webp", alt: "Milwaukee grinder" },
      { src: "/images/majordraws/prize1/Milwaukee 5.0AH battery.webp", alt: "Milwaukee 5.0Ah battery" },
      { src: "/images/majordraws/prize1/Milwaukee 6.0AH battery.webp", alt: "Milwaukee 6.0Ah battery" },
      { src: "/images/majordraws/prize1/Milwaukee Blowgun.webp", alt: "Milwaukee blowgun" },
      { src: "/images/majordraws/prize1/Milwaukee Carry Bag.webp", alt: "Milwaukee carry bag" },
      { src: "/images/majordraws/prize1/Milwaukee Chainsaw.webp", alt: "Milwaukee pruning saw" },
      { src: "/images/majordraws/prize1/Milwaukee Circular Saw.webp", alt: "Milwaukee circular saw" },
      { src: "/images/majordraws/prize1/Milwaukee Drill 18V.webp", alt: "Milwaukee hammer drill" },
      { src: "/images/majordraws/prize1/Milwaukee Jigsaw.webp", alt: "Milwaukee jigsaw" },
      { src: "/images/majordraws/prize1/Milwaukee Radio.webp", alt: "Milwaukee jobsite radio" },
      { src: "/images/majordraws/prize1/Milwaukee Right Angle.webp", alt: "Milwaukee right angle tool" },
      { src: "/images/majordraws/prize1/Milwaukee Saber Saw .webp", alt: "Milwaukee reciprocating saw" },
      { src: "/images/majordraws/prize1/Milwaukee Sander.webp", alt: "Milwaukee orbital sander" },
      { src: "/images/majordraws/prize1/Milwaukee Stubby Impact 1_2.webp", alt: "Milwaukee mid torque impact wrench" },
      { src: "/images/majordraws/prize1/Milwaukee Work Light.webp", alt: "Milwaukee work light" },
    ],
    highlights: [
      { icon: "Zap", title: "13 Power Tools", description: "Complete Milwaukee 18V FUEL™ collection." },
      {
        icon: "Package",
        title: "Sidchrome 356pc Kit",
        description: "Complete hand-tool cabinet for workshop builds.",
      },
      {
        icon: "Battery",
        title: "REDLITHIUM™ Power System",
        description: "High-output 5.0Ah packs keep every skin running.",
      },
      {
        icon: "Wrench",
        title: "Workshop Ready",
        description: "Organised storage, lighting, and accessories for any task.",
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
        id: "storage",
        label: "Workshop Storage & Hand Tools",
        summary: "Sidchrome SCMT11402 roller cabinet loaded with 356 precision hand tools and foam inlays.",
        items: MILWAUKEE_WORKSHOP_STORAGE,
      },
    ],
  },
  {
    slug: "dewalt-sidchrome",
    label: "Sidchrome Toolbox, DeWalt Power Tool Kit, $5000 cash",
    heroHeading: "Sidchrome Toolbox, DeWalt Power Tool Kit, $5000 cash",
    heroSubheading:
      "Heavy-duty DeWalt FlexVolt and XR cordless range with Sidchrome SCMT11402 356-piece toolkit plus $5000 cash.",
    summary:
      "Heavy-duty DeWalt FlexVolt cordless lineup, premium storage, and a 356-piece Sidchrome toolkit plus $5000 cash.",
    detailedDescription:
      "Build your dream site setup with DeWalt's FlexVolt and XR cordless range spanning hammer drills, impact drivers, rotary hammers, saws, grinders, dust control, and lighting. Keep everything powered with high-capacity FlexVolt batteries, dual-port charging, and secure transport using TSTAK storage, wheeled tool bags, and the Sidchrome 356-piece professional hand-tool kit.",
    prizeValueLabel: "$30,000+ Value",
    gallery: [
      { src: "/images/majordraws/prize2/DCZ1401P2X2_K1.jpg", alt: "DeWalt prize collection" },
      { src: "/images/majordraws/prize2/Sidchrome SCMT11402.jpg", alt: "Sidchrome 356 piece tool kit" },
      { src: "/images/majordraws/prize2/Dewalt 9.0AH Battery.jpeg", alt: "DeWalt 9.0Ah FlexVolt battery" },
      { src: "/images/majordraws/prize2/Dewalt 18v Battery.jpeg", alt: "DeWalt 18V XR 5.0Ah battery" },
      { src: "/images/majordraws/prize2/Dewalt Bag 2.jpeg", alt: "DeWalt wheeled tool bag interior" },
      { src: "/images/majordraws/prize2/Dewalt Bag.jpeg", alt: "DeWalt wheeled tool bag exterior" },
      { src: "/images/majordraws/prize2/Dewalt Blower.jpeg", alt: "DeWalt 18V XR blower" },
      { src: "/images/majordraws/prize2/Dewalt Charging Station.jpeg", alt: "DeWalt dual port FlexVolt charger" },
      { src: "/images/majordraws/prize2/Dewalt Circular Saw.jpeg", alt: "DeWalt FlexVolt circular saw" },
      { src: "/images/majordraws/prize2/Dewalt Drill 2.jpeg", alt: "DeWalt 18V XR hammer drill" },
      { src: "/images/majordraws/prize2/Dewalt Drill 3.jpeg", alt: "DeWalt drill kit angle view" },
      { src: "/images/majordraws/prize2/Dewalt Drill 4.jpeg", alt: "DeWalt hammer drill close up" },
      { src: "/images/majordraws/prize2/Dewalt Drill 5.jpeg", alt: "DeWalt hammer drill side profile" },
      { src: "/images/majordraws/prize2/Dewalt Drill.jpeg", alt: "DeWalt drill with handle" },
      { src: "/images/majordraws/prize2/Dewalt Grinder.jpeg", alt: "DeWalt FlexVolt grinder" },
      { src: "/images/majordraws/prize2/Dewalt Hammer Drill.jpeg", alt: "DeWalt SDS rotary hammer" },
      { src: "/images/majordraws/prize2/Dewalt Impact Driver 2.jpeg", alt: "DeWalt impact driver front" },
      { src: "/images/majordraws/prize2/Dewalt Impact Driver 3.jpeg", alt: "Compact DeWalt impact driver profile" },
      { src: "/images/majordraws/prize2/Dewalt Impact Driver.jpeg", alt: "DeWalt impact driver" },
      { src: "/images/majordraws/prize2/Dewalt Impact Gun.jpeg", alt: "DeWalt high torque impact wrench" },
      { src: "/images/majordraws/prize2/Dewalt Jigsaw.jpeg", alt: "DeWalt XR jigsaw" },
      { src: "/images/majordraws/prize2/Dewalt Multi Tool.jpeg", alt: "DeWalt XR oscillating multi-tool" },
      { src: "/images/majordraws/prize2/Dewalt Planer 2.jpeg", alt: "DeWalt planer angle view" },
      { src: "/images/majordraws/prize2/Dewalt Planer 3.jpeg", alt: "DeWalt planer rear view" },
      { src: "/images/majordraws/prize2/Dewalt Planer.jpeg", alt: "DeWalt XR planer" },
      { src: "/images/majordraws/prize2/Dewalt Radio 2.jpeg", alt: "DeWalt TSTAK jobsite radio front" },
      { src: "/images/majordraws/prize2/Dewalt Radio.jpeg", alt: "DeWalt TSTAK jobsite radio top view" },
      { src: "/images/majordraws/prize2/Dewalt Recip Saw.jpeg", alt: "DeWalt FlexVolt reciprocating saw" },
      { src: "/images/majordraws/prize2/Dewalt Sander 2.jpeg", alt: "DeWalt XR orbital sander detail" },
      { src: "/images/majordraws/prize2/Dewalt Sander.jpeg", alt: "DeWalt XR orbital sander" },
      { src: "/images/majordraws/prize2/Dewalt Stax Carry Kit.jpeg", alt: "DeWalt TSTAK storage case" },
      { src: "/images/majordraws/prize2/Dewalt Stax Kit 2.jpeg", alt: "DeWalt TSTAK storage stack" },
      { src: "/images/majordraws/prize2/Dewalt Stax Kit 3.jpeg", alt: "Loaded DeWalt TSTAK storage" },
      { src: "/images/majordraws/prize2/Dewalt Vacuum.jpeg", alt: "DeWalt XR stick vacuum" },
    ],
    highlights: [
      {
        icon: "Zap",
        title: "FlexVolt Muscle",
        description: "54V tools for circular, rotary, and reciprocating power.",
      },
      { icon: "Package", title: "Sidchrome 356pc Kit", description: "Complete hand-tool cabinet for workshop builds." },
      {
        icon: "Battery",
        title: "High-Capacity Power",
        description: "FlexVolt + XR batteries with twin-port fast charging.",
      },
      { icon: "Package", title: "Storage Sorted", description: "TSTAK storage, wheeled tool bag, and pro cabinet." },
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
        id: "storage",
        label: "Storage & Hand Tools",
        summary: "Heavy-duty transport, organisation, and comprehensive Sidchrome hand-tool coverage.",
        items: DEWALT_SIDCHROME_STORAGE,
      },
    ],
  },
  {
    slug: "makita-sidchrome",
    label: "Sidchrome Toolbox, Makita Power Tool Kit, $5000 cash",
    heroHeading: "Sidchrome Toolbox, Makita Power Tool Kit, $5000 cash",
    heroSubheading:
      "Complete Makita 18V LXT brushless professional toolkit with Sidchrome SCMT11402 356-piece workshop tower plus $5000 cash.",
    summary:
      "Makita 18V LXT brushless power tools, advanced battery ecosystem, and the Sidchrome SCMT11402 356-piece storage cabinet plus $5000 cash.",
    detailedDescription:
      "Win the ultimate Makita 18V LXT professional toolkit featuring 15 premium cordless power tools including a hammer drill, impact driver, angle grinder, rotary hammer, circular saw, reciprocating saw, multi-tool, impact wrench, random orbital sander, stick vacuum, jigsaw, planer, blower, jobsite radio, and long-distance flashlight. Keep every tool running with Makita LXT 5.0Ah battery packs and rapid dual-port charging, then organise the lot inside the Sidchrome SCMT11402 356-piece cabinet stocked with precision hand tools, foam inlays, and mobile workshop storage. Plus, take home $5000 cold hard cash.",
    prizeValueLabel: "$30,000+ Value",
    gallery: [
      { src: "/images/majordraws/prize3/Makita15pc Giveaway.png", alt: "Makita 15 piece tool collection overview" },
      { src: "/images/majordraws/prize2/Sidchrome SCMT11402.jpg", alt: "Sidchrome 356 piece tool kit" },
      { src: "/images/majordraws/prize3/dhp486z-001.jpg", alt: "Makita DHP486Z hammer drill" },
      { src: "/images/majordraws/prize3/dtd173z-001.jpg", alt: "Makita DTD173Z impact driver" },
      { src: "/images/majordraws/prize3/dga508z-001.jpg", alt: "Makita DGA508Z angle grinder" },
      { src: "/images/majordraws/prize3/dhr242z-001.jpg", alt: "Makita DHR242Z rotary hammer" },
      { src: "/images/majordraws/prize3/dhs680z-001.jpg", alt: "Makita DHS680Z circular saw" },
      { src: "/images/majordraws/prize3/djr187z-001.jpg", alt: "Makita DJR187Z reciprocating saw" },
      { src: "/images/majordraws/prize3/dtm52zx3-001.jpg", alt: "Makita DTM52ZX3 multi-tool" },
      { src: "/images/majordraws/prize3/dtw700z-001.jpg", alt: "Makita DTW700Z impact wrench" },
      { src: "/images/majordraws/prize3/dbo180z-001.jpg", alt: "Makita DBO180Z orbital sander" },
      { src: "/images/majordraws/prize3/dcl283zbx1-001.jpg", alt: "Makita DCL283ZBX1 stick vacuum" },
      { src: "/images/majordraws/prize3/djv184z-001.jpg", alt: "Makita DJV184Z jigsaw" },
      { src: "/images/majordraws/prize3/dkp181z-001.jpg", alt: "Makita DKP181Z planer" },
      { src: "/images/majordraws/prize3/dub185z-001.jpg", alt: "Makita DUB185Z blower" },
      { src: "/images/majordraws/prize3/mr002gz-001.jpg", alt: "Makita MR002GZ jobsite radio" },
      { src: "/images/majordraws/prize3/dml812-002.jpg", alt: "Makita DML812 flashlight" },
      { src: "/images/majordraws/prize3/bl1850b-001.jpg", alt: "Makita BL1850B batteries" },
      { src: "/images/majordraws/prize3/dc18rd-001.jpg", alt: "Makita DC18RD charger" },
      { src: "/images/majordraws/prize3/199936-9-001.jpg", alt: "Makita tool carry bags" },
    ],
    highlights: [
      { icon: "Zap", title: "15 Power Tools", description: "Complete Makita 18V LXT brushless collection." },
      {
        icon: "Package",
        title: "Sidchrome 356pc Kit",
        description: "Complete hand-tool cabinet for workshop builds.",
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
        id: "storage",
        label: "Storage & Hand Tools",
        summary: "Heavy-duty transport bags, organisation, and comprehensive Sidchrome hand-tool coverage.",
        items: MAKITA_SIDCHROME_STORAGE,
      },
    ],
  },
  {
    slug: "cash-prize",
    label: "$10000 cold hard cash",
    heroHeading: "$10000 cold hard cash",
    heroSubheading: "Pure cash prize - no tools, no hassle, just $10,000 straight to your bank account.",
    summary: "$10,000 cold hard cash prize - take the money and run.",
    detailedDescription:
      "Win $10,000 in cold hard cash! No tools, no equipment, no strings attached. Just a straight $10,000 cash prize deposited directly to your bank account. Use it however you want - pay bills, take a vacation, invest in your future, or buy whatever you need. The choice is yours.",
    prizeValueLabel: "$10,000 Cash",
    gallery: [{ src: "/images/grand-draw.jpg", alt: "$10,000 cash prize" }],
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

export const DEFAULT_PRIZE_SLUG: PrizeSlug = "milwaukee-sidchrome";

export function getPrizeBySlug(slug: string): PrizeCatalogEntry | undefined {
  return PRIZE_CATALOG.find((prize) => prize.slug === slug);
}

export function listPrizes(): PrizeCatalogEntry[] {
  return PRIZE_CATALOG.slice();
}
