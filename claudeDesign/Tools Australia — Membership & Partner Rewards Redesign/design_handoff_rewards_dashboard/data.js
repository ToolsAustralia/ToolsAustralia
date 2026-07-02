window.TA_DATA = {
  brandName: "Tools Australia",
  rewardsName: "Tools Australia Rewards",
  referralEntries: 100,
  tiers: [
    { id: "tradie",  name: "Tradie",  price: 20, entries: 15,  access: 50,  color: "#00c2ed", blurb: "Perfect for tradies getting started" },
    { id: "foreman", name: "Foreman", price: 40, entries: 40,  access: 75,  color: "#ffd200", blurb: "The most popular choice for serious tool pros" },
    { id: "boss",    name: "Boss",    price: 80, entries: 100, access: 100, color: "#ee0000", blurb: "Premium membership for the ultimate tool pros" }
  ],
  brands: [
    { name: "ZJWRAPS",                       offer: "$250 OFF",    sub: "vehicle wrap",   cat: "Vehicle", logo: "/images/partnerBrandLogos/ZJWRAPS.webp" },
    { name: "Super Bad",                     offer: "90% OFF",     sub: "trial shoot",    cat: "Media",   logo: "/images/partnerBrandLogos/SuperBad.webp" },
    { name: "Multi Hub",                     offer: "VIP PRICING", sub: "member promos",  cat: "Supply",  logo: "/images/partnerBrandLogos/multiHub.webp" },
    { name: "All Round Trade Constructions", offer: "10% OFF",     sub: "your quote",     cat: "Trade",   logo: "/images/partnerBrandLogos/ARTC.webp" },
    { name: "Seal Motors",                   offer: "10% OFF",     sub: "car servicing",  cat: "Auto",    logo: "/images/partnerBrandLogos/sealMotors.webp" },
    { name: "Toolman Lane",                  offer: "10% OFF",     sub: "all purchases",  cat: "Tools",   logo: "/images/partnerBrandLogos/ToolmanLane.jpg" },
    { name: "BAL Building Services",         offer: "FREE QUOTE",  sub: "building work",  cat: "Trade",   logo: "/images/partnerBrandLogos/BAL.jpg" }
  ],
  oneTimePacks: [
    { id: "apprentice", name: "Apprentice", price: 25,   entries: 3,    access: 25,  days: 1,  color: "#2a62b6" },
    { id: "tradie",     name: "Tradie",     price: 50,   entries: 15,   access: 40,  days: 2,  color: "#e0ff00" },
    { id: "foreman",    name: "Foreman",    price: 100,  entries: 30,   access: 55,  days: 4,  color: "#00c2ed" },
    { id: "boss",       name: "Boss",       price: 250,  entries: 150,  access: 70,  days: 10, color: "#ffd200" },
    { id: "power",      name: "Power",      price: 500,  entries: 600,  access: 85,  days: 20, color: "#ee0000" },
    { id: "vip",        name: "VIP",        price: 1000, entries: 1500, access: 100, days: 30, color: "#e0b020" }
  ],
  draw: { day: 27, time: "8:30 PM", tz: "AEST/AEDT", renewAnchor: 24, freezeFrom: "8:00 PM", freezeTo: "8:30 PM", gapTo: "12:00 AM" },
  prize: {
    a: { key: "a", title: "The Ultimate Tradie Setup", tagline: "Win the lot", items: ["Your pick of brand — Milwaukee, DeWalt, Makita & more", "Toolbox + power-tool kit + storage system", "$5,000 cash on top"] },
    b: { key: "b", title: "Straight Cash", tagline: "Take the lot in cash", items: ["$10,000 cash, tax-free", "Paid straight to your bank", "Spend it however you like"] }
  },
  steps: [
    { n: 1, title: "Get your entries", body: "Every membership and one-time package comes with free entries. The more you hold, the more entries you have in the draw.", kind: "brands" },
    { n: 2, title: "Entries freeze on the 27th", body: "Entries lock at 8:00 PM AEST on the 27th. Everything you're holding at that moment is your final count for the draw.", kind: "stack" },
    { n: 3, title: "Drawn live at 8:30 PM", body: "The winner is drawn live on Facebook at 8:30 PM AEST — taking home the Ultimate Tradie Setup or $10,000 cash.", kind: "win" }
  ],
  winners: [
    { name: "Jaxon M.", suburb: "Geelong, VIC", prize: "Milwaukee M18 pack", cash: "+ $5,000 cash", date: "May 2026", color: "#c8102e" },
    { name: "Kylie R.", suburb: "Logan, QLD", prize: "$10,000 straight cash", cash: "paid to the bank", date: "Apr 2026", color: "#d9a520" },
    { name: "Dev S.", suburb: "Penrith, NSW", prize: "DeWalt combo + storage", cash: "+ $5,000 cash", date: "Mar 2026", color: "#ffd200" }
  ],
  promoOptions: [{ value: 1, label: "Off" }, { value: 2, label: "2X" }, { value: 3, label: "3X" }, { value: 5, label: "5X" }, { value: 10, label: "10X" }],
  bottomNav: [
    { id: "overview",          label: "Dashboard",  icon: "Grid" },
    { id: "rewards",           label: "Rewards",    icon: "Gift" },
    { id: "draws",             label: "Draws",      icon: "Ticket" },
    { id: "account-membership", label: "Membership", icon: "Card" },
    { id: "support",           label: "Support",    icon: "Chat" }
  ],
  redeemables: {
    claimable: [
      { title: "+250 free entries", sub: "6-month loyalty milestone", icon: "Bolt" },
      { title: "Free Mini Pack", sub: "Spend milestone reached", icon: "Gift" }
    ],
    past: [
      { title: "+100 free entries", sub: "Referral reward", date: "12 May" },
      { title: "+50 free entries", sub: "3-month loyalty milestone", date: "24 Mar" }
    ]
  },
  memberPlan: { tierId: "boss", renewDay: 24, nextRenewal: "24 Jul", since: "Mar 2026" }
};
