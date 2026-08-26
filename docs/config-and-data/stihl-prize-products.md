# STIHL prize products — source data for the draw-10 catalogue

**What this is.** Descriptions and technical specifications for the 12 STIHL products in the
draw-10 prize, taken from **stihl.com.au** (including its `shop.` subdomain) on **2026-08-25**.
This is the source you build `PRIZE_CATALOG` / `PRIZE_SUMMARIES` spec sections from when the STIHL
toolset is wired — it is **not** itself wired into anything.

**How it was gathered.** One researcher per product pulled the official AU page, then a **separate
verifier re-opened the same page** and checked every figure against it. That second pass mattered:
it caught a fabricated `810 m³/h` air throughput on the BG 86 (the real page says 755 round /
620 flat), a fabricated `6.5 A` charging current on the AL 301, a wrong `6.3 kg` on the MS 391, and
a fabricated shop SKU on the AP 300 S. **Anything either pass could not find on a real page was
dropped rather than guessed.**

## Rules for using this file

1. **Australian pages only.** Model specs differ by market and the differences are real — the
   RMA 353 V is a 75 L / 7-height mower in the US and a 60 l / 8-stage mower here; the AL 301's
   6.5 A and active cooling are on the UK page and not the AU one. Never fill an AU gap from an
   overseas listing.
2. **A missing spec is fine; a wrong one is not.** Where STIHL AU publishes nothing (ASA 20 weight,
   HS 45 tank capacity, AP 300 S voltage), the field is absent on purpose. Leave it absent.
3. **Quote, don't compute.** Every figure below is as printed on the page, including STIHL's own
   footnotes and unit duplications.
4. **Re-verify before launch.** Prices and variants move. Prices here are indicative only and should
   not be published as prize values.

> **Legal (CLAUDE.md §11):** copy derived from this file is customer-facing. Keep it factual, and
> never let prize descriptions drift into gambling framing.

---

## 1. Product table

| Model | Full name (STIHL AU) | Category | Power | Source |
|---|---|---|---|---|
| MS 391 | MS 391 FarmBoss® Petrol Chainsaw | Chainsaw | Petrol | Official (shop.stihl.com.au) — **but most numeric specs are NOT on that page**; see gaps |
| FS 91 R (prize list: FS 91 R-Z) | FS 91 R | Brushcutter | Petrol | Official (www.stihl.com.au) |
| BG 86 | BG 86 Petrol Blower | Blower | Petrol | Official (www.stihl.com.au) |
| HS 45 (600 mm) | HS 45 Petrol Hedge Trimmer | Hedge trimmer | Petrol | Official (www.stihl.com.au) |
| GTA 26 | GTA 26 Battery Pruner AS System | Pruner (Pruners and Shears) | Battery — STIHL AS system | Official (www.stihl.com.au) |
| RCA 20 | RCA 20 Battery Pressure Washer AS System (item: "RCA 20 Handheld Pressure Cleaner Skin Only") | Pressure washer | Battery — STIHL AS system | Official (www.stihl.com.au) |
| KOA 20 | KOA 20 Battery Air Inflator Skin Only | Air inflator / compressor | Battery — STIHL AS system | Official (www.stihl.com.au) |
| SEA 20 | SEA 20 Battery Vacuum Cleaner AS System | Handheld vacuum | Battery — STIHL AS system | Official (www.stihl.com.au) |
| ASA 20 | ASA 20 Battery Secateurs AS-System Skin Only | Secateurs / pruning shears | Battery — STIHL AS system | Official (shop.stihl.com.au) |
| RMA 353 V | RMA 353 V Battery Lawn Mower ALLPRO System | Lawn mower (self-propelled) | Battery — STIHL AP / ALLPRO system, 36 V | Official (www.stihl.com.au) |
| AP 300 S | AP 300 S Battery with Bluetooth | Battery | Battery — STIHL AP system | Official (shop.stihl.com.au) |
| AL 301 | AL 301 Quick Charger | Charger | Mains 220–240 V | Official (www.stihl.com.au) |

---

## 2. Per-product detail

### Petrol tools

#### MS 391 FarmBoss® Petrol Chainsaw

**Description**
A petrol chainsaw built for farm work, landscape maintenance, firewood and construction timber, supplied in Australia with a 50 cm (20") bar. It runs a STIHL 2-MIX engine and has a decompression valve to reduce starter-cord effort, a controlled-delivery oil pump and side-mounted chain tensioning.

**Specifications** (confirmed)
- Power: 3.3 kW (page body copy also states 4.5 hp)
- Power-to-weight ratio: 1.9 kg/kW
- Power source: Petrol
- Displacement: 64.1 cm³ — *confirmed on STIHL's spec sheet and Australian dealer listings, NOT on the cited shop.stihl.com.au page*

**Configuration**
- 50 cm / 20" guide bar — *corroborated by Australian dealer listings for part 1140 200 0689, not readable on the cited page*
- No "what's in the box" list is published; chain type is not stated.

**Source URL**
https://shop.stihl.com.au/ms-391-farmboss-petrol-chainsaw — STIHL Australia's own online shop (a stihl.com.au subdomain). The marketing page www.stihl.com.au/en/p/chainsaws-ms-391-1615 is behind a bot challenge and returns an empty body.

**Dropped as unconfirmed:** weight (6.3 kg was wrong; 6.2 kg appears on dealer pages only), 4.4 bhp, sound pressure 105 dB(A), sound power 117 dB(A), system weight 7.78 kg, length with bumper strike 458 mm, "User group: Professional" (STIHL AU files this saw under **Landowner** chainsaws).

---

#### FS 91 R

**Description**
A petrol brushcutter running STIHL's 4-MIX engine on a rigid drive shaft, with a loop handle STIHL AU lists as suited to working in confined spaces. It is supplied with the AutoCut C 26-2 mowing head and a double-shoulder harness, and takes a range of grass cutting blades for tougher grass and weeds.

**Specifications** (all verified verbatim on the official page, FS 91 R variant selected)
- Displacement: 28.4 cm³
- Power: 0.95 kW
- Device weight without refuelling: 5.5 kg (page footnote: without cutting tool and protection)
- Device length without cutting tool: 180 cm
- Cutting circle diameter: 420 mm
- Standard cutting attachment: AutoCut C 26-2
- Tank capacity: 0.710 l (710 cm³)
- Sound pressure level: 96 dB(A) and 94 dB(A) (two rows under the same label; K-value per Directive 2006/42/EC = 2.0 dB(A))
- Part No. 41802000728

**Includes**
- AutoCut 26-2 mowing head (variant is listed as "Petrol Brushcutter – FS 91 R – AutoCut 26-2")
- Double-shoulder harness — page states it is "supplied as standard"

**Source URL**
https://www.stihl.com.au/en/p/grass-trimmers-brushcutters-fs-91-petrol-brushcutter-75074 — official. This URL **is** the FS 91 R page (HTML title "FS 91 R | STIHL Australia"), loading with the R variant preselected; only the H1 is the shared family heading "FS 91 Petrol Brushcutter". The bike-handle FS 91 is a separate URL (…-fs-91-75071).

*Price on the official page 25 Aug 2026: $649.00 (was $699.00), incl. 10% GST; available from STIHL Approved Dealers.*

---

#### BG 86 Petrol Blower

**Description**
A handheld petrol blower with a 27.2 cm³ STIHL 2-MIX two-stroke engine, weighing 4.4 kg without fuel. It runs a round nozzle or a flat nozzle for a wide air stream, has an HD2 filter for dusty work, and converts to a leaf vacuum and shredder with STIHL's separately sold vacuum attachment kit.

**Specifications** (all on the official page's expanded technical details table)
- Power source: Petrol; STIHL 2-MIX two-stroke engine
- Displacement: 27.2 cm³
- Device weight without refuelling: 4.4 kg
- Blowing force with round nozzle: 15 N (page footnote: force in newtons to compare blower performance)
- Air throughput with round nozzle: 755 m³/h
- Air throughput with flat nozzle: 620 m³/h
- Max. air velocity with round nozzle: 76 m/s
- Max. air velocity with flat nozzle: 89 m/s
- Sound pressure level, 15 m distance: 70 dB(A) (measured per ANSI/OPEI B175.2-2012 (R2019))
- Part No. 42410111762

**Includes** — not published. The page says only that you "can work with the round nozzle or opt for the flat nozzle"; STIHL AU separately sells a "Curved flat nozzle (BG 56/86 BGE 61/81)" accessory at $29.00. Vacuum attachment kit ($113.00) and gutter-cleaning kit ($82.00) are separate accessories.

**Source URL**
https://www.stihl.com.au/en/p/blowers-shredder-vacs-bg-86-petrol-blower-2391 — official. RRP $479.00.

**Dropped as unconfirmed:** tank volume 440 ml; the dealer-sourced 810 m³/h "max air throughput" (wrong); dealer 90/104 dB(A) sound figures.

---

#### HS 45 Petrol Hedge Trimmer (600 mm)

**Description**
An entry-level petrol hedge trimmer for shrubs and chest-height hedges, with double-sided cutting blades shaped to cut horizontally, vertically and into corners. It has single-lever operation, a manual fuel pump to shorten starting, STIHL's anti-vibration system, and a carrying ring in the handle for hanging it on a wall.

**Specifications** (official technical details table)
- Displacement: 27.2 cm³
- Power: 0.75 kW (page also lists engine power 1 bhp)
- Stroke rate: 4000 r/min
- Cutting length: 45 / 60 cm (600 mm variant = 60 cm)
- Tooth spacing: 30 mm
- Device weight without refuelling: 4.8 / 5.1 kg (600 mm variant = 5.1 kg)

**Includes** — no scope-of-delivery list is published.

**Source URL**
https://www.stihl.com.au/en/p/hedge-trimmers-shears-hs-45-petrol-hedge-trimmer-75?aID=42280112948 — official (600 mm variant deep link).

*Official variants and RRP: 450 mm (Part No. 42280112947) $379.00; 600 mm (Part No. 42280112948) $429.00, incl. 10% GST. Variant items are labelled "HS 45-Z Hedge trimmer, 600mm/24\"".*

**No fuel-tank capacity, sound or vibration figures are published on the AU page** — omitted. The widely circulated dealer figure of 5.0 kg contradicts STIHL AU and is not used.

---

### Cordless tools

#### GTA 26 Battery Pruner AS System

**Description**
A compact handheld battery pruner on STIHL's AS system, for pruning trees and shrubs around the home and shredding green cuttings. This kit version comes ready to work with the AS 2 lithium-ion battery and AL 1 charger, and the sprocket cover and wing nut let you change the chain without tools.

**Specifications** (official page, full table)
- Cordless power system: AS
- Recommended battery: AS 2
- Rated voltage: 11 V; Max. voltage: 12 V
- Power consumption: 0.30 kW
- Power: 0.18 kW (footnote: mechanical power as comparative value to petrol appliance)
- Device weight without battery: 1.1 kg
- Bar length: 10 cm (4 in) (footnote: actual cutting length is shorter than the specified bar length)
- Chain pitch: 1/4"P; Groove width: 1.10 mm
- Max. cuts per battery charge, AS 2: 70 (footnote: may vary depending on the application)
- AS 2 battery is certified to protection class IPX4

**Includes** ("Included in the set", verbatim)
- 1 STIHL GTA 26 battery garden pruner with flexible guard
- 1 STIHL AS 2 lithium-ion battery
- 1 AL 1 standard charger
- 1 STIHL Rollomatic Light guide bar for GTA 26
- 1 STIHL 1/4" PM3 saw chain, 10 cm
- 1 Multioil Bio, 50 ml

**Source URL**
https://www.stihl.com.au/en/p/pruners-shears-gta-26-battery-pruner-as-system-107836 — official. Part No. GA010116915, RRP $279.00 incl. 10% GST, available from STIHL Approved Dealers.

---

#### RCA 20 Battery Pressure Washer AS System — Skin Only

**Description**
A compact handheld cordless pressure washer on STIHL's AS battery system, weighing 1.3 kg with an operating pressure of 22 bar. It can draw water from a bucket through the supplied vacuum hose or the water transport container, so it runs without a power point or a tap connection. **This part is the skin only — no battery and no charger are supplied.**

**Specifications** (all 16 verified on the official page's expanded table)
- Rated voltage: 11 V; Max. voltage: 12 V
- Cordless power system: AS; Recommended battery: AS 2
- Device weight: 1.3 kg
- Operating pressure: 22 bar
- Max. pressure: 24 bar (footnote: maximum permissible system pressure)
- Min. water throughput: 140 l/h; Max. water throughput: 230 l/h
- Max. water feed temperature: 40 °C
- Battery working time, AS 2: min 8 min / max 15 min (footnote: indicative, varies with application and operating mode)
- Sound pressure level: 73 dB(A); Sound power level: 84 dB(A) (K-value per Directive 2006/42/EC = 2.0 dB(A))
- Vibration level left: 1 m/s²; right: 1.5 m/s² (K-value per 2006/42/EC = 2 m/s²)

**Includes** (accessory set supplied with the tool)
- 4-in-1 nozzle, spray lance extension, vacuum hoses with filter, water transport container, cleaning agent spray set, all in the included storage bag
- **No battery, no charger** — the page bullet reads "Individual tool without battery and without charger"

**Source URL**
https://www.stihl.com.au/en/p/pressure-washers-rca-20-battery-pressure-washer-as-system-203022 — official. Item "RCA 20 Handheld Pressure Cleaner Skin Only", Part No. RA020117600, $249.00 incl. 10% GST on the official page.

---

#### KOA 20 Battery Air Inflator Skin Only

**Description**
A compact cordless compressor on STIHL's AS battery system that inflates car, bicycle and trailer tyres and both inflates and quickly deflates gear such as sports balls and inflatable boats. A digital display sets the target pressure and switches between the high-pressure and volume functions, the pump stops automatically at the set pressure, and an LED light plus rubber feet help you work in the dark and keep the unit stable and low-vibration.

**Specifications** (all verified on the official page's expanded 20-row table)
- Rated voltage: 11 V; Max. voltage: 12 V
- Cordless power system: AS; Recommended battery: AS 2
- Device weight: 1.5 kg
- Max. pressure (high pressure pump): 10.3 bar (150 psi — same figure, second unit)
- Max. air flow high (volume pump): 360 l/min
- Max. battery working time AS 2, high-pressure function: 23 min
- Max. battery working time AS 2, volume function: 23 min (footnote: working times are indicative and vary with application and operating mode)
- Hose length: 605 mm
- Device length 282 mm × width 105 mm × height 223 mm
- Sound pressure level function 1: 77 dB(A); function 2: 82 dB(A)
- Sound power level function 1: 85 dB(A); function 2: 90 dB(A)
- K-value (sound pressure): 3 dB(A); K-value (sound power): 3 dB(A) (K-value per Directive 2006/42/EC)
- Part No. SA060118200 — RRP $169.00 incl. 10% GST

**Includes**
- KOA 20 air inflator, skin only (no battery, no charger)
- Pressure hose, volume hose, several valve adapters — hoses and adapters store on the unit

**Source URL**
https://www.stihl.com.au/en/p/compressors-koa-20-battery-air-inflator-as-system-1003667 — official. Filed under "Compressors"; this is an **air inflator, not a pressure washer** (the AS-system pressure washer is the separate RCA 20).

---

#### SEA 20 Battery Vacuum Cleaner AS System

**Description**
A compact cordless handheld vacuum on STIHL's AS-system lithium-ion batteries, for dry indoor clean-ups around the home and in the car. It uses a two-stage filter system that can be cleaned and reused, has a lock-on control lever for continuous running, and a flexible non-return flap behind the suction nozzle that keeps dirt in the collection box and detaches easily for emptying.

**Specifications** (official page; full table sits behind the "Show All" control)
- Rated voltage: 11 V; Max. voltage: 12 V
- Power consumption: 0.10 kW
- Cordless power system: AS; Recommended battery: AS 2
- Battery life with AS 2 battery: up to 14 min (table row: Max. battery working time AS 2: 14 min)
- Device weight without battery: 1.1 kg
- Container volume: 0.8 l
- Volumetric flow at turbine: 20 l/s (page also states 42 cf/min)
- Max. pressure appliance at the end of the hose: 65 mbar
- Inner diameter hose: 29 mm; suction hose length 0.500–1.500 m
- Device width 465 mm × height 187 mm × depth 113 mm
- Sound pressure level: 68 dB(A) — *this row rendered on the Skin Only page (…-146275), not on the Kit page*

**Includes** (Kit variant, SA030117314)
- STIHL AS 2 lithium-ion battery, STIHL AL 1 standard charger, crevice nozzle, coarse dirt nozzle, vacuum hose, extension tube, paper filter, filter basket, storage bag with carrying ring
- Skin Only (SA030117300) ships the same nozzles/hose/tube/filters/bag but **no battery and no charger**

**Source URLs** (both official)
- Kit: https://www.stihl.com.au/en/p/wet-dry-vacuums-sea-20-146463 — Part No. SA030117314, $279.00 incl. GST
- Skin Only: https://www.stihl.com.au/en/p/wet-dry-vacuums-sea-20-battery-vacuum-cleaner-as-system-146275 — Part No. SA030117300, $199.00 incl. GST. This page carries the "domestic tasks around the home… garage, workshop, in your car" wording and the 68 dB(A) row.

*STIHL AU files this under "Wet & Dry Vacuums", but the copy describes dry indoor use only — do not market it as a wet/dry unit.*

---

#### ASA 20 Battery Secateurs AS-System Skin Only

**Description**
Battery-powered secateurs on STIHL's compact AS system, for pruning trees, shrubs and plants with significantly less force than conventional pruning shears. Two selectable blade opening widths and an OLED display showing charge level, the selected opening width and the running cut count.

**Specifications** (all on the cited page)
- Maximum cutting diameter: 25 mm
- Battery life with AS 2 battery: up to 2,000 cuts
- Blade opening widths: 2 settings
- OLED display: battery charge level, selected blade opening width, total number of cuts made
- Battery system: STIHL AS System (Technical Data: Power Source: Battery)

**Includes**
- ASA 20 battery secateurs — skin only (no battery, no charger)
- Blade guard (page: "The included blade guard prevents contact with the blades during transport and storage")
- Integrated on-board tool (built into the tool for simple maintenance)

**Source URL**
https://shop.stihl.com.au/asa-20-skin-only — STIHL Australia's own online store (a stihl.com.au subdomain, dealer-fulfilled). Material number VA050116200, $249.00. The corporate catalogue page for the same product ID 197126 renders its spec table client-side.

*Weight and battery voltage are not stated on any AU page and are omitted. The mm measurements of the two blade opening widths are also not published.*

---

#### RMA 353 V Battery Lawn Mower ALLPRO System

**Description**
A self-propelled 51 cm battery lawn mower for domestic care of medium to large lawns, running a brushless EC motor on STIHL's 36-volt AP (ALLPRO) battery system. Vario wheel drive sets the walking speed at the handlebar, cutting height is adjusted centrally across 8 settings from 25 mm to 100 mm, and clippings can be caught in the 60 l textile catcher box, mulched, or discharged to the side or rear.

**Specifications** (official page technical data)
- Cordless power system: ALLPRO/AP
- Recommended battery: AP 30.1
- Drive speed: 1.5 – 4.5 km/h
- Device weight without battery: 29 kg
- Cutting width: 51 cm
- Cutting height: 25 – 100 mm; adjustment: 8-stage (central)
- Rated speed: 3200 r/min
- Grass catcher box volume: 60 l
- Device width without attachments: 55 cm; Max. device height: 119 cm
- Front wheel diameter: 200 mm; Rear wheel diameter: 250 mm
- Measured sound pressure level LpA: 83 dB(A); uncertainty KpA: 3 dB(A)
- Sound power level, guaranteed LWA: 93 dB(A)
- Vibration, guide bar ahw: 1.60 m/s²; uncertainty K: 0.80 m/s²
- IP rating: IPX4
- Max. area per battery charge (technical table): AP 200 290 m² · AP 200 S 280 m² · AP 300 S 440 m² · AP 500 S 520 m²

**Includes**
- Mower only — the page states "Individual tool without battery and without charger" and the purchasable item is "RMA 353 V Skin Only"
- 60 l textile grass catcher box; supplied mulching insert; side and rear ejection

**Source URL**
https://www.stihl.com.au/en/p/lawn-mowers-rma-353-v-battery-lawn-mower-ap-system-211394 — official. Part No. WA320111430, RRP $799.00 incl. 10% GST (skin only), dealer-only purchase.

*36 V is stated in the page's prose ("the high-quality 36-volt battery from the STIHL AP system"), not in the technical table. This is an **AP-system** tool — an AK-system battery does not fit it.*

---

### AP battery and charger

#### AP 300 S Battery with Bluetooth

**Description**
A lithium-ion battery from STIHL's professional AP System, holding 281 Wh and weighing 1.8 kg, with four LEDs showing charge level at a glance. Bluetooth connects it to the STIHL connected system so energy consumption, daily usage time and battery health can be tracked, and it charges on any STIHL AL charger.

**Specifications** (all on the cited page)
- Battery power: 281 Wh
- Weight: 1.8 kg
- Battery cell technology: lithium-ion
- Charge level indicator: four LED lights
- IPX4 certified (protection against splashwater from all sides)
- Compatible with all STIHL AL battery chargers
- Supports POWER BOOST function; maintains Constant Power through the discharge cycle
- STIHL connected compatible (Bluetooth) — records energy consumption, daily usage time and health status

**Includes** — box contents are not stated; sold as a bare battery.

**Source URL**
https://shop.stihl.com.au/ap-300-s-battery-with-bluetooth — STIHL Australia's own online store (stihl.com.au subdomain). The corporate pages (…/en/ap/ap-300-s-battery-164012 and -88828) return an empty body.

**Dropped as unconfirmed:** rated voltage 36 V (not on the page — the AP System is 36 V but the page does not state it), "charge cycles" tracking (the page lists energy consumption, daily usage time and health status only), capacity in Ah (AU and overseas listings conflict: 7.2 Ah vs 7.8 Ah), and the part number (see gaps).

---

#### AL 301 Quick Charger

**Description**
A mains-powered quick charger that works with every battery in the STIHL AK, AP and AR systems. Passive cooling protects the battery while it charges, the charger eases back to a low, gentle current from about 80% charge, and the battery's LED display shows progress — the cable rewinds into the housing and the unit can be wall-mounted.

**Specifications** (the page's technical details table has exactly five rows)
- Rated voltage: 220–240 V
- Rated current: 2.3 A
- Power consumption: 300 W
- Charging power: 276 W
- Weight: 1.1 kg
- Compatible with all batteries in the STIHL AK-System, AP-System and AR-System
- Part No. EA094305505 — RRP $199.00 (all prices include 10% GST)

**Includes** — no scope-of-delivery list is published; sold as the charger on its own.

**Source URL**
https://www.stihl.com.au/en/ap/al-301-quick-charger-135029 — official (also served at /en/ap/al-301-high-speed-charger-135029; mirrored at shop.stihl.com.au/al-301-quick-charger at the same $199.00). In-store purchase via a STIHL dealer.

**Dropped as unconfirmed:** 6.5 A charging current (a UK-site figure, not on any AU page), "active cooling"/fan (UK copy — STIHL AU says passive cooling), wall-mounting jig, charging times (not published on this page).

---

## 3. Gaps and discrepancies

**RESOLVED (2026-08-25) — HS 45 600 mm part number**
The prize list has `STN4228 011 2936` → `4228 011 2936`. That number is **not** on stihl.com.au,
whose current page lists only `42280112947` (450 mm) and `42280112948` (600 mm) — items labelled
"HS 45-Z Hedge trimmer". But an **Australian** STIHL retailer (John's Bikes & Mowers, Ballina NSW)
lists `4228 011 2936` as the **HS 45 24" / 60 cm**, and the US 18" equivalent is `4228 011 2928 US`.
So `...2936` is a valid AU 600 mm part, most likely a prior generation of `...2948`.

**This matters because HS 45 is the ONE product whose description is variant-dependent** — cutting
length 45 vs 60 cm and weight 4.8 vs 5.1 kg. Two independent signals agree on 600 mm (the prize
list's own "60cm", and the part number resolving to 24"), so **the 600 mm figures recorded above are
the right ones**. Still worth a one-line confirmation from the supplier that they are shipping
`...2936` and not the 450 mm.
Source: https://johnsbikesandmowers.com/products/stihl-hs-45-24-60cm-hedge-trimmer

**Part number unconfirmed — AP 300 S**
No stihl.com.au page shows a STIHL part number for this battery; the shop page shows only "Mat No: 1600765931749774". Australian dealers split between **4850 400 6575** and **4850 400 6585** for the Bluetooth variant. Do not publish a part number for this item.

**Part numbers that DO match the prize list** (verified on an official page): FS 91 R 41802000728 · BG 86 42410111762 · GTA 26 kit GA010116915 · RCA 20 skin RA020117600 · KOA 20 skin SA060118200 · SEA 20 kit SA030117314 / skin SA030117300 · RMA 353 V WA320111430 · AL 301 EA094305505. MS 391 1140 200 0689 matches, but only via Australian dealer listings — it was not readable on the cited shop.stihl.com.au page.

**Skin vs kit — items where a battery and charger are NOT included**
- **RCA 20** (RA020117600), **KOA 20** (SA060118200), **ASA 20** (VA050116200), **RMA 353 V** (WA320111430) are all **skin only**. A winner needs the matching battery and charger separately (AS 2 + AL 1 for the AS-system tools; an AP-system battery for the mower). Kit versions exist at different part numbers and prices (KOA 20 kit $249; ASA 20 kit $329; RCA 20 kit ~$329, dealer-sourced and unconfirmed on the official page).
- **GTA 26** is the **kit** (battery + charger included).
- **SEA 20 — LIKELY THE KIT (SA030117314).** The prize list gives `STNSA03 011 7314` → `SA030117314`,
  which is exactly STIHL AU's **SEA 20 Kit** part (AS 2 battery + AL 1 charger included, $279); the
  Skin Only is SA030117300 ($199). The list attaches that same number to BOTH the KOA 20 and the
  SEA 20 — so the duplication is a copy-paste onto the KOA 20 row, and the number itself belongs to
  the SEA 20. Read that way it **answers the variant question**: the SEA 20 is the kit, and it is the
  only AS-system item in this prize that arrives with its own battery and charger besides the GTA 26.
  Worth one confirmation, but the reading is consistent.
- **AP 300 S / AL 301** are sold as bare items with no stated box contents.

**MS 391 — the weakest record in this set.** The cited shop.stihl.com.au page's technical data has only three rows (power source, can-packaged-together, seller). Displacement (64.1 cm³) and the 50 cm / 20" bar are corroborated by STIHL's spec sheet and Australian dealers but not by that page. Weight is unresolved: the original extraction's 6.3 kg is wrong; 6.2 kg appears on STIHL's spec sheet and two AU dealer pages but on no stihl.com.au page — it is omitted here. Sound levels, system weight and bumper-strike length are dropped entirely. If a weight is needed for the catalogue, source it from a STIHL AU page first.

**Specs not published by STIHL AU at all** (correctly absent, do not fill from overseas sites)
- FS 91 R: no sound power, vibration or engine-speed figures.
- HS 45: no fuel tank capacity, sound pressure or vibration rows on the AU page.
- ASA 20: no weight, no voltage, no mm figures for the two blade opening widths.
- AL 301: no charging times (STIHL AU links to a separate battery life/charging times overview).
- AP 300 S: no rated voltage and no Ah capacity on the accessible page.

**Internal contradictions on STIHL AU's own pages** (table value used in each case)
- **RMA 353 V:** run-area is stated twice with different numbers — prose says AP 200/S up to 230 m², AP 300 S 336 m², AP 500 S 440 m²; the table says 290 / 280 / 440 / 520 m². Run-area is unreliable for marketing copy; consider omitting it. The table also names AP 30.1 as recommended battery while the prose recommends the AP 300 S — safer to say "AP-system battery required (sold separately)".
- **SEA 20:** marketing copy calls it a "10 V" vacuum; the table says 11 V rated / 12 V max. Table used.
- **RCA 20:** table says min battery working time 8 min; body copy says "from 7.5 min". Table used.
- **AL 301:** table says 1.1 kg; body copy says "weighs only 1.2 kg". Table (1.1 kg) used.
- **KOA 20:** body copy contains a leftover typo, "battery air inflator cleaner". It is an inflator.
- **KOA 20:** the page does not define which of "function 1" and "function 2" is high-pressure vs volume in the sound rows — quoted as printed.

**Naming variants across STIHL AU surfaces** (all refer to the same product): FS 91 R / "FS 91 R Petrol Grass Trimmer" (shop.stihl.com.au/fs-91-r) — the trade name "FS 91 R-Z" is used by Australian retailers but never on stihl.com.au, and I could not verify what the "-Z" suffix denotes. MS 391 / MS 391 FarmBoss®. GTA 26 Battery Pruner AS System (H1) vs "GTA 26 Battery Garden Pruner" (browser title). RCA 20 Battery Pressure Washer AS System (H1) vs "RCA 20 Handheld Pressure Cleaner" (title). KOA 20 Battery Air Inflator AS System (H1) vs "KOA 20 Skin Only" (variant tab). SEA 20 Battery Vacuum Cleaner AS System (H1) vs "SEA 20 Battery Vacuum Kit / Skin Only" (titles). ASA 20 Battery Secateurs AS System vs "ASA 20 Battery Pruning Shears". AL 301 Quick Charger vs "AL 301 High-speed Charger" — the prize list's "high speed charger" is correct.

**Do not cross-reference overseas listings.** Confirmed market differences: RMA 353 V US listings quote a 75 L bag and 7 cutting heights (AU: 60 l, 8 stages) under a different part number; RCA 20 US part RA02 011 7601; MS 391 US 20" bar part 1140 200 0591; AL 301 UK page states 6.5 A and active cooling, which STIHL AU does not.

**Also worth flagging:** the MS 391 is filed by STIHL AU under **Landowner** chainsaws, not professional. The RMA 353 V has a non-self-propelled sibling (RMA 353, no "V") — check catalogue artwork is the Vario version. STIHL AU does not use a "4-IN-1" badge for the RMA 353 V; describe the four modes instead. Do not confuse the AL 301 with the four-battery **AL 301-4** (product 135006).