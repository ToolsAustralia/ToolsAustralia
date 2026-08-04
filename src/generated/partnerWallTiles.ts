// GENERATED FILE — do not edit; run npm run build:partner-catalog

/**
 * CLIENT-SAFE marketing tiles for `PartnerBrandWall` — the trade-relevant slice of the
 * partner catalogue (Automotive + Technology, artwork-bearing only): 93 rows.
 *
 * Separate from `partnerCatalogBrowse` on purpose. The wall ships on /membership and every
 * /promotions/[slug]; browse is ~88 KB and belongs only to the catalogue route.
 *
 * `name` is the VENDOR's name field and does NOT always match its own artwork (offer 800575
 * is named "GUNNEDAH HYDRAULICS" but its logo reads "AG-FIX HYDRAULICS"). The wall therefore
 * renders portal tiles LOGO-ONLY and uses `name` only for the accessible label — do not put
 * it beside the logo as visible text.
 *
 * Build the image URL with `buildPartnerPortalOfferImageUrl(id, imageExt)`; never
 * concatenate a path by hand. The bucket is public (no portal session needed).
 */
export type PartnerWallTile = readonly [
  /** Vendor name. Accessible label only — may disagree with the artwork. */
  name: string,
  id: string,
  /** Pass to buildPartnerPortalOfferImageUrl. See PartnerCatalogBrowseRow.imageExt. */
  imageExt: string,
  /** Member-facing value line, e.g. "10% Discount". */
  highlight: string,
];

export const PARTNER_WALL_TILES: readonly PartnerWallTile[] = [
  ["Mike Blewitt Ford","800492","png","10% Discount"],
  ["BROWN'S TYRE SERVICE","800563","jpg","$5 off"],
  ["GUNNEDAH HYDRAULICS","800575","png","5% Discount"],
  ["MAX ORMAN TOYOTA","800577","png","10% Discount"],
  ["J & H Windscreens","800592","jpg","10% Discount"],
  ["COONA BEARINGS PTY LTD","800605","png","10% Discount"],
  ["MEYER'S MOTORS","800613","jpg","5% Discount"],
  ["DOM'S DIESEL","800626","jpg","10% Discount"],
  ["BYRON ST AUTO ELECTRICS","800654","png","10% Discount"],
  ["AUTO TOUCHUPS PTY LTD","800672","png","10% Discount"],
  ["KEITH MCKAY TYRE & MECHANICAL","800804","png","10% Discount"],
  ["NRG CYCLES JINDALEE","800831","png","10% Discount"],
  ["BOB JANE T-MART MT. OMMANEY","800839","png","5% Discount"],
  ["QUICK FIT TYRE SERVICE YEERONGPILLY","800852","png","Member only offer."],
  ["TUGUN MOTOR REPAIRS","800958","png","10% Discount"],
  ["SEL'S AUTO MECHANICAL REPAIRS","800960","png","10% Discount"],
  ["GOLD COAST MUFFLERS & AUTO SERVICES","800961","jpg","10% Discount"],
  ["GOLD COAST 4WD WRECKERS PTY LTD","800971","jpg","10% Discount"],
  ["AUTO TWO PTY LTD","801060","png","10% Discount"],
  ["QUICK FIT TYRE SERVICE MAROOCHYDORE","801083","png","Member only offer."],
  ["WIDE BAY CARAVAN SALES & REPAIRS","801087","png","5% Discount"],
  ["STARWAY MOTORS","801098","png","10% Discount"],
  ["LAWRENCIA CYCLES","801226","png","10% Discount"],
  ["QUICK FIT TYRE SERVICE RESERVOIR","801240","jpg","Member only offer"],
  ["Midland Towbars","1000092","png","5% Discount"],
  ["TTM Automotive","1002339","png","10% Discount"],
  ["M&T Tyre Centre","1002351","png","10% Discount"],
  ["Peter Wiles Stripes P/L","1002482","jpg","10% off."],
  ["QUICK FIT TYRE SERVICE TOWNSVILLE","1002777","jpg","Free wheel alignment"],
  ["Bunbury Mitsubishi","1003408","png","10% Discount"],
  ["Bricknell Radiator Specialists","1008353","png","10% Discount"],
  ["Tuggerah Lakes Batteries","1008358","png","Free delivery & 5% Discount"],
  ["Powerhouse Auto Repairs","1008656","png","10% Discount"],
  ["Comet Batteries Melbourne VIC","1008669","png","10% Discount"],
  ["Rob Bliss Exhausts","1008670","png","10% Discount"],
  ["Gladstone Mufflers & Suspension","1008672","png","10% Discount"],
  ["O'Briens Garage","1008677","png","10% Discount"],
  ["Transit Cool","1008685","jpg","10% Discount"],
  ["Kawana Auto Service","1008696","png","10% Discount"],
  ["Ipswich Muffler & Mechanical","1008697","png","10% Discount"],
  ["The Motorcycle Sportsmen of Queensland Albion QLD","1008776","png","2 for 1 Deal"],
  ["Auto One - Cooee","1009157","png","10% Discount"],
  ["Jackmans Garage","1009159","png","15% Discount"],
  ["David Nutter Ford","1009218","png","10% off service RRP"],
  ["European Auto Imports","1009219","png","10% Discount"],
  ["Rabbas Radiators","1009228","png","10% Discount"],
  ["Sprint Auto Parts","1009236","png","5% to 10% off most lines"],
  ["East-West Auto's","1009237","png","10% Discount"],
  ["Geoffs Auto Spares","1009249","png","10% Discount"],
  ["Battery Wholesalers","1009654","png","5% Discount"],
  ["Geraldton TV & Radio Services","1009681","png","10% Discount"],
  ["Out of Town 4WD Barnsley NSW","1010835","png","10% Discount"],
  ["Ken Self Cycle Centre","1012763","png","10% Discount"],
  ["PRV Locksmiths St Marys NSW","1012984","png","Save 5% on car keys"],
  ["Gabba Car Spa Cafe","1015123","png","Save 5% on your car wash and FREE Coffee!"],
  ["Pine Ridge Mechanical","1033018","png","Pay just $99 for full lube service"],
  ["Kleenmaid Alexandria NSW","1037899","png","Get 20% discount"],
  ["RNC Auto Electrics","1043405","png","Up to 15% off"],
  ["Get Commercial pricing at The Good Guys","1045580","png","Access to discounts"],
  ["JBL Australia","1047236","png","Get 5% Cashback"],
  ["LightsupOnline AU","1047249","png","Get 10% Cashback"],
  ["Clarity Soup Maker","1049978","png","Save up to 10% on RRP"],
  ["MultiPot - Red","1049979","png","Save up to 10% on RRP"],
  ["MultiPot - Green","1049980","png","Save up to 10% on RRP"],
  ["MIXSTAR Compact Stand Mixer","1049983","png","Save up to 10% on RRP"],
  ["Ascend Rose Gold 4 Slice Toaster - White","1050548","png","Pay only $161.96; RRP $179.95"],
  ["Ascend Rose Gold Traditional Pyramid Kettle - Black","1050549","png","Pay only $152.96 ; RRP $169.95"],
  ["Ascend Rose Gold Kettle & Toaster Set -White","1050552","png","Pay only $314.96 ; RRP $349.95"],
  ["Jayride","1050576","png","8% Discount"],
  ["Cookware Brands","1050710","png","Get 5% Cashback"],
  ["CarHistory","1050768","png","Get 11% Cashback"],
  ["Billy Guyatts","1050792","png","Get 1% Cashback"],
  ["Boost Mobile","1050796","png","Get up to $6 Cashback"],
  ["Bing Lee","1050832","png","Get up to 2% Cashback"],
  ["Gozney","1050872","png","Get up to 7% Cashback"],
  ["More Telecom","1050893","png","Get 11% Cashback"],
  ["AGL","1061821","png","Get up to $140 cashback*"],
  ["Alinta Energy","1061822","png","Get up to $140 cashback*"],
  ["EnergyAustralia","1061824","png","Receive up to $140 cashback*"],
  ["Lumo Energy","1061825","png","Get up to $140 cashback*"],
  ["Momentum Energy","1061826","png","Get up to $140 cashback*"],
  ["Origin","1061827","png","Get up to $140 cashback*"],
  ["Red Energy","1061828","png","Get up to $140 cashback*"],
  ["JB Hi-Fi eGift Card","1064994","png","Get 4% Discount"],
  ["The Good Guys eGift Card","1064995","png","Get 4% Discount"],
  ["Best Ride for MyRewards Members","1065206","png","Special discount off monthly subscription"],
  ["Lenovo South Korea","1065242","png","Get 2% Cashback"],
  ["XP-PEN PH","1065252","png","Get 3.5% Cashback"],
  ["Oridon","1066393","png","Enjoy 10% Off on Premium Car Care Range"],
  ["Kogan eGift Card","1066565","png","Get 4% Discount"],
  ["Apple eGift Card","1066616","png","Get 4% Discount"],
  ["Anker","1066620","png","Get 5% Cashback"],
  ["eufy","1066624","png","Get 5% Cashback"],
];
