/* Three premium rewards-dashboard concepts — lively, app-style, with docked
   bottom nav + quick-action tiles. Reuses the Tools Australia design system. */
const { useState: useStateC } = React;
const D = window.TA_DATA;

const NAME = "DJ Rivera";
const EMAIL = "djrrivera25@gmail.com";
const MON = "DJ";
const ONE_TIME = 90;

function useNextDraw() {
  const end = React.useMemo(() => Date.now() + (5 * 86400000 + 8 * 3600000 + 12 * 60000), []);
  return useCountdown(end);
}
const dealsSample = D.brands.slice(0, 3).map((b) => ({ n: b.name, o: b.offer, c: b.cat }));

function Num({ value, suffix = "" }) {
  return <span className="num">{Number(value).toLocaleString() + suffix}</span>;
}

/* richer, tool-brand-flavoured icon set (supplements system.js Ic) */
function Sx({ children, size = 22, sw = 1.9, style }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>{children}</svg>;
}
const Ix = {
  Cog: (p) => <Sx {...p}><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"></path></Sx>,
  Ticket: (p) => <Sx {...p}><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5v2a2 2 0 0 0 0 3v2a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5v-2a2 2 0 0 0 0-3Z"></path><path d="M9 7v1M9 11v1M9 15v1" strokeDasharray="0.1 3"></path></Sx>,
  Percent: (p) => <Sx {...p}><line x1="19" y1="5" x2="5" y2="19"></line><circle cx="7" cy="7" r="2.1"></circle><circle cx="17" cy="17" r="2.1"></circle></Sx>,
  Medal: (p) => <Sx {...p}><path d="M8.5 3 12 9M15.5 3 12 9"></path><circle cx="12" cy="15" r="5.2"></circle><path d="m12 12.6 1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3 1-2Z"></path></Sx>,
  Store: (p) => <Sx {...p}><path d="M4 9 5.4 5h13.2L20 9"></path><path d="M4 9a2.4 2.4 0 0 0 4 0 2.4 2.4 0 0 0 4 0 2.4 2.4 0 0 0 4 0 2.4 2.4 0 0 0 4 0"></path><path d="M5 11v8h14v-8M9.5 19v-4.5h5V19"></path></Sx>,
  Headset: (p) => <Sx {...p}><path d="M5 13v-1a7 7 0 0 1 14 0v1"></path><rect x="3" y="13" width="4" height="6" rx="1.6"></rect><rect x="17" y="13" width="4" height="6" rx="1.6"></rect><path d="M19 19a3 3 0 0 1-3 3h-2"></path></Sx>,
  UserPlus: (p) => <Sx {...p}><circle cx="9" cy="8" r="3.4"></circle><path d="M3 20a6 6 0 0 1 12 0"></path><path d="M18 8v6M15 11h6"></path></Sx>,
  Flame: (p) => <Sx {...p}><path d="M12 2c.6 3-2 4.6-2 7a2 2 0 0 0 4 0c1 1 1.6 2.3 1.6 3.6a5.6 5.6 0 1 1-9.2-4.3C8 10.5 11 8.5 12 2Z"></path></Sx>,
  Chip: (p) => <Sx {...p}><rect x="6" y="7" width="12" height="10" rx="2"></rect><path d="M10 7v10M14 7v10M6 11h4M14 11h4M6 13h4M14 13h4"></path></Sx>,
  Nfc: (p) => <Sx {...p}><path d="M6 8a8 8 0 0 1 0 8M10 6a12 12 0 0 1 0 12M3 10a4 4 0 0 1 0 4"></path></Sx>,
  ExtLink: (p) => <Sx {...p}><path d="M14 4h6v6M20 4l-9 9"></path><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"></path></Sx>,
  Bell: (p) => <Sx {...p}><path d="M6 9a6 6 0 0 1 12 0c0 4 1.4 5.5 2 6H4c.6-.5 2-2 2-6Z"></path><path d="M10 19a2 2 0 0 0 4 0"></path></Sx>,
  Grid: (p) => <Sx {...p}><rect x="4" y="4" width="7" height="7" rx="1.6"></rect><rect x="13" y="4" width="7" height="7" rx="1.6"></rect><rect x="4" y="13" width="7" height="7" rx="1.6"></rect><rect x="13" y="13" width="7" height="7" rx="1.6"></rect></Sx>,
  Phone: (p) => <Sx {...p}><path d="M6.5 3h3l1.5 4-2 1.5a11 11 0 0 0 4.5 4.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3Z"></path></Sx>,
  Pin: (p) => <Sx {...p}><path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11Z"></path><circle cx="12" cy="10" r="2.5"></circle></Sx>,
  Briefcase: (p) => <Sx {...p}><rect x="3" y="7" width="18" height="13" rx="2"></rect><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M3 12h18"></path></Sx>,
  Pencil: (p) => <Sx {...p}><path d="M4 20h4l10-10-4-4L4 16v4Z"></path><path d="M13.5 6.5l4 4"></path></Sx>,
  Monitor: (p) => <Sx {...p}><rect x="3" y="4" width="18" height="13" rx="2"></rect><path d="M8 21h8M12 17v4"></path></Sx>
};

/* ---------- shared shell ---------- */
function Screen({ label, children }) {
  return (
    <div data-screen-label={label} style={{ width: 400, minHeight: 828, flex: "0 0 auto", display: "flex", flexDirection: "column", borderRadius: 34, border: "1px solid var(--line)", background: "var(--bg-2)", boxShadow: "var(--shadow-lg)", overflow: "hidden" }}>
      {children}
    </div>
  );
}
function Body({ children, pad = 18 }) {
  return <div style={{ flex: 1, padding: pad, display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>;
}
function Mono({ tier, size = 44, radius = 14, onBrand }) {
  if (onBrand) return <div style={{ width: size, height: size, flex: "none", borderRadius: radius, display: "grid", placeItems: "center", font: "900 " + Math.round(size * 0.36) + "px/1 Poppins", color: tier.color, background: "#fff", boxShadow: "0 8px 18px -8px rgba(0,0,0,.4)" }}>{MON}</div>;
  return <div style={{ width: size, height: size, flex: "none", borderRadius: radius, display: "grid", placeItems: "center", font: "900 " + Math.round(size * 0.36) + "px/1 Poppins", color: inkOn(tier.color), background: glossGrad(tier.color), boxShadow: "inset 0 1px 0 rgba(255,255,255,.4),0 10px 22px -12px " + tier.color + "cc" }}>{MON}</div>;
}
function CDBox({ v, l, accent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 10px", borderRadius: 11, background: "var(--surface)", border: "1px solid " + (accent || "var(--line)"), minWidth: 46 }}>
      <span className="num" style={{ font: "800 17px/1 Poppins", color: "var(--text)" }}>{String(v).padStart(2, "0")}</span>
      <span style={{ font: "700 8px/1 Inter", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted-2)" }}>{l}</span>
    </div>
  );
}
function DealRow({ d, tier, compact }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: compact ? "8px 0" : "11px 0", borderBottom: "1px solid var(--line)" }}>
      <div style={{ width: 30, height: 30, flex: "none", borderRadius: 9, display: "grid", placeItems: "center", font: "900 12px/1 Poppins", background: "var(--inset)", color: tier.color }}>{d.n[0]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "700 12.5px/1.15 Inter", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.n}</div>
        <div style={{ font: "600 10px/1 Inter", color: "var(--muted-2)", marginTop: 3, letterSpacing: ".04em", textTransform: "uppercase" }}>{d.c}</div>
      </div>
      <span style={{ font: "900 13px/1 Poppins", color: tier.color, whiteSpace: "nowrap" }}>{d.o}</span>
    </div>
  );
}

/* ---------- quick-action tiles ---------- */
function QuickTile({ icon: I, label, badge, c, dark }) {
  return (
    <button style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 9, padding: "4px 2px", border: 0, background: "transparent", cursor: "pointer" }}>
      <div style={{ position: "relative", width: 56, height: 56, borderRadius: 18, display: "grid", placeItems: "center", overflow: "hidden", color: "#fff", background: "linear-gradient(158deg," + shade(c, 26) + "," + c + " 62%," + shade(c, -14) + ")", boxShadow: "inset 0 1px 0 rgba(255,255,255,.45),0 10px 20px -10px " + c + ",0 0 0 1px rgba(255,255,255,.06)" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "52%", background: "linear-gradient(180deg,rgba(255,255,255,.3),transparent)", pointerEvents: "none" }}></div>
        <I size={24} style={{ position: "relative", filter: "drop-shadow(0 1px 1px rgba(0,0,0,.28))" }} />
      </div>
      <span style={{ font: "600 10.5px/1.2 Inter", color: dark ? "rgba(255,255,255,.86)" : "var(--text)", textAlign: "center" }}>{label}</span>
      {badge && <span style={{ position: "absolute", top: -3, right: "50%", transform: "translateX(28px)", font: "800 8px/1 Inter", letterSpacing: ".03em", padding: "3px 6px", borderRadius: 6, background: "linear-gradient(180deg,#ff3b3b,#c40d0d)", color: "#fff", textTransform: "uppercase", whiteSpace: "nowrap", boxShadow: "0 6px 12px -6px rgba(0,0,0,.5)" }}>{badge}</span>}
    </button>
  );
}
function TileGrid({ tiles, cols = 4, dark }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(" + cols + ",1fr)", gap: 8 }}>
      {tiles.map((t, i) => <QuickTile key={i} {...t} dark={dark} />)}
    </div>
  );
}
const CT = { red: "#ee0000", gold: "#b8901f", blue: "#0596b9", green: "#0f9d6b", violet: "#6d4bff", amber: "#d97706" };
const CTd = { red: "#ff5a5a", gold: "#e6c349", blue: "#22b7dd", green: "#34d399", violet: "#9a80ff", amber: "#fbbf24" };

/* ---------- promo (purchase-time entry multiplier) ---------- */
/* The multiplier applies to the FREE entries attached to a package/upgrade at
   the moment of purchase — not to entries already banked. When a promo is live
   the dashboard sells it hard to drive package buys + membership upgrades. */
function promoTheme(mult) {
  if (mult >= 10) return { grad: "linear-gradient(120deg,#ff8a2b,#ff2d55 46%,#b3007a)", ink: "#fff", chip: "rgba(255,255,255,.16)", chipInk: "#fff", btnBg: "#fff", btnInk: "#c40d0d", glow: "rgba(255,45,85,.6)", hot: true };
  if (mult >= 5) return { grad: "linear-gradient(120deg,#ff6a3d,#e0245e 60%,#a1004b)", ink: "#fff", chip: "rgba(255,255,255,.16)", chipInk: "#fff", btnBg: "#fff", btnInk: "#c40d0d", glow: "rgba(224,36,94,.55)", hot: true };
  return { grad: "linear-gradient(120deg,#f6dd8c,#d4af37 58%,#a87f1d)", ink: "#241a02", chip: "rgba(0,0,0,.14)", chipInk: "#241a02", btnBg: "linear-gradient(180deg,#2a2109,#151002)", btnInk: "#f6dd8c", glow: "rgba(212,175,55,.7)", hot: false };
}
/* Promo window is time-boxed — multiplier promos run for ~24h. Anchored once at
   load so the countdown is stable across page switches / remounts. */
const PROMO_END = Date.now() + (23 * 3600000 + 47 * 60000 + 30 * 1000);

function PromoBanner({ mult = 1, wide, onGet }) {
  const active = mult > 1;
  const t = promoTheme(mult); // gold for 1–3×, enhanced hot gradient for 5×/10×
  const { h, m, s } = useCountdown(PROMO_END);
  const pad = (n) => String(n).padStart(2, "0");
  const timer = pad(h) + ":" + pad(m) + ":" + pad(s);
  const badgeBg = t.hot ? "linear-gradient(180deg,#ffffff,#ffe0e0)" : "linear-gradient(180deg,#fff3cc,#f4d873)";
  const badgeInk = t.hot ? "#c40d0d" : "#241a02";
  const badgeBd = t.hot ? "#ffb0b0" : "#d4af37";
  // SAME calm layout at every multiplier — only the palette is enhanced for 5×/10×.
  // When live: subtitle becomes a "Special promo" 24h countdown pill + a multiplier badge on the button.
  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: "var(--r-xl)", background: t.grad, color: t.ink, boxShadow: "0 16px 34px -18px " + t.glow }}>
      {active && <div style={{ position: "absolute", top: 0, left: "-60%", width: "42%", height: "100%", background: "linear-gradient(105deg,transparent,rgba(255,255,255,.5),transparent)", transform: "skewX(-18deg)", animation: "shimmer 3.4s var(--ease) infinite", pointerEvents: "none" }}></div>}
      <div style={{ position: "absolute", top: -32, right: -22, width: 128, height: 128, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,255,255,.4),transparent 70%)", pointerEvents: "none" }}></div>
      {active && (
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: wide ? "9px 22px" : "8px 15px", background: t.chip, borderBottom: "1px solid " + (t.hot ? "rgba(255,255,255,.22)" : "rgba(0,0,0,.1)") }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "900 " + (wide ? "10px" : "9.5px") + "/1 Inter", letterSpacing: ".08em", textTransform: "uppercase", color: t.chipInk }}><Ix.Flame size={wide ? 13 : 12} /> Special promo</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "800 " + (wide ? "11px" : "10px") + "/1 Inter", color: t.chipInk }}><Ic.Clock size={wide ? 13 : 12} style={{ opacity: .8 }} /> Ends in <span style={{ fontVariantNumeric: "tabular-nums", letterSpacing: ".02em", whiteSpace: "nowrap", fontWeight: 900 }}>{timer}</span></span>
        </div>
      )}
      <div style={{ position: "relative", padding: wide ? "18px 22px" : "15px 16px", display: "flex", alignItems: "center", gap: wide ? 18 : 13 }}>
        <span style={{ width: wide ? 46 : 42, height: wide ? 46 : 42, flex: "none", borderRadius: 12, display: "grid", placeItems: "center", background: t.hot ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.16)" }}><Ix.Ticket size={wide ? 23 : 21} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ font: (wide ? "800 17px" : "800 14.5px") + "/1.2 Poppins" }}>50% off one-time packages</b>
          <div style={{ font: "700 " + (wide ? "11.5px" : "10.5px") + "/1 Inter", color: t.hot ? "rgba(255,255,255,.85)" : "rgba(36,26,2,.72)", marginTop: 5 }}>{active ? mult + "× free entries on every package" : "Promo · until June 27"}</div>
        </div>
        <div style={{ position: "relative", flex: "none" }}>
          <button onClick={onGet} style={{ display: "inline-flex", alignItems: "center", gap: 7, font: "800 " + (wide ? "13px" : "12px") + "/1 Inter", color: t.btnInk, background: t.btnBg, border: 0, borderRadius: 99, padding: wide ? "13px 20px" : "12px 15px", cursor: "pointer", boxShadow: "0 10px 22px -10px rgba(0,0,0,.6)" }}>Get a package <Ic.Arrow size={wide ? 16 : 15} /></button>
          {active && <span style={{ position: "absolute", top: -9, right: -8, display: "inline-flex", alignItems: "center", gap: 2, font: "900 9.5px/1 Inter", letterSpacing: ".02em", color: badgeInk, background: badgeBg, padding: "4px 6px", borderRadius: 7, border: "1.5px solid " + badgeBd, boxShadow: "0 5px 12px -3px rgba(0,0,0,.5)" }}><Ix.Flame size={9} /> {mult}×</span>}
        </div>
      </div>
    </div>
  );
}

/* ---------- stat pills ---------- */
function StatPills({ tier, d, monthly, items }) {
  const list = items || [
    { I: Ic.Bolt, v: monthly, l: "This month", c: tier.color },
    { I: Ic.Shield, v: tier.access + "%", l: "Access", c: "#0596b9" },
    { I: Ic.Clock, v: d + "d", l: "To draw", c: "#0f9d6b" }
  ];
  return (
    <div className="card" style={{ display: "flex", padding: "15px 2px" }}>
      {list.map((it, i) => {
        const I = it.I;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, borderLeft: i ? "1px solid var(--line)" : "none" }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: it.c + "1f", color: it.c }}><I size={18} /></div>
            <div className="num" style={{ font: "800 16px/1 Poppins" }}>{it.v}</div>
            <div style={{ font: "600 10px/1 Inter", color: "var(--muted)" }}>{it.l}</div>
          </div>
        );
      })}
    </div>
  );
}
function Dots({ n = 4, on = 0 }) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
      {Array.from({ length: n }).map((_, i) => <span key={i} style={{ width: i === on ? 18 : 6, height: 6, borderRadius: 99, background: i === on ? "var(--red)" : "var(--line-2)", transition: "width .3s var(--ease)" }}></span>)}
    </div>
  );
}

/* ---------- docked bottom nav ---------- */
function BottomNav({ active = "rewards", onNav }) {
  const go = (id) => (onNav ? () => onNav(id) : undefined);
  return (
    <div style={{ marginTop: "auto", display: "grid", gridTemplateColumns: "repeat(5,1fr)", alignItems: "end", borderTop: "1px solid var(--line)", background: "var(--surface)", padding: "9px 6px 13px" }}>
      {D.bottomNav.map((it, i) => {
        const I = Ic[it.icon] || Ix[it.icon] || Ic.User;
        const on = it.id === active;
        if (i === 2) {
          return (
            <button key={it.id} onClick={go(it.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, border: 0, background: "transparent", cursor: "pointer" }}>
              <div style={{ width: 46, height: 46, borderRadius: 16, marginTop: -26, display: "grid", placeItems: "center", color: "#fff", background: "linear-gradient(180deg,#ff2a2a,#c40d0d)", boxShadow: "0 12px 24px -10px rgba(238,0,0,.85),inset 0 1px 0 rgba(255,255,255,.3)", outline: on ? "3px solid var(--bg-2)" : "none", boxShadow: on ? "0 0 0 2px var(--red),0 12px 24px -10px rgba(238,0,0,.85)" : "0 12px 24px -10px rgba(238,0,0,.85),inset 0 1px 0 rgba(255,255,255,.3)" }}><I size={22} /></div>
              <span style={{ font: "700 9.5px/1 Inter", color: on ? "var(--text)" : "var(--muted)" }}>{it.label}</span>
            </button>
          );
        }
        return (
          <button key={it.id} onClick={go(it.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, border: 0, background: "transparent", cursor: "pointer", color: on ? "var(--red)" : "var(--muted-2)" }}>
            <I size={21} />
            <span style={{ font: (on ? "800" : "600") + " 9.5px/1 Inter", color: on ? "var(--text)" : "var(--muted-2)" }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- shared page header (for secondary pages) ---------- */
function PageHeader({ title, sub, tier, tint, ink, action }) {
  const bg = tint || (tier ? "linear-gradient(157deg," + shade(tier.color, 16) + " 0%," + tier.color + " 46%," + shade(tier.color, -30) + " 100%)" : "linear-gradient(157deg,#26262b,#161619 60%,#202027)");
  const fg = ink || (tier ? inkOn(tier.color) : "#fff");
  const soft = fg === "#ffffff" ? "rgba(255,255,255," : "rgba(0,0,0,";
  return (
    <div style={{ position: "relative", padding: "20px 20px 22px", background: bg, color: fg, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(135deg," + soft + ".05) 0 1px,transparent 1px 16px)", pointerEvents: "none" }}></div>
      <div style={{ position: "absolute", top: -70, right: -50, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle," + soft + ".18),transparent 68%)", pointerEvents: "none" }}></div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, background: "linear-gradient(90deg,transparent,rgba(246,221,140,.7) 42%,rgba(212,175,55,.9))" }}></div>
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "600 12px/1 Inter", color: soft + ".82)" }}>{sub}</div>
          <div style={{ font: "800 22px/1.05 Poppins", marginTop: 6 }}>{title}</div>
        </div>
        {action}
      </div>
    </div>
  );
}
function SectionTitle({ children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
      <span className="eyebrow">{children}</span>
      {right}
    </div>
  );
}

/* ===================================================================== */
/* CONCEPT A — "Home Hub": bright app home, banner + tiles               */
/* ===================================================================== */
function ConceptHub({ tier, tiers, acct = "active", onNav, mult = 1 }) {
  const { d, h, m } = useNextDraw();
  const pastdue = acct === "pastdue";
  const guest = acct === "none";
  const onetime = acct === "onetime";
  const member = !pastdue && !guest && !onetime;
  const monthly = tier.entries;
  const monthlyLive = member ? monthly : 0;
  const packs = ONE_TIME;
  const total = guest ? 0 : monthlyLive + packs;
  const PACCESS = { pct: 0.71, left: "5 days" }; // one-time buyers get a time-limited partner-access window
  const teal = "#0ea5a5";
  const tiles = [
    { icon: Ix.Ticket, label: "Packages", badge: mult > 1 ? mult + "×" : "50% OFF", c: CT.red },
    { icon: Ic.Gift, label: "Redeem", badge: "2", c: CT.gold },
    { icon: Ix.Percent, label: "Vouchers", c: CT.blue },
    { icon: Ix.UserPlus, label: "Refer", badge: "+100", c: CT.green },
    { icon: Ic.Trophy, label: "Past Draws", c: CT.amber },
    { icon: Ix.Medal, label: "Milestones", c: CT.violet },
    { icon: Ix.Store, label: "Partners", c: CT.blue },
    { icon: Ix.Headset, label: "Support", c: CT.green }
  ];
  const guestTiles = [
    { icon: Ix.Ticket, label: "Membership", c: CT.red },
    { icon: Ix.Store, label: "Partners", c: CT.blue },
    { icon: Ic.Trophy, label: "Past Draws", c: CT.amber },
    { icon: Ix.Headset, label: "Support", c: CT.green }
  ];
  // header adapts to the package (or a neutral treatment when there's no active plan)
  const ink = member ? inkOn(tier.color) : "#ffffff";
  const soft = ink === "#ffffff" ? "rgba(255,255,255," : "rgba(0,0,0,";
  const headerBg = member
    ? "linear-gradient(157deg," + shade(tier.color, 16) + " 0%," + tier.color + " 46%," + shade(tier.color, -30) + " 100%)"
    : pastdue
      ? "linear-gradient(157deg,#3a2410 0%,#1c1410 55%,#2a1c10 100%)"
      : onetime
        ? "linear-gradient(157deg,#0f4d4d 0%,#0a2e2e 56%,#124a52 100%)"
        : "linear-gradient(157deg,#26262b 0%,#161619 60%,#202027 100%)";
  const glassBg = ink === "#ffffff" ? "rgba(255,255,255,.15)" : "rgba(0,0,0,.13)";
  const glassBd = ink === "#ffffff" ? "rgba(255,255,255,.3)" : "rgba(0,0,0,.18)";
  return (
    <Screen label={"Rewards — Home Hub (" + acct + ")"}>
      {/* cover adopts the package colour; gold seam nods to the draw */}
      <div style={{ position: "relative", padding: "20px 20px 46px", background: headerBg, color: ink, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(135deg," + soft + ".05) 0 1px,transparent 1px 16px)", pointerEvents: "none" }}></div>
        <div style={{ position: "absolute", top: -70, right: -50, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle," + soft + ".2),transparent 68%)", pointerEvents: "none" }}></div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, background: "linear-gradient(90deg,transparent,rgba(246,221,140,.7) 42%,rgba(212,175,55,.9))", pointerEvents: "none" }}></div>
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
          <Mono tier={tier} onBrand />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "600 12px/1 Inter", color: soft + ".82)" }}>{guest ? "Welcome," : "Good evening,"}</div>
            <div style={{ font: "800 19px/1.1 Poppins", marginTop: 5 }}>{NAME}</div>
          </div>
          <button onClick={onNav ? () => onNav("settings") : undefined} style={{ width: 38, height: 38, flex: "none", borderRadius: 11, display: "grid", placeItems: "center", background: glassBg, border: "1px solid " + glassBd, color: ink, cursor: "pointer" }} aria-label="Settings"><Ix.Cog size={18} /></button>
          {member && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <Ring pct={tier.access / 100} size={52} stroke={6} color={ink}>
                <span style={{ font: "800 13px/1 Poppins", color: ink }}>{tier.access}%</span>
              </Ring>
              <span style={{ font: "700 7.5px/1 Inter", letterSpacing: ".1em", textTransform: "uppercase", color: soft + ".72)" }}>Access</span>
            </div>
          )}
          {pastdue && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "800 9px/1 Inter", letterSpacing: ".08em", textTransform: "uppercase", color: "#241a02", background: "linear-gradient(180deg,#fbbf24,#d97706)", padding: "8px 11px", borderRadius: 99 }}><Ic.Shield size={13} /> Past due</span>}
          {onetime && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 66 }}>
              <Ring pct={PACCESS.pct} size={52} stroke={6} color="#fff">
                <span className="num" style={{ font: "800 14px/1 Poppins", color: "#fff" }}>{Math.round(PACCESS.pct * 100)}%</span>
              </Ring>
              <span style={{ font: "700 8px/1.25 Inter", letterSpacing: ".04em", textTransform: "uppercase", color: "rgba(255,255,255,.74)", textAlign: "center" }}>{PACCESS.left} left</span>
            </div>
          )}
        </div>
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, marginTop: 15 }}>
          {member && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "800 10px/1 Inter", letterSpacing: ".06em", textTransform: "uppercase", color: ink, background: glassBg, border: "1px solid " + glassBd, padding: "7px 11px", borderRadius: 99 }}><Ic.Crown size={12} /> {tier.name}</span>}
          {pastdue && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "800 10px/1 Inter", letterSpacing: ".06em", textTransform: "uppercase", color: "#fff", background: glassBg, border: "1px solid " + glassBd, padding: "7px 11px", borderRadius: 99 }}>{tier.name} · paused</span>}
          {guest && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "800 10px/1 Inter", letterSpacing: ".06em", textTransform: "uppercase", color: "#fff", background: glassBg, border: "1px solid " + glassBd, padding: "7px 11px", borderRadius: 99 }}>Guest</span>}
          {onetime && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "800 10px/1 Inter", letterSpacing: ".06em", textTransform: "uppercase", color: "#fff", background: glassBg, border: "1px solid " + glassBd, padding: "7px 11px", borderRadius: 99 }}><Ix.Ticket size={12} /> One-time pack</span>}
          {member && <button style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, font: "800 11.5px/1 Inter", color: ink, background: glassBg, border: "1px solid " + glassBd, borderRadius: 99, padding: "9px 13px", cursor: "pointer" }}><Ic.Gift size={14} /> Reward portal <Ic.ChevronR size={13} /></button>}
          {pastdue && <button style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, font: "800 11.5px/1 Inter", color: "#241a02", background: "linear-gradient(180deg,#fbbf24,#d97706)", border: 0, borderRadius: 99, padding: "9px 14px", cursor: "pointer" }}><Ic.Refresh size={14} /> Update payment</button>}
          {guest && <button style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, font: "800 11.5px/1 Inter", color: "#ee0000", background: "#fff", border: 0, borderRadius: 99, padding: "9px 14px", cursor: "pointer" }}>Become a member <Ic.Arrow size={14} /></button>}
          {onetime && <button style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, font: "800 11.5px/1 Inter", color: "#063d3d", background: "#fff", border: 0, borderRadius: 99, padding: "9px 14px", cursor: "pointer" }}>Become a member <Ic.Arrow size={14} /></button>}
        </div>
      </div>

      <Body>
        {pastdue && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", borderRadius: "var(--r-xl)", background: "linear-gradient(100deg,rgba(217,119,6,.16),rgba(217,119,6,.07))", border: "1px solid rgba(217,119,6,.42)" }}>
            <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, display: "grid", placeItems: "center", background: "rgba(217,119,6,.2)", color: "#d97706" }}><Ic.Shield size={17} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><b style={{ font: "800 13px/1.2 Poppins", color: "var(--text)" }}>Payment failed on 24 Jun</b><div style={{ font: "600 11px/1.4 Inter", color: "var(--muted)", marginTop: 3 }}>Your {monthly} monthly entries are paused until you update payment.</div></div>
          </div>
        )}

        {onetime && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", borderRadius: "var(--r-xl)", background: "linear-gradient(100deg,rgba(14,165,165,.16),rgba(14,165,165,.06))", border: "1px solid rgba(14,165,165,.42)" }}>
            <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, display: "grid", placeItems: "center", background: "rgba(14,165,165,.2)", color: teal }}><Ic.Clock size={17} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><b style={{ font: "800 13px/1.2 Poppins", color: "var(--text)" }}>Partner access ends in {PACCESS.left}</b><div style={{ font: "600 11px/1.4 Inter", color: "var(--muted)", marginTop: 3 }}>Your one-time pack unlocked discounts until 7 Jul. Go a member to keep them.</div></div>
          </div>
        )}

        {guest ? (
          <React.Fragment>
            <div className="card" style={{ marginTop: -32, padding: 20, position: "relative", zIndex: 2, overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg,#f6dd8c,#d4af37 55%,transparent)" }}></div>
              <span style={{ width: 46, height: 46, display: "grid", placeItems: "center", borderRadius: 14, background: "linear-gradient(160deg,#ff5a5a,#c40d0d)", color: "#fff", boxShadow: "0 12px 24px -12px rgba(238,0,0,.7)" }}><Ix.Ticket size={22} /></span>
              <h3 style={{ font: "900 21px/1.12 Poppins", marginTop: 14 }}>Enter the June 27 draw</h3>
              <p style={{ font: "500 12.5px/1.5 Inter", color: "var(--muted)", marginTop: 8 }}>Two ways in: become a member for monthly entries + ongoing discounts, or grab a one-time package for this draw.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 16 }}>
                <Btn variant="primary" style={{ width: "100%" }}>Become a member <Ic.Arrow size={16} /></Btn>
                <Btn variant="outline" style={{ width: "100%", gap: 7 }}><Ix.Ticket size={15} /> Buy a package</Btn>
              </div>
              <div style={{ font: "600 11px/1 Inter", color: "var(--muted-2)", textAlign: "center", marginTop: 11 }}>Membership from $20/mo · packages from $10</div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <span className="eyebrow">What members get</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 13, marginTop: 13 }}>
                {[{ I: Ix.Ticket, t: "Monthly draw entries", s: "Into every $10,000 major draw", c: CT.red }, { I: Ix.Store, t: "Partner discounts", s: "Save across top tool brands", c: CT.blue }, { I: Ix.Flame, t: "Loyalty bonuses", s: "Bonus entries the longer you stay", c: CT.amber }].map((b, i) => {
                  const I = b.I;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ width: 40, height: 40, flex: "none", borderRadius: 12, display: "grid", placeItems: "center", color: "#fff", background: "linear-gradient(158deg," + shade(b.c, 26) + "," + b.c + ")", boxShadow: "0 8px 16px -10px " + b.c }}><I size={19} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ font: "800 13px/1.2 Poppins" }}>{b.t}</div><div style={{ font: "600 11px/1.3 Inter", color: "var(--muted)", marginTop: 3 }}>{b.s}</div></div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="eyebrow" style={{ display: "block", marginBottom: 12 }}>Explore</span>
              <TileGrid tiles={guestTiles} />
            </div>
          </React.Fragment>
        ) : (
          <React.Fragment>
            {/* entries this cycle (breakdown only — no partner access here) */}
            <div className="card" style={{ marginTop: -32, padding: 18, position: "relative", zIndex: 2, overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg,#f6dd8c,#d4af37 55%,transparent)" }}></div>
              <span className="eyebrow">Entries · June 27 draw</span>
              <div style={{ font: "900 52px/.85 Poppins", letterSpacing: "-.02em", marginTop: 9 }}><Num value={total} /></div>
              <div style={{ display: "flex", height: 9, borderRadius: 99, overflow: "hidden", marginTop: 15, border: "1px solid var(--line)" }}>
                <div style={{ width: (total ? monthlyLive / total * 100 : 0) + "%", background: tier.color }}></div>
                <div style={{ flex: 1, background: "var(--good)" }}></div>
              </div>
              <div style={{ display: "flex", gap: 22, marginTop: 12 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, font: "600 11.5px/1 Inter", color: "var(--muted)" }}><span style={{ width: 9, height: 9, borderRadius: 3, background: (pastdue || onetime) ? "var(--muted-2)" : tier.color, flex: "none" }}></span> Membership {pastdue ? <span><s style={{ opacity: .6 }} className="num">{monthly}</s> <b style={{ color: CT.amber }}>paused</b></span> : onetime ? <b className="num" style={{ color: "var(--muted-2)" }}>—</b> : <b className="num" style={{ color: "var(--text)" }}>{monthly}</b>}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8, font: "600 11.5px/1 Inter", color: "var(--muted)" }}><span style={{ width: 9, height: 9, borderRadius: 3, background: "var(--good)", flex: "none" }}></span> One-time packs <b className="num" style={{ color: "var(--text)" }}>{packs}</b></span>
              </div>
              <hr className="hair" style={{ margin: "15px 0 13px" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 7, font: "700 12px/1 Inter", color: "var(--muted)" }}><Ic.Clock size={15} style={{ color: CT.gold }} /> Draw closes in</span>
                <div style={{ display: "flex", gap: 6 }}><CDBox v={d} l="days" accent="rgba(212,175,55,.6)" /><CDBox v={h} l="hrs" /><CDBox v={m} l="min" /></div>
              </div>
            </div>

            <PromoBanner mult={mult} tier={tier} locked={member || onetime} onGet={() => onNav && onNav("draws")} onUpgrade={() => onNav && onNav("membership")} />

            {onetime ? (
              <div style={{ position: "relative", overflow: "hidden", borderRadius: "var(--r-xl)", padding: 17, color: "#fff", background: "linear-gradient(150deg,#0f5f5f,#0a3838)", boxShadow: "0 16px 34px -20px rgba(14,165,165,.7)" }}>
                <div style={{ position: "absolute", top: -30, right: -20, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,255,255,.14),transparent 70%)", pointerEvents: "none" }}></div>
                <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <span style={{ width: 40, height: 40, flex: "none", borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(255,255,255,.14)", color: "#fff" }}><Ic.Crown size={20} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ font: "800 15px/1.15 Poppins" }}>Make it permanent</b>
                    <div style={{ font: "600 11.5px/1.4 Inter", color: "rgba(255,255,255,.72)", marginTop: 4 }}>Become a member to keep partner discounts year-round and start a loyalty streak toward free entries.</div>
                  </div>
                </div>
                <button style={{ width: "100%", marginTop: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, font: "800 12.5px/1 Inter", color: "#063d3d", background: "#fff", border: 0, borderRadius: 99, padding: "12px", cursor: "pointer" }}>Become a member <Ic.Arrow size={16} /></button>
              </div>
            ) : (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, font: "800 13.5px/1 Poppins" }}><Ix.Flame size={17} style={{ color: CT.amber }} /> Loyalty streak</span>
                <span className="chip" style={{ padding: "4px 9px", color: pastdue ? "#d97706" : CT.amber, borderColor: (pastdue ? "#d97706" : CT.amber) + "66" }}>{pastdue ? "At risk" : "3 months"}</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>{[1, 1, 1, 0, 0, 0].map((f, i) => <span key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: f ? "linear-gradient(180deg," + CTd.amber + "," + CT.amber + ")" : "var(--inset)", border: "1px solid " + (f ? CT.amber : "var(--line)") }}></span>)}</div>
              <p style={{ font: "600 11.5px/1.45 Inter", color: "var(--muted)", marginTop: 12 }}>{pastdue ? <span><b style={{ color: "#d97706" }}>Reactivate to keep your streak</b> — it resets if payment isn't updated.</span> : <span><b style={{ color: "var(--text)" }}>+250 free entries</b> unlock at 6 months — 3 to go. Keep your membership active.</span>}</p>
            </div>
            )}

            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span className="eyebrow">Quick actions</span>
                <span style={{ font: "700 11px/1 Inter", color: "var(--muted)" }}>Edit</span>
              </div>
              <TileGrid tiles={tiles} />
            </div>

            <div className="card" style={{ padding: "6px 16px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 8px" }}>
                <div>
                  <div style={{ font: "800 14px/1.2 Poppins" }}>Partner discounts</div>
                  <div style={{ font: "600 11px/1.3 Inter", color: onetime ? teal : "var(--muted)", marginTop: 5 }}>{onetime ? "Access ends in " + PACCESS.left + " · from your pack" : "Australia's top tool brands, ready to use"}</div>
                </div>
                <span style={{ display: "flex", alignItems: "center", gap: 4, font: "800 12px/1 Inter", color: tier.color, cursor: "pointer" }}>See all <Ic.ChevronR size={14} /></span>
              </div>
              {dealsSample.slice(0, 2).map((dl, i) => <DealRow key={i} d={dl} tier={tier} compact />)}
            </div>
          </React.Fragment>
        )}
      </Body>

      <BottomNav active="overview" onNav={onNav} />
    </Screen>
  );
}

/* the trailing brace above closes ConceptHub */

/* ===================================================================== */
/* CONCEPT B — "Black Card": luxe membership card + tiles                */
/* ===================================================================== */
function ConceptCard({ tier, tiers }) {
  const { d, h, m } = useNextDraw();
  const monthly = tier.entries, total = monthly + ONE_TIME;
  const pills = [
    { l: "This month", v: monthly, s: "" },
    { l: "Total entries", v: total, s: "" },
    { l: "Access", v: tier.access, s: "%" }
  ];
  const tiles = [
    { icon: Ix.Ticket, label: "Packages", badge: "50%", c: CTd.red },
    { icon: Ic.Gift, label: "Redeem", c: CTd.gold },
    { icon: Ix.UserPlus, label: "Refer", badge: "+100", c: CTd.green },
    { icon: Ic.Trophy, label: "Draws", c: CTd.amber }
  ];
  return (
    <Screen label="Rewards — Black Card concept">
      {/* dark cover header */}
      <div style={{ position: "relative", padding: "20px 20px 22px", color: "#fff", background: "linear-gradient(160deg,#1a1a1e,#0b0b0d)", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(360px 180px at 88% -30%," + tier.color + "44,transparent 62%)", pointerEvents: "none" }}></div>
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, flex: "none", borderRadius: 14, display: "grid", placeItems: "center", font: "900 16px/1 Poppins", color: inkOn(tier.color), background: glossGrad(tier.color) }}>{MON}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "600 12px/1 Inter", color: "rgba(255,255,255,.68)" }}>Welcome back,</div>
            <div style={{ font: "800 19px/1.1 Poppins", marginTop: 5 }}>{NAME}</div>
          </div>
          <button className="icon-btn" style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(255,255,255,.08)", borderColor: "rgba(255,255,255,.16)", color: "#fff" }} aria-label="Notifications"><Ix.Bell size={17} /></button>
        </div>
      </div>

      <Body>
        {/* the premium card */}
        <div style={{ position: "relative", overflow: "hidden", borderRadius: 22, padding: "20px 22px 22px", color: "#fff", background: "linear-gradient(152deg,#1a1a1e 0%,#0b0b0d 58%,#151517 100%)", border: "1px solid rgba(255,255,255,.14)", boxShadow: "0 30px 60px -26px rgba(0,0,0,.75),inset 0 1px 0 rgba(255,255,255,.12)", aspectRatio: "1.586 / 1", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(135deg,rgba(255,255,255,.05) 0 1px,transparent 1px 15px)", pointerEvents: "none" }}></div>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(420px 200px at 88% -20%," + tier.color + "3a,transparent 62%)", pointerEvents: "none" }}></div>
          <div style={{ position: "absolute", top: 0, left: "-55%", width: "50%", height: "100%", background: "linear-gradient(105deg,transparent,rgba(255,255,255,.16),transparent)", transform: "skewX(-18deg)", animation: "shimmer 3.6s var(--ease) infinite", pointerEvents: "none", zIndex: 0 }}></div>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg," + tier.color + ",transparent 72%)" }}></div>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div className="logomark" style={{ width: 28, height: 28, fontSize: 12 }}>TA</div>
              <span style={{ font: "800 10px/1.2 Inter", letterSpacing: ".22em", textTransform: "uppercase", color: "rgba(255,255,255,.7)" }}>Tools<br />Australia</span>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "900 10px/1 Inter", letterSpacing: ".14em", textTransform: "uppercase", color: inkOn(tier.color), background: tier.color, padding: "6px 11px", borderRadius: 7 }}><Ic.Crown size={13} /> {tier.name}</span>
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 13 }}>
            <div style={{ width: 40, height: 30, flex: "none", borderRadius: 7, background: "linear-gradient(135deg,#f6dd8c,#c9a13a 55%,#8f6f22)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.55),inset 0 -1px 2px rgba(0,0,0,.35)", display: "grid", placeItems: "center" }}><Ix.Chip size={22} style={{ color: "#5a4410" }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "700 9px/1 Inter", letterSpacing: ".2em", textTransform: "uppercase", color: "rgba(255,255,255,.5)" }}>Member</div>
              <div style={{ font: "800 21px/1 Poppins", marginTop: 6 }}>{NAME}</div>
            </div>
            <Ix.Nfc size={19} style={{ color: "rgba(255,255,255,.6)", transform: "rotate(90deg)" }} />
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ font: "700 8.5px/1 Inter", letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(255,255,255,.5)" }}>Member no.</div>
              <div className="num" style={{ font: "800 14px/1 Poppins", marginTop: 5, letterSpacing: ".12em" }}>•••• 4827</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ font: "700 8.5px/1 Inter", letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(255,255,255,.5)" }}>Entries / month</div>
              <div className="num" style={{ font: "900 22px/1 Poppins", marginTop: 4, color: tier.color }}>{monthly}</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {pills.map((p) => (
            <div key={p.l} className="card" style={{ flex: 1, padding: "14px 8px", textAlign: "center" }}>
              <div style={{ font: "900 22px/1 Poppins", color: "var(--text)" }}><Num value={p.v} suffix={p.s} /></div>
              <div style={{ font: "700 9px/1.2 Inter", letterSpacing: ".07em", textTransform: "uppercase", color: "var(--muted)", marginTop: 7 }}>{p.l}</div>
            </div>
          ))}
        </div>

        <TileGrid tiles={tiles} cols={4} />

        <div className="dark-card" style={{ padding: 16, color: "#fff" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ font: "800 15px/1 Poppins" }}>June Major Draw</div>
              <div style={{ font: "600 11px/1 Inter", color: "rgba(255,255,255,.6)", marginTop: 6 }}>Drawn live · 27th, 8:30 PM AEST</div>
            </div>
            <div className="draw-countdown on-dark"><div className="dcd-boxes"><CDBox v={d} l="days" accent="rgba(212,175,55,.6)" /><CDBox v={h} l="hrs" /><CDBox v={m} l="min" /></div></div>
          </div>
        </div>

        <div className="card" style={{ padding: "6px 16px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0 3px" }}>
            <span className="eyebrow">Partner discounts · unlocked</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4, font: "800 11px/1 Inter", color: tier.color }}>All <Ic.ChevronR size={13} /></span>
          </div>
          {dealsSample.map((dl, i) => <DealRow key={i} d={dl} tier={tier} />)}
        </div>
      </Body>

      <BottomNav active="rewards" />
    </Screen>
  );
}

/* ===================================================================== */
/* CONCEPT C — "Bento": colorful cover + dense grid                      */
/* ===================================================================== */
function ConceptBento({ tier, tiers }) {
  const { d, h } = useNextDraw();
  const monthly = tier.entries, total = monthly + ONE_TIME;
  const tile = { borderRadius: "var(--r-xl)" };
  const tiles = [
    { icon: Ix.Ticket, label: "Packages", badge: "50%", c: CT.red },
    { icon: Ic.Gift, label: "Redeem", c: CT.gold },
    { icon: Ix.Percent, label: "Vouchers", c: CT.blue },
    { icon: Ix.UserPlus, label: "Refer", badge: "+100", c: CT.green }
  ];
  return (
    <Screen label="Rewards — Bento concept">
      {/* colorful tier cover */}
      <div style={{ position: "relative", padding: "20px 20px 22px", color: inkOn(tier.color), background: glossGrad(tier.color), overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(135deg,rgba(255,255,255,.12) 0 1px,transparent 1px 16px)", pointerEvents: "none" }}></div>
        <div style={{ position: "absolute", top: -40, right: -30, width: 150, height: 150, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,255,255,.25),transparent 70%)" }}></div>
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, flex: "none", borderRadius: 14, display: "grid", placeItems: "center", font: "900 16px/1 Poppins", color: tier.color, background: inkOn(tier.color) === "#ffffff" ? "rgba(255,255,255,.16)" : "#fff", border: "1px solid rgba(255,255,255,.4)" }}>{MON}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "700 11px/1 Inter", letterSpacing: ".1em", textTransform: "uppercase", opacity: .8 }}>{tier.name} member</div>
            <div style={{ font: "800 19px/1.1 Poppins", marginTop: 5 }}>{NAME}</div>
          </div>
          <button style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", border: "1px solid rgba(0,0,0,.12)", background: "rgba(255,255,255,.2)", color: "inherit", cursor: "pointer" }} aria-label="Settings"><Ic.Settings size={17} /></button>
        </div>
      </div>

      <Body>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
          <div className="card" style={{ ...tile, gridColumn: "1 / -1", padding: 18 }}>
            <span className="eyebrow">Total entries · June draw</span>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 10 }}>
              <div style={{ font: "900 46px/.85 Poppins", letterSpacing: "-.02em" }}><Num value={total} /></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingBottom: 4 }}>
                <span style={{ font: "700 11px/1 Inter", color: "var(--muted)" }}><b className="num" style={{ color: tier.color }}>{monthly}</b> membership</span>
                <span style={{ font: "700 11px/1 Inter", color: "var(--muted)" }}><b className="num" style={{ color: "var(--good)" }}>{ONE_TIME}</b> one-time</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 3, marginTop: 14, alignItems: "flex-end", height: 30 }}>
              {[38, 52, 44, 66, 58, 80, 72, 94].map((hgt, i) => <span key={i} style={{ flex: 1, height: hgt + "%", borderRadius: 3, background: i === 7 ? tier.color : "var(--inset)" }}></span>)}
            </div>
          </div>

          <div className="card" style={{ ...tile, padding: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
            <Ring pct={tier.access / 100} size={78} stroke={8} color={tier.color}>
              <span className="num" style={{ font: "800 17px/1 Poppins", color: tier.color }}>{tier.access}%</span>
            </Ring>
            <div style={{ font: "700 10.5px/1.3 Inter", color: "var(--muted)", textAlign: "center", letterSpacing: ".04em", textTransform: "uppercase" }}>Brands<br />unlocked</div>
          </div>

          <div className="card" style={{ ...tile, padding: 16, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, font: "700 10px/1 Inter", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}><Ic.Clock size={13} style={{ color: tier.color }} /> Next draw</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <span className="num" style={{ font: "900 30px/1 Poppins" }}>{d}</span><span style={{ font: "700 12px/1 Inter", color: "var(--muted)" }}>d</span>
              <span className="num" style={{ font: "900 30px/1 Poppins", marginLeft: 6 }}>{h}</span><span style={{ font: "700 12px/1 Inter", color: "var(--muted)" }}>h</span>
            </div>
            <span style={{ font: "600 10.5px/1 Inter", color: "var(--muted-2)" }}>Closes 27th · 8:30 PM</span>
          </div>

          <div className="card" style={{ ...tile, gridColumn: "1 / -1", padding: "6px 16px" }}>
            {D.redeemables.claimable.map((r, i) => {
              const RIc = Ic[r.icon] || Ic.Gift;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < D.redeemables.claimable.length - 1 ? "1px solid var(--line)" : "none" }}>
                  <div style={{ width: 34, height: 34, flex: "none", borderRadius: 10, display: "grid", placeItems: "center", background: "var(--inset)", color: "var(--gold)" }}><RIc size={17} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "700 12.5px/1.2 Inter" }}>{r.title}</div>
                    <div style={{ font: "600 10.5px/1 Inter", color: "var(--muted)", marginTop: 3 }}>{r.sub}</div>
                  </div>
                  <Btn variant="gold" size="sm" style={{ padding: "7px 13px", minHeight: 0, fontSize: ".8rem" }}>Claim</Btn>
                </div>
              );
            })}
          </div>

          <div className="card" style={{ ...tile, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7, font: "800 11px/1 Inter", letterSpacing: ".04em", color: CT.amber }}><Ix.Flame size={16} /> 3-MO STREAK</span>
            <div style={{ display: "flex", gap: 5 }}>{[1, 1, 1, 0, 0, 0].map((f, i) => <span key={i} style={{ flex: 1, height: 7, borderRadius: 4, background: f ? CT.amber : "var(--inset)", border: "1px solid " + (f ? CT.amber : "var(--line)") }}></span>)}</div>
            <span style={{ font: "600 10.5px/1.3 Inter", color: "var(--muted)" }}><b style={{ color: "var(--text)" }}>+250</b> entries at 6 months</span>
          </div>
          <div className="card" style={{ ...tile, padding: 16, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, font: "700 10px/1 Inter", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}><Ic.Ticket size={13} style={{ color: tier.color }} /> Entries this year</span>
            <span className="num" style={{ font: "900 30px/1 Poppins", color: tier.color }}>1,240</span>
            <span style={{ font: "600 10.5px/1.25 Inter", color: "var(--muted-2)" }}>across 2026 draws</span>
          </div>
        </div>

        <div>
          <span className="eyebrow" style={{ display: "block", marginBottom: 12 }}>Quick actions</span>
          <TileGrid tiles={tiles} />
        </div>

        <div className="card" style={{ ...tile, padding: "6px 16px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0 3px" }}>
            <span className="eyebrow">Live partner deals</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4, font: "800 11px/1 Inter", color: tier.color }}>All <Ic.ChevronR size={13} /></span>
          </div>
          {dealsSample.map((dl, i) => <DealRow key={i} d={dl} tier={tier} compact />)}
        </div>
      </Body>

      <BottomNav active="rewards" />
    </Screen>
  );
}

/* ===================================================================== */
/* GALLERY                                                               */
/* ===================================================================== */
function ConceptCol({ id, title, desc, children }) {
  return (
    <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <div id={id} style={{ display: "flex", alignItems: "center", gap: 11, paddingLeft: 2 }}>
        <span style={{ font: "800 12px/1 Inter", letterSpacing: ".04em", color: "var(--surface)", background: "var(--text)", padding: "6px 10px", borderRadius: 8 }}>{id}</span>
        <div>
          <div style={{ font: "800 15px/1 Poppins" }}>{title}</div>
          <div style={{ font: "600 12px/1 Inter", color: "var(--muted)", marginTop: 4 }}>{desc}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

/* ===================================================================== */
/* DESKTOP — Home Hub for wide screens (sidebar + multi-column)          */
/* ===================================================================== */
function DeskNav({ active, onNav }) {
  const items = [
    { id: "overview", label: "Dashboard", icon: Ix.Grid },
    { id: "draws", label: "Draws", icon: Ix.Ticket },
    { id: "rewards", label: "Rewards", icon: Ic.Gift },
    { id: "account-membership", label: "Membership", icon: Ic.Card },
    { id: "support", label: "Support", icon: Ix.Headset }
  ];
  return (
    <div style={{ width: 236, flex: "none", borderRight: "1px solid var(--line)", background: "var(--surface)", display: "flex", flexDirection: "column", padding: "22px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "4px 8px 22px" }}>
        <div className="logomark" style={{ width: 34, height: 34 }}>TA</div>
        <div>
          <div style={{ font: "800 14px/1 Poppins" }}>Tools Australia</div>
          <div style={{ font: "600 10.5px/1 Inter", color: "var(--muted)", marginTop: 4 }}>Rewards</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((it) => {
          const I = it.icon, on = it.id === active;
          return (
            <button key={it.id} onClick={onNav ? () => onNav(it.id) : undefined} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", borderRadius: 12, border: 0, cursor: "pointer", textAlign: "left", background: on ? "var(--inset)" : "transparent", color: on ? "var(--text)" : "var(--muted)", font: (on ? "800" : "600") + " 13px/1 Inter" }}>
              <I size={19} style={{ color: on ? "var(--red)" : "var(--muted-2)" }} /> {it.label}
            </button>
          );
        })}
      </div>
      <button onClick={onNav ? () => onNav("settings") : undefined} style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 11, padding: "12px 8px 0", borderTop: "1px solid var(--line)", border: 0, borderTop: "1px solid var(--line)", background: "transparent", cursor: "pointer", textAlign: "left", width: "100%" }}>
        <div style={{ width: 36, height: 36, flex: "none", borderRadius: 11, display: "grid", placeItems: "center", font: "900 13px/1 Poppins", color: "#fff", background: "linear-gradient(150deg,#555,#222)" }}>{MON}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "800 12.5px/1 Poppins", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{NAME}</div>
          <div style={{ font: "600 10px/1 Inter", color: "var(--muted)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{EMAIL}</div>
        </div>
        <Ix.Cog size={16} style={{ color: "var(--muted-2)", flex: "none" }} />
      </button>
    </div>
  );
}

/* Desktop frame: sidebar + scrolling content, shared by all desktop pages */
function DeskShell({ active, onNav, sheet, onCloseSheet, tier, acct, children }) {
  return (
    <div data-screen-label={"Desktop — " + active} style={{ position: "relative", width: 1240, flex: "0 0 auto", display: "flex", height: 828, borderRadius: 22, border: "1px solid var(--line)", background: "var(--bg-2)", boxShadow: "var(--shadow-lg)", overflow: "hidden" }}>
      <DeskNav active={active} onNav={onNav} />
      <div style={{ flex: 1, minWidth: 0, overflowY: "auto", background: "var(--bg)" }}>{children}</div>
      {sheet === "support" && <SupportSheet desktop onClose={onCloseSheet} />}
      {sheet === "payment" && <PaymentSheet desktop onClose={onCloseSheet} />}
      {sheet === "manage" && <ManageSheet desktop tier={tier} acct={acct} onNav={onNav} onClose={onCloseSheet} />}
    </div>
  );
}

/* Page frame: phone Screen + BottomNav on mobile; bare content on desktop */
function Frame({ label, desktop, active, onNav, children }) {
  if (desktop) return <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", width: "100%" }}>{children}</div>;
  return <Screen label={label}>{children}<BottomNav active={active} onNav={onNav} /></Screen>;
}

function ConceptHubDesktop({ tier, acct = "active", onNav, mult = 1 }) {
  const { d, h, m } = useNextDraw();
  const pastdue = acct === "pastdue", guest = acct === "none", onetime = acct === "onetime";
  const member = !pastdue && !guest && !onetime;
  const monthly = tier.entries;
  const packs = ONE_TIME;
  const total = guest ? 0 : (member ? monthly : 0) + packs;
  const PACCESS = { pct: 0.71, left: "5 days" };
  const teal = "#0ea5a5";
  const ink = member ? inkOn(tier.color) : "#ffffff";
  const soft = ink === "#ffffff" ? "rgba(255,255,255," : "rgba(0,0,0,";
  const heroBg = member
    ? "linear-gradient(120deg," + shade(tier.color, 16) + " 0%," + tier.color + " 52%," + shade(tier.color, -26) + " 100%)"
    : pastdue ? "linear-gradient(120deg,#3a2410,#1c1410 60%,#2a1c10)"
      : onetime ? "linear-gradient(120deg,#0f4d4d,#0a2e2e 58%,#124a52)"
        : "linear-gradient(120deg,#26262b,#161619 60%,#202027)";
  const glassBg = ink === "#ffffff" ? "rgba(255,255,255,.15)" : "rgba(0,0,0,.13)";
  const glassBd = ink === "#ffffff" ? "rgba(255,255,255,.3)" : "rgba(0,0,0,.18)";
  const tiles = [
    { icon: Ix.Ticket, label: "Packages", badge: mult > 1 ? mult + "×" : "50% OFF", c: CT.red },
    { icon: Ic.Gift, label: "Redeem", badge: "2", c: CT.gold },
    { icon: Ix.Percent, label: "Vouchers", c: CT.blue },
    { icon: Ix.UserPlus, label: "Refer", badge: "+100", c: CT.green },
    { icon: Ic.Trophy, label: "Past Draws", c: CT.amber },
    { icon: Ix.Medal, label: "Milestones", c: CT.violet }
  ];
  const chip = member ? { t: tier.name, i: Ic.Crown } : pastdue ? { t: tier.name + " · paused", i: Ic.Shield } : onetime ? { t: "One-time pack", i: Ix.Ticket } : { t: "Guest", i: Ic.User };

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
        {/* hero band — adopts package colour */}
        <div style={{ position: "relative", padding: "26px 30px", background: heroBg, color: ink, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(135deg," + soft + ".05) 0 1px,transparent 1px 17px)", pointerEvents: "none" }}></div>
          <div style={{ position: "absolute", top: -90, right: 40, width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle," + soft + ".16),transparent 68%)", pointerEvents: "none" }}></div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, background: "linear-gradient(90deg,transparent,rgba(246,221,140,.65) 46%,rgba(212,175,55,.9))" }}></div>
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 16 }}>
            <Mono tier={tier} onBrand size={52} radius={16} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "600 13px/1 Inter", color: soft + ".82)" }}>{guest ? "Welcome," : "Good evening,"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 6 }}>
                <span style={{ font: "800 24px/1 Poppins" }}>{NAME}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "800 10px/1 Inter", letterSpacing: ".06em", textTransform: "uppercase", color: ink, background: glassBg, border: "1px solid " + glassBd, padding: "7px 11px", borderRadius: 99 }}>{React.createElement(chip.i, { size: 12 })} {chip.t}</span>
              </div>
            </div>
            {member && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <Ring pct={tier.access / 100} size={58} stroke={7} color={ink}><span style={{ font: "800 14px/1 Poppins", color: ink }}>{tier.access}%</span></Ring>
                <span style={{ font: "700 8px/1 Inter", letterSpacing: ".1em", textTransform: "uppercase", color: soft + ".72)" }}>Access</span>
              </div>
            )}
            {onetime && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 72 }}>
                <Ring pct={PACCESS.pct} size={58} stroke={7} color="#fff"><span style={{ font: "800 14px/1 Poppins", color: "#fff" }}>{Math.round(PACCESS.pct * 100)}%</span></Ring>
                <span style={{ font: "700 8px/1.2 Inter", letterSpacing: ".04em", textTransform: "uppercase", color: soft + ".74)", textAlign: "center" }}>{PACCESS.left} left</span>
              </div>
            )}
            {member && <button style={{ display: "inline-flex", alignItems: "center", gap: 8, font: "800 12.5px/1 Inter", color: ink, background: glassBg, border: "1px solid " + glassBd, borderRadius: 99, padding: "12px 17px", cursor: "pointer" }}><Ic.Gift size={15} /> Reward portal <Ic.ChevronR size={14} /></button>}            {pastdue && <button style={{ display: "inline-flex", alignItems: "center", gap: 8, font: "800 12.5px/1 Inter", color: "#241a02", background: "linear-gradient(180deg,#fbbf24,#d97706)", border: 0, borderRadius: 99, padding: "12px 18px", cursor: "pointer" }}><Ic.Refresh size={15} /> Update payment</button>}
            {(guest || onetime) && <button style={{ display: "inline-flex", alignItems: "center", gap: 8, font: "800 12.5px/1 Inter", color: onetime ? "#063d3d" : "#ee0000", background: "#fff", border: 0, borderRadius: 99, padding: "12px 18px", cursor: "pointer" }}>Become a member <Ic.Arrow size={15} /></button>}
          </div>
        </div>

        {/* content */}
        <div style={{ flex: 1, padding: 26, display: "flex", gap: 22, alignItems: "flex-start" }}>
          {/* main column */}
          <div style={{ flex: "1.7", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
            {pastdue && (
              <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "15px 18px", borderRadius: "var(--r-xl)", background: "linear-gradient(100deg,rgba(217,119,6,.16),rgba(217,119,6,.06))", border: "1px solid rgba(217,119,6,.42)" }}>
                <span style={{ width: 38, height: 38, flex: "none", borderRadius: 11, display: "grid", placeItems: "center", background: "rgba(217,119,6,.2)", color: "#d97706" }}><Ic.Shield size={19} /></span>
                <div style={{ flex: 1 }}><b style={{ font: "800 14px/1.2 Poppins" }}>Payment failed on 24 Jun</b><div style={{ font: "600 12px/1.4 Inter", color: "var(--muted)", marginTop: 3 }}>Your {monthly} monthly entries are paused until you update payment.</div></div>
              </div>
            )}
            {onetime && (
              <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "15px 18px", borderRadius: "var(--r-xl)", background: "linear-gradient(100deg,rgba(14,165,165,.16),rgba(14,165,165,.05))", border: "1px solid rgba(14,165,165,.42)" }}>
                <span style={{ width: 38, height: 38, flex: "none", borderRadius: 11, display: "grid", placeItems: "center", background: "rgba(14,165,165,.2)", color: teal }}><Ic.Clock size={19} /></span>
                <div style={{ flex: 1 }}><b style={{ font: "800 14px/1.2 Poppins" }}>Partner access ends in {PACCESS.left}</b><div style={{ font: "600 12px/1.4 Inter", color: "var(--muted)", marginTop: 3 }}>Your one-time pack unlocked discounts until 7 Jul. Go a member to keep them.</div></div>
              </div>
            )}

            {guest ? (
              <div className="card" style={{ padding: 26, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg,#f6dd8c,#d4af37 55%,transparent)" }}></div>
                <span style={{ width: 50, height: 50, display: "grid", placeItems: "center", borderRadius: 15, background: "linear-gradient(160deg,#ff5a5a,#c40d0d)", color: "#fff", boxShadow: "0 12px 24px -12px rgba(238,0,0,.7)" }}><Ix.Ticket size={24} /></span>
                <h3 style={{ font: "900 26px/1.1 Poppins", marginTop: 16 }}>Enter the June 27 draw</h3>
                <p style={{ font: "500 13.5px/1.5 Inter", color: "var(--muted)", marginTop: 9, maxWidth: 480 }}>Two ways in: become a member for monthly entries + ongoing discounts, or grab a one-time package for this draw.</p>
                <div style={{ display: "flex", gap: 11, marginTop: 18 }}>
                  <Btn variant="primary">Become a member <Ic.Arrow size={17} /></Btn>
                  <Btn variant="outline" style={{ gap: 8 }}><Ix.Ticket size={16} /> Buy a package</Btn>
                </div>
              </div>
            ) : (
              <React.Fragment>
                {/* entries card — wide */}
                <div className="card" style={{ padding: 24, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg,#f6dd8c,#d4af37 55%,transparent)" }}></div>
                  <div style={{ display: "flex", alignItems: "stretch", gap: 26 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className="eyebrow">Entries · June 27 draw</span>
                      <div style={{ font: "900 60px/.85 Poppins", letterSpacing: "-.02em", marginTop: 10 }}><Num value={total} /></div>
                      <div style={{ display: "flex", height: 9, borderRadius: 99, overflow: "hidden", marginTop: 16, border: "1px solid var(--line)", maxWidth: 380 }}>
                        <div style={{ width: (total ? (member ? monthly : 0) / total * 100 : 0) + "%", background: tier.color }}></div>
                        <div style={{ flex: 1, background: "var(--good)" }}></div>
                      </div>
                      <div style={{ display: "flex", gap: 26, marginTop: 13 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, font: "600 12px/1 Inter", color: "var(--muted)" }}><span style={{ width: 9, height: 9, borderRadius: 3, background: (pastdue || onetime) ? "var(--muted-2)" : tier.color }}></span> Membership {pastdue ? <b style={{ color: CT.amber }}>paused</b> : onetime ? <b className="num" style={{ color: "var(--muted-2)" }}>—</b> : <b className="num" style={{ color: "var(--text)" }}>{monthly}</b>}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, font: "600 12px/1 Inter", color: "var(--muted)" }}><span style={{ width: 9, height: 9, borderRadius: 3, background: "var(--good)" }}></span> One-time packs <b className="num" style={{ color: "var(--text)" }}>{packs}</b></span>
                      </div>
                    </div>
                    <div style={{ width: 1, background: "var(--line)" }}></div>
                    <div style={{ flex: "none", display: "flex", flexDirection: "column", justifyContent: "center", gap: 11, minWidth: 210 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, font: "700 11px/1 Inter", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}><Ic.Clock size={15} style={{ color: CT.gold }} /> Draw closes in</span>
                      <div style={{ display: "flex", gap: 8 }}><CDBox v={d} l="days" accent="rgba(212,175,55,.6)" /><CDBox v={h} l="hrs" /><CDBox v={m} l="min" /></div>
                    </div>
                  </div>
                </div>

                {/* promo banner — wide */}
                <PromoBanner mult={mult} wide tier={tier} locked={member || onetime} onGet={() => onNav && onNav("draws")} onUpgrade={() => onNav && onNav("membership")} />

                {/* partner discounts */}
                <div className="card" style={{ padding: "8px 20px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 15, padding: "16px 0 6px" }}>
                    <Ring pct={onetime ? PACCESS.pct : tier.access / 100} size={58} stroke={7} color={onetime ? teal : tier.color}><span className="num" style={{ font: "800 14px/1 Poppins", color: onetime ? teal : tier.color }}>{onetime ? Math.round(PACCESS.pct * 100) : tier.access}%</span></Ring>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: "800 15px/1.2 Poppins" }}>Partner discounts</div>
                      <div style={{ font: "600 11.5px/1.3 Inter", color: onetime ? teal : "var(--muted)", marginTop: 5 }}>{onetime ? "Access ends in " + PACCESS.left + " · from your pack" : "of the catalogue unlocked · top tool brands"}</div>
                    </div>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, font: "800 12.5px/1 Inter", color: tier.color, cursor: "pointer" }}>See all <Ic.ChevronR size={14} /></span>
                  </div>
                  <hr className="hair" style={{ margin: "8px 0 0" }} />
                  {dealsSample.map((dl, i) => <DealRow key={i} d={dl} tier={onetime ? { color: teal } : tier} />)}
                </div>
              </React.Fragment>
            )}
          </div>

          {/* aside column */}
          <div style={{ flex: "1", minWidth: 260, display: "flex", flexDirection: "column", gap: 20 }}>
            {!guest && (onetime ? (
              <div style={{ position: "relative", overflow: "hidden", borderRadius: "var(--r-xl)", padding: 20, color: "#fff", background: "linear-gradient(150deg,#0f5f5f,#0a3838)", boxShadow: "0 16px 34px -20px rgba(14,165,165,.7)" }}>
                <span style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: 12, background: "rgba(255,255,255,.14)" }}><Ic.Crown size={21} /></span>
                <b style={{ display: "block", font: "800 16px/1.15 Poppins", marginTop: 13 }}>Make it permanent</b>
                <p style={{ font: "600 12px/1.45 Inter", color: "rgba(255,255,255,.72)", marginTop: 7 }}>Become a member to keep partner discounts year-round and start a loyalty streak toward free entries.</p>
                <button style={{ width: "100%", marginTop: 15, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, font: "800 12.5px/1 Inter", color: "#063d3d", background: "#fff", border: 0, borderRadius: 99, padding: "12px", cursor: "pointer" }}>Become a member <Ic.Arrow size={16} /></button>
              </div>
            ) : (
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 13 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, font: "800 14px/1 Poppins" }}><Ix.Flame size={18} style={{ color: CT.amber }} /> Loyalty streak</span>
                  <span className="chip" style={{ padding: "4px 9px", color: pastdue ? "#d97706" : CT.amber, borderColor: (pastdue ? "#d97706" : CT.amber) + "66" }}>{pastdue ? "At risk" : "3 months"}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>{[1, 1, 1, 0, 0, 0].map((f, i) => <span key={i} style={{ flex: 1, height: 9, borderRadius: 4, background: f ? "linear-gradient(180deg," + CTd.amber + "," + CT.amber + ")" : "var(--inset)", border: "1px solid " + (f ? CT.amber : "var(--line)") }}></span>)}</div>
                <p style={{ font: "600 12px/1.45 Inter", color: "var(--muted)", marginTop: 13 }}>{pastdue ? <span><b style={{ color: "#d97706" }}>Reactivate to keep your streak</b> — it resets if payment isn't updated.</span> : <span><b style={{ color: "var(--text)" }}>+250 free entries</b> unlock at 6 months — 3 to go.</span>}</p>
              </div>
            ))}

            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 15 }}>
                <span className="eyebrow">Quick actions</span>
                <span style={{ font: "700 11px/1 Inter", color: "var(--muted)" }}>Edit</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, rowGap: 16 }}>
                {tiles.map((t, i) => <QuickTile key={i} {...t} />)}
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}

/* ===================================================================== */
/* REWARDS PAGE — milestones, claiming, partner discounts                */
/* ===================================================================== */
function ClaimRow({ r, i, last, disabled }) {
  const RIc = Ic[r.icon] || Ic.Gift;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 0", borderBottom: last ? "none" : "1px solid var(--line)" }}>
      <div style={{ width: 42, height: 42, flex: "none", borderRadius: 12, display: "grid", placeItems: "center", color: "#fff", background: "linear-gradient(158deg,#f6dd8c,#d4af37)", boxShadow: "0 8px 16px -10px var(--gold)" }}><RIc size={20} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "700 13.5px/1.2 Inter" }}>{r.title}</div>
        <div style={{ font: "600 11.5px/1 Inter", color: "var(--muted)", marginTop: 4 }}>{r.sub}</div>
      </div>
      {disabled ? <span style={{ font: "700 11px/1 Inter", color: "var(--muted-2)" }}>Paused</span> : <Btn variant="gold" size="sm">Claim</Btn>}
    </div>
  );
}
function MilestoneTrack({ tier, pastdue }) {
  const accent = pastdue ? "#d97706" : CT.amber;
  const accent2 = pastdue ? "#b45309" : CTd.amber;
  const stops = [
    { m: 3, label: "3 mo", reward: "+50", done: true },
    { m: 6, label: "6 mo", reward: "+250", cur: true },
    { m: 9, label: "9 mo", reward: "Free pack" },
    { m: 12, label: "1 yr", reward: "+600" }
  ];
  const pct = 3 / 12 * 100;
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* current-goal hero */}
      <div style={{ position: "relative", padding: "16px 18px", color: "#241a02", background: pastdue ? "linear-gradient(120deg,#fcd77f,#e39710 62%,#b45309)" : "linear-gradient(120deg,#f6dd8c,#d4af37 60%,#a87f1d)", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -34, right: -18, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,255,255,.45),transparent 70%)", pointerEvents: "none" }}></div>
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 13 }}>
          <span style={{ width: 44, height: 44, flex: "none", borderRadius: 13, display: "grid", placeItems: "center", background: "rgba(0,0,0,.16)" }}><Ix.Flame size={22} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><b style={{ font: "800 16px/1.1 Poppins" }}>Next: +250 free entries</b></div>
            <div style={{ font: "700 11px/1 Inter", opacity: .8, marginTop: 5 }}>{pastdue ? "Streak at risk · reactivate to keep it" : "Unlocks at your 6-month milestone"}</div>
          </div>
          <div style={{ textAlign: "right", flex: "none" }}>
            <div style={{ font: "900 22px/1 Poppins" }}>3<span style={{ font: "700 11px/1 Inter", opacity: .7 }}> /6 mo</span></div>
          </div>
        </div>
      </div>
      {/* stepper */}
      <div style={{ padding: "22px 18px 18px" }}>
        <SectionTitle right={<span className="chip" style={{ padding: "4px 9px", color: accent, borderColor: accent + "66" }}>{pastdue ? "At risk" : "3 mo streak"}</span>}>Loyalty milestones</SectionTitle>
        <div style={{ position: "relative", margin: "24px 8px 4px" }}>
          <div style={{ position: "absolute", top: 9, left: 12, right: 12, height: 4, borderRadius: 99, background: "var(--inset)" }}></div>
          <div style={{ position: "absolute", top: 9, left: 12, width: "calc(" + pct + "% - 12px)", height: 4, borderRadius: 99, background: "linear-gradient(90deg," + accent2 + "," + accent + ")" }}></div>
          <div style={{ position: "relative", display: "flex", justifyContent: "space-between" }}>
            {stops.map((s, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 9, width: 64 }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", background: s.done ? accent : s.cur ? "var(--bg-2)" : "var(--inset)", border: "2px solid " + (s.done || s.cur ? accent : "var(--line-2)"), color: "#fff", boxShadow: s.cur ? "0 0 0 4px " + accent + "33" : "none" }}>{s.done && <Ic.Check size={12} />}{s.cur && <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent }}></span>}</span>
                <span style={{ font: (s.cur ? "800" : "700") + " 10px/1 Inter", color: s.cur ? "var(--text)" : "var(--muted-2)" }}>{s.label}</span>
                <span style={{ font: "800 10px/1 Inter", color: s.done ? accent : s.cur ? "var(--text)" : "var(--muted-2)" }}>{s.reward}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
function PartnerGrid({ tier, acct, teal, PACCESS }) {
  const onetime = acct === "onetime", guest = acct === "none", pastdue = acct === "pastdue";
  const locked = guest || pastdue;
  const c = guest ? "#8a8a8f" : pastdue ? "#d97706" : onetime ? teal : tier.color;
  const pct = guest ? 0 : pastdue ? 0 : onetime ? PACCESS.pct : tier.access / 100;
  const headline = guest ? "Locked" : pastdue ? "Paused" : onetime ? "Access unlocked" : "Catalogue unlocked";
  const sub = guest ? "Become a member or buy a package to unlock discounts" : pastdue ? "Update payment to restore your discounts" : onetime ? "Ends in " + PACCESS.left + " · from your pack" : "of Australia's top tool brands, on your account";
  return (
    <div>
      <SectionTitle>Partner discounts</SectionTitle>
      {/* access ring + portal CTA — this page is the home of partner-discount access */}
      <div className="card" style={{ padding: 16, marginTop: 12, border: pastdue ? "1.5px solid rgba(217,119,6,.45)" : "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Ring pct={pct || 0.001} size={72} stroke={8} color={c}>
            <span className="num" style={{ font: "800 16px/1 Poppins", color: c }}>{locked ? <Ic.Lock size={20} /> : Math.round(pct * 100) + "%"}</span>
          </Ring>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "800 15px/1.2 Poppins" }}>{headline}</div>
            <div style={{ font: "600 11.5px/1.4 Inter", color: (onetime || pastdue) ? c : "var(--muted)", marginTop: 5 }}>{sub}</div>
          </div>
        </div>
        {locked ? (
          guest ? (
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px", borderRadius: "var(--r-lg)", border: 0, cursor: "pointer", color: "#fff", font: "800 12.5px/1 Inter", background: "linear-gradient(150deg,#ff5a5a,#c40d0d)" }}>Become a member</button>
              <button style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px", borderRadius: "var(--r-lg)", border: "1px solid var(--line-2)", cursor: "pointer", color: "var(--text)", font: "800 12.5px/1 Inter", background: "transparent" }}><Ix.Ticket size={14} /> Buy a package</button>
            </div>
          ) : (
            <button style={{ width: "100%", marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 16px", borderRadius: "var(--r-lg)", border: 0, cursor: "pointer", color: "#241a02", font: "800 13px/1 Inter", background: "linear-gradient(180deg,#fbbf24,#d97706)" }}>Update payment <Ic.Arrow size={16} /></button>
          )
        ) : (
          <button style={{ width: "100%", marginTop: 14, display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", borderRadius: "var(--r-lg)", border: 0, cursor: "pointer", color: inkOn(c), background: "linear-gradient(150deg," + shade(c, 22) + "," + shade(c, -16) + ")", boxShadow: "0 14px 30px -18px " + c }}>
            <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, display: "grid", placeItems: "center", background: inkOn(c) === "#ffffff" ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.14)" }}><Ix.Store size={17} /></span>
            <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}><b style={{ display: "block", font: "800 13px/1.15 Poppins" }}>Open partner portal</b><span style={{ font: "600 10px/1.3 Inter", color: inkOn(c) === "#ffffff" ? "rgba(255,255,255,.78)" : "rgba(0,0,0,.6)" }}>See every deal · signed in via SSO</span></span>
            <Ix.ExtLink size={16} />
          </button>
        )}
      </div>
      <div style={{ position: "relative", marginTop: 11 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, filter: locked ? "saturate(.5)" : "none", opacity: locked ? .62 : 1 }}>
          {D.brands.slice(0, 4).map((b, i) => {
            const bc = locked ? "var(--muted)" : c;
            return (
              <div key={i} className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, cursor: locked ? "default" : "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", font: "900 14px/1 Poppins", background: "var(--inset)", color: bc }}>{b.name[0]}</div>
                  <span style={{ font: "900 12px/1 Poppins", color: bc }}>{b.offer}</span>
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ font: "700 12.5px/1.2 Inter", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</span>{!locked && <Ix.ExtLink size={12} style={{ color: "var(--muted-2)", flex: "none" }} />}</div>
                  <div style={{ font: "600 10.5px/1.2 Inter", color: "var(--muted)", marginTop: 4 }}>{b.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
function RewardsPage({ tier, acct = "active", onNav, desktop }) {
  const onetime = acct === "onetime", guest = acct === "none", pastdue = acct === "pastdue";
  const teal = "#0ea5a5";
  const PACCESS = { pct: 0.71, left: "5 days" };
  return (
    <Frame label={"Rewards page (" + acct + ")"} desktop={desktop} active="rewards" onNav={onNav}>
      <PageHeader tier={onetime ? { color: teal } : tier} ink={(guest || onetime) ? "#ffffff" : null} tint={onetime ? "linear-gradient(157deg,#0f5f5f,#0a2e2e 56%,#124a52)" : (guest ? "linear-gradient(157deg,#26262b,#161619 60%,#202027)" : null)}
        sub="Partners · claims · milestones" title="Rewards"
        action={<div style={{ width: 44, height: 44, flex: "none", borderRadius: 13, display: "grid", placeItems: "center", background: "rgba(255,255,255,.16)", border: "1px solid rgba(255,255,255,.28)", color: "inherit" }}><Ic.Gift size={21} /></div>} />
      <Body>
        <PartnerGrid tier={tier} acct={acct} teal={teal} PACCESS={PACCESS} />
        {pastdue && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", borderRadius: "var(--r-xl)", background: "linear-gradient(100deg,rgba(217,119,6,.16),rgba(217,119,6,.06))", border: "1px solid rgba(217,119,6,.42)" }}>
            <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, display: "grid", placeItems: "center", background: "rgba(217,119,6,.2)", color: "#d97706" }}><Ic.Shield size={17} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><b style={{ font: "800 13px/1.2 Poppins" }}>Rewards are paused</b><div style={{ font: "600 11px/1.4 Inter", color: "var(--muted)", marginTop: 3 }}>Update payment to resume claiming and keep your streak.</div></div>
          </div>
        )}
        {guest ? (
          <div className="card" style={{ padding: 20, textAlign: "center" }}>
            <span style={{ width: 46, height: 46, display: "inline-grid", placeItems: "center", borderRadius: 14, background: "var(--inset)", color: "var(--muted)" }}><Ic.Lock size={22} /></span>
            <div style={{ font: "800 15px/1.2 Poppins", marginTop: 12 }}>Unlock rewards</div>
            <p style={{ font: "600 11.5px/1.5 Inter", color: "var(--muted)", margin: "7px auto 14px", maxWidth: 300 }}>Claim free entries, build a loyalty streak, and use partner discounts. Members get it all — packages unlock draw entry + catalogue access on their own.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
              <Btn variant="primary" style={{ flex: "1 1 140px" }}>Become a member <Ic.Arrow size={16} /></Btn>
              <Btn variant="outline" style={{ flex: "1 1 140px", gap: 7 }}><Ix.Ticket size={14} /> Buy a package</Btn>
            </div>
          </div>
        ) : (
          <React.Fragment>
            <div className="card" style={{ padding: "6px 16px 8px", opacity: pastdue ? .6 : 1 }}>
              <div style={{ padding: "13px 0 4px" }}><SectionTitle right={<span className="chip" style={{ padding: "4px 9px", color: pastdue ? "var(--muted)" : "var(--gold)", borderColor: (pastdue ? "var(--muted)" : "var(--gold)") + "66" }}>{pastdue ? "Paused" : D.redeemables.claimable.length + " ready"}</span>}>Ready to claim</SectionTitle></div>
              {D.redeemables.claimable.map((r, i) => <ClaimRow key={i} r={r} i={i} last={i === D.redeemables.claimable.length - 1} disabled={pastdue} />)}
            </div>
            {!onetime && <MilestoneTrack tier={tier} pastdue={pastdue} />}
            {onetime && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", borderRadius: "var(--r-xl)", background: "linear-gradient(100deg,rgba(14,165,165,.16),rgba(14,165,165,.05))", border: "1px solid rgba(14,165,165,.42)" }}>
                <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, display: "grid", placeItems: "center", background: "rgba(14,165,165,.2)", color: teal }}><Ix.Flame size={17} /></span>
                <div style={{ flex: 1, minWidth: 0 }}><b style={{ font: "800 13px/1.2 Poppins" }}>Loyalty streak is a member perk</b><div style={{ font: "600 11px/1.4 Inter", color: "var(--muted)", marginTop: 3 }}>Become a member to earn free entries the longer you stay.</div></div>
              </div>
            )}
            <div className="card" style={{ padding: "6px 16px 12px" }}>
              <div style={{ padding: "13px 0 6px" }}><SectionTitle>Recently claimed</SectionTitle></div>
              {D.redeemables.past.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: i < D.redeemables.past.length - 1 ? "1px solid var(--line)" : "none" }}>
                  <div style={{ width: 34, height: 34, flex: "none", borderRadius: 10, display: "grid", placeItems: "center", background: "var(--inset)", color: "var(--muted)" }}><Ic.Check size={16} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ font: "700 12.5px/1.2 Inter" }}>{r.title}</div><div style={{ font: "600 10.5px/1 Inter", color: "var(--muted)", marginTop: 3 }}>{r.sub}</div></div>
                  <span style={{ font: "600 11px/1 Inter", color: "var(--muted-2)" }}>{r.date}</span>
                </div>
              ))}
            </div>
          </React.Fragment>
        )}
      </Body>
    </Frame>
  );
}

/* ===================================================================== */
/* DRAWS PAGE — current draw, prize, countdown, past winners             */
/* ===================================================================== */
function DrawsPage({ tier, acct = "active", onNav, desktop, mult = 1 }) {
  const { d, h, m, s } = useNextDraw();
  const [prize, setPrize] = useStateC("a");
  const [drawType, setDrawType] = useStateC("major");
  const guest = acct === "none";
  const p = D.prize[prize];
  const packs = ONE_TIME;
  const entries = (acct === "active" ? tier.entries : 0) + (acct === "none" ? 0 : packs);
  const miniDraws = [
    { name: "Weekly Tool Voucher", prize: "$500 store credit", cap: 5000, filled: 4120, mine: guest ? 0 : 24, color: "#0596b9", icon: Ix.Store },
    { name: "Milwaukee Drill Drop", prize: "M18 hammer drill kit", cap: 8000, filled: 3160, mine: guest ? 0 : 12, color: "#ee0000", icon: Ix.Ticket },
    { name: "Fuel Card Friday", prize: "$250 fuel card", cap: 3000, filled: 2740, mine: guest ? 0 : 8, color: "#0f9d6b", icon: Ic.Card },
    { name: "Safety Gear Bundle", prize: "Full PPE kit", cap: 6000, filled: 1090, mine: 0, color: "#d97706", icon: Ic.Shield }
  ];
  return (
    <Frame label={"Draws page (" + acct + ")"} desktop={desktop} active="draws" onNav={onNav}>
      {/* draw-type toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
        <span style={{ font: "800 16px/1 Poppins", flex: "none" }}>Draws</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 5, padding: 4, borderRadius: 99, background: "var(--inset)", border: "1px solid var(--line)" }}>
          {[{ k: "major", l: "Major draw" }, { k: "mini", l: "Mini draws" }].map((o) => (
            <button key={o.k} onClick={() => setDrawType(o.k)} style={{ padding: "8px 14px", borderRadius: 99, border: 0, cursor: "pointer", font: "800 11.5px/1 Inter", color: drawType === o.k ? "#fff" : "var(--muted)", background: drawType === o.k ? "linear-gradient(180deg,#ff2a2a,#c40d0d)" : "transparent" }}>{o.l}</button>
          ))}
        </div>
      </div>
      {drawType === "major" ? (
      <React.Fragment>
      {/* dark premium draw hero */}
      <div style={{ position: "relative", padding: "20px 20px 24px", color: "#fff", background: "linear-gradient(160deg,#1a1a1e,#0b0b0d)", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(360px 200px at 82% -20%,rgba(238,0,0,.32),transparent 62%)", pointerEvents: "none" }}></div>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(135deg,rgba(255,255,255,.04) 0 1px,transparent 1px 16px)", pointerEvents: "none" }}></div>
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "800 10px/1 Inter", letterSpacing: ".1em", textTransform: "uppercase", color: "#fff", background: "linear-gradient(180deg,#ff2a2a,#c40d0d)", padding: "7px 11px", borderRadius: 99 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", boxShadow: "0 0 0 3px rgba(255,255,255,.3)" }}></span> Live June 27</span>
          <span style={{ marginLeft: "auto", font: "600 11px/1 Inter", color: "rgba(255,255,255,.6)" }}>Drawn 8:30 PM AEST</span>
        </div>
        <div style={{ position: "relative", marginTop: 18, textAlign: "center" }}>
          <div style={{ font: "700 10px/1 Inter", letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(255,255,255,.55)" }}>{p.tagline}</div>
          <div style={{ font: "900 27px/1.05 Poppins", marginTop: 9, textWrap: "balance" }}>{p.title}</div>
        </div>
        {/* prize toggle */}
        <div style={{ position: "relative", display: "flex", gap: 6, marginTop: 16, padding: 4, borderRadius: 99, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)" }}>
          {[{ k: "a", l: "Ultimate Setup" }, { k: "b", l: "$10,000 Cash" }].map((o) => (
            <button key={o.k} onClick={() => setPrize(o.k)} style={{ flex: 1, padding: "9px", borderRadius: 99, border: 0, cursor: "pointer", font: "800 11.5px/1 Inter", color: prize === o.k ? "#0b0b0d" : "rgba(255,255,255,.75)", background: prize === o.k ? "#fff" : "transparent" }}>{o.l}</button>
          ))}
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 9, marginTop: 16 }}>
          {p.items.map((it, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, font: "600 12px/1.3 Inter", color: "rgba(255,255,255,.86)" }}><span style={{ width: 18, height: 18, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(238,0,0,.9)", color: "#fff" }}><Ic.Check size={11} /></span> {it}</div>
          ))}
        </div>
        <a href="https://toolsaustralia.com.au/promotions/makita" target="_blank" rel="noopener" style={{ position: "relative", marginTop: 18, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none", padding: "13px 18px", borderRadius: 99, background: "#fff", color: "#0b0b0d", font: "800 12.5px/1 Inter", boxShadow: "0 14px 30px -16px rgba(0,0,0,.6)" }}>View this promotion <Ix.ExtLink size={15} /></a>
      </div>

      <Body>
        {/* your entries + countdown */}
        <div className="card" style={{ padding: 18, marginTop: -34, position: "relative", zIndex: 2, overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg,#f6dd8c,#d4af37 55%,transparent)" }}></div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="eyebrow">Your entries</span>
              <div style={{ font: "900 44px/.85 Poppins", letterSpacing: "-.02em", marginTop: 8, color: guest ? "var(--muted-2)" : "var(--text)" }}>{guest ? "0" : <Num value={entries} />}</div>
              <div style={{ font: "600 11px/1 Inter", color: "var(--muted)", marginTop: 7 }}>{guest ? "Join to enter this draw" : "in the June 27 major draw"}</div>
            </div>
            {guest ? (
              <div style={{ position: "relative", flex: "none" }}>
                <Btn variant="primary" size="sm" style={{ gap: 6 }}><Ix.Ticket size={14} /> Get a package</Btn>
                {mult > 1 && <span style={{ position: "absolute", top: -9, right: -7, font: "900 8.5px/1 Inter", letterSpacing: ".03em", color: "#241a02", background: "linear-gradient(180deg,#f6dd8c,#d4af37)", padding: "4px 7px", borderRadius: 99, boxShadow: "0 6px 12px -5px rgba(0,0,0,.5)", whiteSpace: "nowrap" }}>{mult}× entries</span>}
              </div>
            ) : (
              <div style={{ position: "relative", flex: "none" }}>
                <Btn variant="outline" size="sm" style={{ gap: 7 }}><Ic.Plus size={15} /> Package</Btn>
                {mult > 1 && <span style={{ position: "absolute", top: -9, right: -7, font: "900 8.5px/1 Inter", letterSpacing: ".03em", color: "#241a02", background: "linear-gradient(180deg,#f6dd8c,#d4af37)", padding: "4px 7px", borderRadius: 99, boxShadow: "0 6px 12px -5px rgba(0,0,0,.5)", whiteSpace: "nowrap" }}>{mult}× entries</span>}
              </div>
            )}
          </div>
          {!guest && (
            <React.Fragment>
              <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", marginTop: 15, border: "1px solid var(--line)" }}>
                <div style={{ width: (entries ? (acct === "active" ? tier.entries : 0) / entries * 100 : 0) + "%", background: acct === "onetime" ? "var(--muted-2)" : tier.color }}></div>
                <div style={{ flex: 1, background: "var(--good)" }}></div>
              </div>
              <div style={{ display: "flex", gap: 22, marginTop: 11 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, font: "600 11.5px/1 Inter", color: "var(--muted)" }}><span style={{ width: 9, height: 9, borderRadius: 3, background: acct === "onetime" ? "var(--muted-2)" : tier.color, flex: "none" }}></span> Membership {acct === "onetime" ? <b className="num" style={{ color: "var(--muted-2)" }}>—</b> : acct === "pastdue" ? <b style={{ color: CT.amber }}>paused</b> : <b className="num" style={{ color: "var(--text)" }}>{tier.entries}</b>}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8, font: "600 11.5px/1 Inter", color: "var(--muted)" }}><span style={{ width: 9, height: 9, borderRadius: 3, background: "var(--good)", flex: "none" }}></span> One-time packs <b className="num" style={{ color: "var(--text)" }}>{packs}</b></span>
              </div>
            </React.Fragment>
          )}
          <hr className="hair" style={{ margin: "15px 0 13px" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7, font: "700 12px/1 Inter", color: "var(--muted)" }}><Ic.Clock size={15} style={{ color: CT.gold }} /> Closes in</span>
            <div style={{ display: "flex", gap: 6 }}><CDBox v={d} l="days" accent="rgba(212,175,55,.6)" /><CDBox v={h} l="hrs" /><CDBox v={m} l="min" /><CDBox v={s} l="sec" /></div>
          </div>
        </div>

        {/* how it works */}
        <div>
          <SectionTitle>How the draw works</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {D.steps.map((st) => (
              <div key={st.n} className="card" style={{ padding: 15, display: "flex", gap: 13, alignItems: "flex-start" }}>
                <span style={{ width: 30, height: 30, flex: "none", borderRadius: 9, display: "grid", placeItems: "center", font: "900 13px/1 Poppins", color: inkOn(tier.color), background: glossGrad(tier.color) }}>{st.n}</span>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ font: "800 13.5px/1.2 Poppins" }}>{st.title}</div><p style={{ font: "500 11.5px/1.45 Inter", color: "var(--muted)", margin: "5px 0 0" }}>{st.body}</p></div>
              </div>
            ))}
          </div>
        </div>

        {/* past winners */}
        <div>
          <SectionTitle right={<span style={{ display: "flex", alignItems: "center", gap: 4, font: "800 12px/1 Inter", color: tier.color, cursor: "pointer" }}>All <Ic.ChevronR size={13} /></span>}>Recent winners</SectionTitle>
          <div className="card" style={{ padding: "4px 16px", marginTop: 12 }}>
            {D.winners.map((w, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < D.winners.length - 1 ? "1px solid var(--line)" : "none" }}>
                <div style={{ width: 40, height: 40, flex: "none", borderRadius: 12, display: "grid", placeItems: "center", font: "900 15px/1 Poppins", color: inkOn(w.color), background: glossGrad(w.color) }}>{w.name[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ font: "700 13px/1.2 Inter" }}>{w.name} <span style={{ font: "600 11px/1 Inter", color: "var(--muted-2)" }}>· {w.suburb}</span></div><div style={{ font: "600 11px/1 Inter", color: "var(--muted)", marginTop: 4 }}>{w.prize} {w.cash}</div></div>
                <span style={{ font: "700 10px/1 Inter", color: "var(--muted-2)", whiteSpace: "nowrap" }}>{w.date}</span>
              </div>
            ))}
          </div>
        </div>
      </Body>
      </React.Fragment>
      ) : (
      <Body>
        <div style={{ position: "relative", overflow: "hidden", borderRadius: "var(--r-xl)", padding: "16px 18px", color: "#fff", background: "linear-gradient(150deg,#1a1a1e,#0b0b0d)" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(300px 160px at 85% -20%,rgba(238,0,0,.3),transparent 62%)", pointerEvents: "none" }}></div>
          <div style={{ position: "relative" }}>
            <div style={{ font: "700 10px/1 Inter", letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.55)" }}>Filled by entries, not time</div>
            <div style={{ font: "800 18px/1.2 Poppins", marginTop: 8 }}>Mini draws run the moment they fill</div>
            <p style={{ font: "600 11.5px/1.4 Inter", color: "rgba(255,255,255,.7)", marginTop: 7 }}>Smaller prizes, drawn the moment each one hits its entry target — no waiting on a date.</p>
          </div>
        </div>

        <div>
          <SectionTitle right={<span style={{ font: "700 11px/1 Inter", color: "var(--muted)" }}>{miniDraws.filter((x) => x.mine > 0).length} entered</span>}>Open mini draws</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 12 }}>
            {miniDraws.map((mn, i) => {
              const I = mn.icon;
              const pct = Math.round(mn.filled / mn.cap * 100);
              const remaining = mn.cap - mn.filled;
              return (
                <div key={i} className="card" style={{ padding: 15 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                    <span style={{ width: 46, height: 46, flex: "none", borderRadius: 13, display: "grid", placeItems: "center", color: "#fff", background: "linear-gradient(158deg," + shade(mn.color, 24) + "," + shade(mn.color, -14) + ")", boxShadow: "0 10px 20px -12px " + mn.color }}><I size={21} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: "800 13.5px/1.2 Poppins" }}>{mn.name}</div>
                      <div style={{ font: "700 11.5px/1 Inter", color: mn.color, marginTop: 5 }}>{mn.prize}</div>
                    </div>
                    {mn.mine > 0 ? (
                      <div style={{ textAlign: "right", flex: "none" }}>
                        <div style={{ font: "900 17px/1 Poppins", color: mn.color }}>{mn.mine}</div>
                        <div style={{ font: "700 8.5px/1 Inter", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted-2)", marginTop: 4 }}>Your entries</div>
                      </div>
                    ) : guest ? (
                      <Btn variant="primary" size="sm">Join</Btn>
                    ) : (
                      <Btn variant="outline" size="sm" style={{ gap: 6 }}><Ic.Plus size={14} /> Enter</Btn>
                    )}
                  </div>
                  <div style={{ display: "flex", height: 7, borderRadius: 99, overflow: "hidden", marginTop: 13, background: "var(--inset)" }}>
                    <div style={{ width: pct + "%", background: "linear-gradient(90deg," + shade(mn.color, 18) + "," + mn.color + ")" }}></div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 9 }}>
                    <span style={{ font: "800 10.5px/1 Inter", color: mn.color }}>{pct}% full</span>
                    <span style={{ font: "600 10.5px/1 Inter", color: "var(--muted)" }}><b className="num" style={{ color: "var(--text)" }}>{remaining.toLocaleString()}</b> entries to draw</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <a href="https://toolsaustralia.com.au/mini-draws" target="_blank" rel="noopener" className="card" style={{ padding: 15, display: "flex", alignItems: "center", gap: 12, textDecoration: "none", cursor: "pointer" }}>
          <span style={{ width: 38, height: 38, flex: "none", borderRadius: 11, display: "grid", placeItems: "center", background: tier.color + "1f", color: tier.color }}><Ix.Ticket size={18} /></span>
          <div style={{ flex: 1, minWidth: 0 }}><b style={{ font: "800 13px/1.2 Poppins", color: "var(--text)" }}>View all mini draws</b><div style={{ font: "600 11px/1.3 Inter", color: "var(--muted)", marginTop: 3 }}>See every open draw and grab a mini-draw pack to enter.</div></div>
          <Ix.ExtLink size={16} style={{ color: "var(--muted-2)", flex: "none" }} />
        </a>
      </Body>
      )}
    </Frame>
  );
}
/* ===================================================================== */
function MembershipPage({ tier, acct = "active", onNav, desktop, mult = 1 }) {
  const guest = acct === "none", onetime = acct === "onetime", pastdue = acct === "pastdue";
  const member = acct === "active";
  return (
    <Frame label={"Membership page (" + acct + ")"} desktop={desktop} active="account-membership" onNav={onNav}>
      <PageHeader tier={tier} sub="Your plan & billing" title="Membership"
        action={<div style={{ width: 44, height: 44, flex: "none", borderRadius: 13, display: "grid", placeItems: "center", background: "rgba(255,255,255,.16)", border: "1px solid rgba(255,255,255,.28)", color: "inherit" }}><Ic.Card size={20} /></div>} />
      <Body>
        {/* current plan card */}
        <div style={{ position: "relative", overflow: "hidden", borderRadius: 22, padding: "20px 20px", color: inkOn(tier.color), background: glossGrad(tier.color), boxShadow: "0 20px 44px -22px " + tier.color }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(135deg,rgba(255,255,255,.12) 0 1px,transparent 1px 15px)", pointerEvents: "none" }}></div>
          <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <div style={{ font: "700 10px/1 Inter", letterSpacing: ".16em", textTransform: "uppercase", opacity: .7 }}>{member ? "Current plan" : onetime ? "Active pack" : pastdue ? "Plan paused" : "No plan"}</div>
              <div style={{ font: "900 26px/1 Poppins", marginTop: 8 }}>{guest ? "Free" : tier.name}</div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "900 10px/1 Inter", letterSpacing: ".08em", textTransform: "uppercase", background: "rgba(0,0,0,.16)", padding: "7px 10px", borderRadius: 8 }}><Ic.Crown size={12} /> {member ? "Active" : onetime ? "One-time" : pastdue ? "Past due" : "Guest"}</span>
          </div>
          {!guest && (
            <div style={{ position: "relative", display: "flex", gap: 20, marginTop: 18 }}>
              <div><div style={{ font: "900 20px/1 Poppins" }}>{tier.entries}</div><div style={{ font: "700 9px/1.2 Inter", letterSpacing: ".06em", textTransform: "uppercase", opacity: .7, marginTop: 5 }}>Free entries / mo</div></div>
              <div style={{ width: 1, background: "rgba(0,0,0,.14)" }}></div>
              <div><div style={{ font: "900 20px/1 Poppins" }}>{tier.access}%</div><div style={{ font: "700 9px/1.2 Inter", letterSpacing: ".06em", textTransform: "uppercase", opacity: .7, marginTop: 5 }}>Partner access</div></div>
              <div style={{ width: 1, background: "rgba(0,0,0,.14)" }}></div>
              <div><div style={{ font: "900 20px/1 Poppins" }}>${tier.price}</div><div style={{ font: "700 9px/1.2 Inter", letterSpacing: ".06em", textTransform: "uppercase", opacity: .7, marginTop: 5 }}>per month</div></div>
            </div>
          )}
        </div>

        {pastdue && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", borderRadius: "var(--r-xl)", background: "linear-gradient(100deg,rgba(217,119,6,.16),rgba(217,119,6,.06))", border: "1px solid rgba(217,119,6,.42)" }}>
            <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, display: "grid", placeItems: "center", background: "rgba(217,119,6,.2)", color: "#d97706" }}><Ic.Shield size={17} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><b style={{ font: "800 13px/1.2 Poppins" }}>Payment failed on 24 Jun</b><div style={{ font: "600 11px/1.4 Inter", color: "var(--muted)", marginTop: 3 }}>Update payment to resume your plan.</div></div>
          </div>
        )}

        {/* manage actions */}
        <div className="card" style={{ padding: "4px 16px" }}>
          {[
            { i: Ic.Refresh, t: member ? "Renews 24 Jul" : "Reactivate plan", s: member ? "Auto-renews monthly" : "Restart your membership", act: "manage", cta: member ? "Manage" : "Renew" },
            { i: Ic.Card, t: "Payment method", s: "Visa •••• 4827", act: "payment", cta: "Edit" }
          ].map((row, i, arr) => {
            const I = row.i;
            return (
              <button key={i} onClick={() => onNav && onNav(row.act)} style={{ width: "100%", textAlign: "left", border: 0, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 13, padding: "13px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none" }}>
                <span style={{ width: 38, height: 38, flex: "none", borderRadius: 11, display: "grid", placeItems: "center", background: "var(--inset)", color: "var(--muted)" }}><I size={18} /></span>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ font: "700 13px/1.2 Inter" }}>{row.t}</div><div style={{ font: "600 11px/1 Inter", color: "var(--muted)", marginTop: 4 }}>{row.s}</div></div>
                <span style={{ display: "flex", alignItems: "center", gap: 6, font: "800 12px/1 Inter", color: tier.color }}>{row.cta} <Ic.ChevronR size={15} style={{ color: tier.color }} /></span>
              </button>
            );
          })}
        </div>

        {/* change tier */}
        <div>
          <SectionTitle>{member ? "Change your tier" : "Choose a membership"}</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {D.tiers.map((t) => {
              const cur = member && t.id === tier.id;
              const rank = { tradie: 0, foreman: 1, boss: 2 };
              const isUpgrade = mult > 1 && (!member || rank[t.id] > rank[tier.id]);
              return (
                <div key={t.id} className="card" style={{ position: "relative", overflow: "hidden", padding: 15, display: "flex", alignItems: "center", gap: 13, border: cur ? "1.5px solid " + t.color : "1px solid var(--line)" }}>
                  <div style={{ width: 40, height: 40, flex: "none", borderRadius: 12, display: "grid", placeItems: "center", color: inkOn(t.color), background: glossGrad(t.color) }}><Ic.Crown size={19} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><span style={{ font: "800 14px/1 Poppins" }}>{t.name}</span>{cur && <span className="chip" style={{ padding: "3px 8px", color: t.color, borderColor: t.color + "66" }}>Current</span>}{isUpgrade && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap", font: "900 8.5px/1 Inter", letterSpacing: ".04em", textTransform: "uppercase", color: "#241a02", background: "linear-gradient(180deg,#fff3cc,#f4d873)", border: "1px solid #d4af37", padding: "3px 6px", borderRadius: 6 }}><Ix.Flame size={9} /> {mult}× entries</span>}</div>
                    <div style={{ font: "600 11px/1.3 Inter", color: "var(--muted)", marginTop: 5 }}>{isUpgrade ? (t.entries * mult) + " entries (" + mult + "\u00d7) \u00b7 " + t.access + "% access" : t.entries + " entries \u00b7 " + t.access + "% access"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ font: "900 16px/1 Poppins", color: t.color }}>${t.price}</div>
                    <div style={{ font: "600 9px/1 Inter", color: "var(--muted-2)", marginTop: 3 }}>/mo</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* one-time packages */}
        <div>
          <SectionTitle right={<span style={{ font: "700 11px/1 Inter", color: "var(--muted)" }}>No subscription</span>}>One-time packages</SectionTitle>
          <div style={{ display: "flex", gap: 11, marginTop: 12, overflowX: "auto", paddingBottom: 4, margin: "12px -18px 0", padding: "0 18px 4px" }}>
            {D.oneTimePacks.slice(1, 5).map((pk) => (
              <div key={pk.id} style={{ position: "relative", overflow: "hidden", flex: "0 0 auto", width: 132, borderRadius: "var(--r-xl)", padding: 14, color: inkOn(pk.color), background: glossGrad(pk.color), boxShadow: "0 12px 26px -16px " + pk.color }}>
                <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(135deg,rgba(255,255,255,.1) 0 1px,transparent 1px 13px)", pointerEvents: "none" }}></div>
                <div style={{ position: "relative" }}>
                  <div style={{ font: "800 13px/1 Poppins" }}>{pk.name}</div>
                  <div style={{ font: "900 24px/1 Poppins", marginTop: 10 }}>${pk.price}</div>
                  <div style={{ font: "700 10px/1.3 Inter", opacity: .82, marginTop: 8 }}>{pk.entries} entries<br />{pk.access}% · {pk.days}d access</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Body>
    </Frame>
  );
}

/* ===================================================================== */
/* SUPPORT — bottom-sheet contact popup                                  */
/* ===================================================================== */
function SheetShell({ desktop, onClose, maxW = 468, children }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", justifyContent: desktop ? "center" : "flex-end", alignItems: desktop ? "center" : "stretch", padding: desktop ? 26 : 0 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.55)", backdropFilter: "blur(3px)" }}></div>
      <div style={{ position: "relative", width: desktop ? "100%" : "auto", maxWidth: desktop ? maxW : "none", background: "var(--bg-2)", borderRadius: desktop ? 24 : "26px 26px 0 0", border: "1px solid var(--line)", boxShadow: desktop ? "0 40px 90px -30px rgba(0,0,0,.7)" : "0 -20px 50px -20px rgba(0,0,0,.5)", maxHeight: desktop ? "86%" : "90%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!desktop && <div style={{ width: 40, height: 5, borderRadius: 99, background: "var(--line-2)", margin: "12px auto 2px", flex: "none" }}></div>}
        {children}
      </div>
    </div>
  );
}
function SheetHead({ title, sub, onClose }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "14px 20px 12px", flex: "none" }}>
      <div style={{ minWidth: 0 }}><div style={{ font: "800 19px/1.1 Poppins" }}>{title}</div>{sub && <div style={{ font: "600 12px/1.4 Inter", color: "var(--muted)", marginTop: 6 }}>{sub}</div>}</div>
      <button onClick={onClose} className="icon-btn" style={{ width: 36, height: 36, flex: "none", borderRadius: 10 }} aria-label="Close"><Ic.Plus size={18} style={{ transform: "rotate(45deg)" }} /></button>
    </div>
  );
}
function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on} style={{ width: 46, height: 27, flex: "none", borderRadius: 99, border: "none", cursor: "pointer", padding: 3, background: on ? "var(--good)" : "var(--line-2)", display: "flex", justifyContent: on ? "flex-end" : "flex-start", transition: "background .2s var(--ease)" }}>
      <span style={{ width: 21, height: 21, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.35)" }}></span>
    </button>
  );
}
function CardFace({ last = "4827", exp = "08/27", holder = NAME }) {
  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 18, padding: 18, color: "#fff", background: "linear-gradient(135deg,#2b2b31 0%,#141417 58%,#20202a 100%)", border: "1px solid rgba(255,255,255,.1)", boxShadow: "0 20px 40px -22px rgba(0,0,0,.75)" }}>
      <div style={{ position: "absolute", top: -46, right: -30, width: 170, height: 170, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,255,255,.14),transparent 70%)", pointerEvents: "none" }}></div>
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ width: 42, height: 31, borderRadius: 6, background: "linear-gradient(135deg,#f0d386,#b98e30)", position: "relative" }}>
          <div style={{ position: "absolute", inset: 5, border: "1px solid rgba(0,0,0,.22)", borderRadius: 3 }}></div>
          <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "rgba(0,0,0,.22)" }}></div>
        </div>
        <span style={{ font: "900 18px/1 Poppins", fontStyle: "italic", letterSpacing: ".04em" }}>VISA</span>
      </div>
      <div style={{ position: "relative", font: "600 16.5px/1 Inter", letterSpacing: ".16em", marginTop: 26 }}>{"\u2022\u2022\u2022\u2022  \u2022\u2022\u2022\u2022  \u2022\u2022\u2022\u2022  " + last}</div>
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", marginTop: 16 }}>
        <div><div style={{ font: "700 7.5px/1 Inter", letterSpacing: ".12em", textTransform: "uppercase", opacity: .55 }}>Card holder</div><div style={{ font: "700 12.5px/1 Inter", marginTop: 5 }}>{holder}</div></div>
        <div style={{ textAlign: "right" }}><div style={{ font: "700 7.5px/1 Inter", letterSpacing: ".12em", textTransform: "uppercase", opacity: .55 }}>Expires</div><div style={{ font: "700 12.5px/1 Inter", marginTop: 5 }}>{exp}</div></div>
      </div>
    </div>
  );
}
function PaymentSheet({ desktop, onClose }) {
  const [cards, setCards] = useStateC([
    { id: "v", brand: "Visa", last: "4827", exp: "08/27", def: true },
    { id: "m", brand: "Mastercard", last: "1102", exp: "03/26", def: false }
  ]);
  const [adding, setAdding] = useStateC(false);
  const [num, setNum] = useStateC(""); const [nexp, setNexp] = useStateC(""); const [cvc, setCvc] = useStateC(""); const [nm, setNm] = useStateC("");
  const def = cards.find((c) => c.def) || cards[0];
  const setDefault = (id) => setCards((cs) => cs.map((c) => ({ ...c, def: c.id === id })));
  const remove = (id) => setCards((cs) => { const left = cs.filter((c) => c.id !== id); if (left.length && !left.some((c) => c.def)) left[0] = { ...left[0], def: true }; return left; });
  const inStyle = { width: "100%", boxSizing: "border-box", padding: "12px 13px", borderRadius: "var(--r-lg)", border: "1px solid var(--line-2)", background: "var(--surface)", color: "var(--text)", font: "600 13px/1 Inter", outline: "none" };
  const lbl = { display: "block", font: "700 10px/1 Inter", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 7 };
  return (
    <SheetShell desktop={desktop} onClose={onClose}>
      <SheetHead title="Payment method" sub="Cards used for membership & one-time packages" onClose={onClose} />
      <div style={{ padding: "0 20px 20px", overflowY: "auto" }}>
        <CardFace last={def ? def.last : "----"} exp={def ? def.exp : "--/--"} />
        <div style={{ marginTop: 18 }}>
          <span className="eyebrow">Saved cards</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 11 }}>
            {cards.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 13px", borderRadius: "var(--r-lg)", border: c.def ? "1.5px solid var(--good)" : "1px solid var(--line)", background: "var(--surface)" }}>
                <button onClick={() => setDefault(c.id)} aria-label="Set as default" style={{ width: 20, height: 20, flex: "none", borderRadius: "50%", border: c.def ? "6px solid var(--good)" : "2px solid var(--line-2)", background: "transparent", cursor: "pointer", padding: 0 }}></button>
                <span style={{ width: 40, height: 28, flex: "none", borderRadius: 7, display: "grid", placeItems: "center", background: "var(--inset)", color: "var(--muted)" }}><Ic.Card size={17} /></span>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ font: "700 13px/1.1 Inter" }}>{c.brand + " \u2022\u2022\u2022\u2022 " + c.last}</div><div style={{ font: "600 11px/1 Inter", color: "var(--muted)", marginTop: 4 }}>{"Expires " + c.exp + (c.def ? " \u00b7 Default" : "")}</div></div>
                {!c.def && <button onClick={() => remove(c.id)} style={{ font: "700 11.5px/1 Inter", color: "var(--muted)", background: "transparent", border: 0, cursor: "pointer" }}>Remove</button>}
              </div>
            ))}
          </div>
        </div>
        {adding ? (
          <div style={{ marginTop: 16, padding: 15, borderRadius: "var(--r-xl)", border: "1px solid var(--line)", background: "var(--surface)" }}>
            <div style={{ font: "800 13px/1 Poppins", marginBottom: 13 }}>Add a new card</div>
            <label style={lbl}>Card number</label>
            <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="1234 5678 9012 3456" inputMode="numeric" style={inStyle} />
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <div style={{ flex: 1 }}><label style={lbl}>Expiry</label><input value={nexp} onChange={(e) => setNexp(e.target.value)} placeholder="MM/YY" style={inStyle} /></div>
              <div style={{ flex: 1 }}><label style={lbl}>CVC</label><input value={cvc} onChange={(e) => setCvc(e.target.value)} placeholder="123" inputMode="numeric" style={inStyle} /></div>
            </div>
            <div style={{ marginTop: 12 }}><label style={lbl}>Name on card</label><input value={nm} onChange={(e) => setNm(e.target.value)} placeholder={NAME} style={inStyle} /></div>
            <div style={{ display: "flex", gap: 10, marginTop: 15 }}>
              <button onClick={() => setAdding(false)} style={{ flex: 1, padding: "12px", borderRadius: 99, border: "1px solid var(--line-2)", background: "transparent", color: "var(--text)", font: "800 12.5px/1 Inter", cursor: "pointer" }}>Cancel</button>
              <button onClick={() => setAdding(false)} style={{ flex: 1, padding: "12px", borderRadius: 99, border: 0, background: "linear-gradient(180deg,#ff2a2a,#ee0000 60%,#c40d0d)", color: "#fff", font: "800 12.5px/1 Inter", cursor: "pointer" }}>Add card</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} style={{ width: "100%", marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px", borderRadius: "var(--r-lg)", border: "1.5px dashed var(--line-2)", background: "transparent", color: "var(--text)", font: "800 12.5px/1 Inter", cursor: "pointer" }}><Ic.Plus size={16} /> Add a new card</button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 16, padding: "11px 13px", borderRadius: "var(--r-lg)", background: "var(--inset)" }}>
          <Ic.Lock size={15} style={{ color: "var(--muted)", flex: "none" }} />
          <span style={{ font: "600 11px/1.4 Inter", color: "var(--muted)" }}>Encrypted & processed securely. We never store your full card number.</span>
        </div>
      </div>
    </SheetShell>
  );
}
function ManageSheet({ desktop, onClose, tier, acct, onNav }) {
  const member = acct === "active";
  const pastdue = acct === "pastdue";
  const [confirm, setConfirm] = useStateC(false);
  const c = tier.color;
  const rowBtn = { display: "flex", alignItems: "center", gap: 13, padding: "13px 15px", borderRadius: "var(--r-xl)", border: "1px solid var(--line)", background: "var(--surface)", cursor: "pointer", width: "100%" };
  const rowIc = { width: 38, height: 38, flex: "none", borderRadius: 11, display: "grid", placeItems: "center", background: "var(--inset)", color: "var(--muted)" };
  return (
    <SheetShell desktop={desktop} onClose={onClose}>
      <SheetHead title="Manage membership" sub={member ? "Your plan, billing and renewal" : "Restart your Tools Australia membership"} onClose={onClose} />
      <div style={{ padding: "0 20px 20px", overflowY: "auto" }}>
        <div style={{ borderRadius: "var(--r-xl)", padding: 16, border: "1px solid var(--line)", background: "var(--surface)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ width: 46, height: 46, flex: "none", borderRadius: 13, display: "grid", placeItems: "center", color: inkOn(c), background: glossGrad(c) }}><Ic.Crown size={22} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ font: "800 16px/1 Poppins" }}>{tier.name}</span>{pastdue ? <span style={{ font: "800 8.5px/1 Inter", letterSpacing: ".06em", textTransform: "uppercase", padding: "4px 7px", borderRadius: 6, color: "#d97706", background: "rgba(217,119,6,.16)" }}>Paused</span> : (member ? <span style={{ font: "800 8.5px/1 Inter", letterSpacing: ".06em", textTransform: "uppercase", padding: "4px 7px", borderRadius: 6, color: "var(--good)", background: "rgba(15,157,107,.14)" }}>Active</span> : null)}</div>
              <div style={{ font: "600 11.5px/1.3 Inter", color: "var(--muted)", marginTop: 5 }}>{pastdue ? "Payment failed \u2014 renew to resume" : (member ? "Renews 24 Jul \u00b7 auto-renews monthly" : "No active plan")}</div>
            </div>
            <div style={{ textAlign: "right" }}><div style={{ font: "900 18px/1 Poppins", color: c }}>{"$" + tier.price}</div><div style={{ font: "600 9px/1 Inter", color: "var(--muted-2)", marginTop: 3 }}>/mo</div></div>
          </div>
        </div>
        {pastdue && <button onClick={() => onNav && onNav("payment")} style={{ width: "100%", marginTop: 12, padding: "13px", borderRadius: 99, border: 0, background: "linear-gradient(180deg,#ff2a2a,#ee0000 60%,#c40d0d)", color: "#fff", font: "800 13px/1 Inter", cursor: "pointer" }}>Update payment to resume</button>}
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 12 }}>
          <button onClick={() => onNav && onNav("payment")} style={rowBtn}><span style={rowIc}><Ic.Card size={18} /></span><div style={{ flex: 1, textAlign: "left" }}><div style={{ font: "700 13px/1.1 Inter" }}>Update payment method</div><div style={{ font: "600 11px/1 Inter", color: "var(--muted)", marginTop: 4 }}>{"Visa \u2022\u2022\u2022\u2022 4827"}</div></div><Ic.ChevronR size={16} style={{ color: "var(--muted-2)", flex: "none" }} /></button>
          <button onClick={onClose} style={rowBtn}><span style={rowIc}><Ic.Crown size={18} /></span><div style={{ flex: 1, textAlign: "left" }}><div style={{ font: "700 13px/1.1 Inter" }}>{member ? "Change tier" : "Choose a plan"}</div><div style={{ font: "600 11px/1 Inter", color: "var(--muted)", marginTop: 4 }}>See all tiers below</div></div><Ic.ChevronR size={16} style={{ color: "var(--muted-2)", flex: "none" }} /></button>
        </div>
        {member && (confirm ? (
          <div style={{ marginTop: 14, padding: 15, borderRadius: "var(--r-xl)", border: "1px solid rgba(220,38,38,.4)", background: "rgba(220,38,38,.06)" }}>
            <div style={{ font: "700 13px/1.35 Inter" }}>Cancel your membership?</div>
            <div style={{ font: "600 11.5px/1.4 Inter", color: "var(--muted)", marginTop: 6 }}>You'll keep access until 24 Jul, then lose your monthly free entries and member discounts.</div>
            <div style={{ display: "flex", gap: 10, marginTop: 13 }}>
              <button onClick={() => setConfirm(false)} style={{ flex: 1, padding: "11px", borderRadius: 99, border: "1px solid var(--line-2)", background: "transparent", color: "var(--text)", font: "800 12px/1 Inter", cursor: "pointer" }}>Keep membership</button>
              <button onClick={() => setConfirm(false)} style={{ flex: 1, padding: "11px", borderRadius: 99, border: 0, background: "var(--red-d)", color: "#fff", font: "800 12px/1 Inter", cursor: "pointer" }}>Confirm cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirm(true)} style={{ width: "100%", marginTop: 14, padding: "12px", borderRadius: "var(--r-lg)", border: "1px solid var(--line)", background: "transparent", color: "var(--red-d)", font: "800 12.5px/1 Inter", cursor: "pointer" }}>Cancel membership</button>
        ))}
      </div>
    </SheetShell>
  );
}
function ThemePicker({ value, onChange }) {
  const opts = [{ id: "light", label: "Light", I: Ic.Sun }, { id: "dark", label: "Dark", I: Ic.Moon }, { id: "system", label: "System", I: Ix.Monitor }];
  return (
    <div style={{ display: "flex", gap: 8, background: "var(--inset)", padding: 5, borderRadius: 14 }}>
      {opts.map((o) => {
        const on = value === o.id; const I = o.I;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} aria-pressed={on} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, padding: "12px 6px", borderRadius: 10, border: on ? "1px solid var(--line-2)" : "1px solid transparent", background: on ? "var(--surface)" : "transparent", color: on ? "var(--text)" : "var(--muted)", cursor: "pointer", boxShadow: on ? "var(--shadow)" : "none", transition: "all .15s var(--ease)" }}>
            <I size={19} /><span style={{ font: "800 11.5px/1 Inter" }}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SupportSheet({ desktop, onClose }) {
  const faqs = ["When is the next draw?", "How do partner discounts work?", "Update my payment method", "Cancel my membership"];
  return (
    <SheetShell desktop={desktop} onClose={onClose}>
      <SheetHead title="How can we help?" sub="We're here Mon–Fri, 8am–6pm AEST" onClose={onClose} />
      <div style={{ padding: "0 20px 22px", overflowY: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 6 }}>
          {/* Cobber — AI assistant, primary */}
          <button style={{ position: "relative", overflow: "hidden", textAlign: "left", border: 0, borderRadius: "var(--r-xl)", padding: 16, cursor: "pointer", display: "flex", alignItems: "center", gap: 14, color: "#fff", background: "linear-gradient(120deg,#ff3b3b 0%,#c40d0d 60%,#8f0808 100%)", boxShadow: "0 16px 34px -18px rgba(238,0,0,.8)" }}>
            <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(135deg,rgba(255,255,255,.08) 0 1px,transparent 1px 15px)", pointerEvents: "none" }}></div>
            <div style={{ position: "absolute", top: -30, right: -10, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,255,255,.22),transparent 68%)", pointerEvents: "none" }}></div>
            <span style={{ position: "relative", width: 50, height: 50, flex: "none", borderRadius: 15, display: "grid", placeItems: "center", background: "rgba(255,255,255,.16)", border: "1px solid rgba(255,255,255,.28)" }}><Ic.Sparkle size={24} /></span>
            <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ font: "900 17px/1 Poppins" }}>Ask Cobber</span><span style={{ display: "inline-flex", alignItems: "center", gap: 5, font: "800 8.5px/1 Inter", letterSpacing: ".08em", textTransform: "uppercase", background: "rgba(0,0,0,.22)", padding: "4px 7px", borderRadius: 99 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 0 3px rgba(74,222,128,.25)" }}></span> Online</span></div>
              <div style={{ font: "600 11.5px/1.35 Inter", color: "rgba(255,255,255,.85)", marginTop: 6 }}>Your AI assistant — instant answers on draws, entries, and your account.</div>
            </div>
            <Ic.ChevronR size={20} style={{ position: "relative", flex: "none", opacity: .9 }} />
          </button>
          {/* Email — secondary */}
          <button style={{ textAlign: "left", border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "var(--r-xl)", padding: 15, cursor: "pointer", display: "flex", alignItems: "center", gap: 13 }}>
            <span style={{ width: 42, height: 42, flex: "none", borderRadius: 12, display: "grid", placeItems: "center", color: "#fff", background: "linear-gradient(158deg," + shade(CT.blue, 26) + "," + CT.blue + ")", boxShadow: "0 8px 16px -10px " + CT.blue }}><Ic.Card size={20} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ font: "800 13.5px/1.1 Poppins" }}>Email us</div><div style={{ font: "600 10.5px/1.3 Inter", color: "var(--muted)", marginTop: 4 }}>support@toolsaustralia.com.au · usually replies within 1&ndash;2 business days</div></div>
            <Ic.ChevronR size={16} style={{ color: "var(--muted-2)", flex: "none" }} />
          </button>
        </div>
        <div style={{ marginTop: 20 }}>
          <span className="eyebrow">Common questions</span>
          <div className="card" style={{ padding: "2px 16px", marginTop: 11 }}>
            {faqs.map((q, i) => (
              <button key={i} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 0", borderBottom: i < faqs.length - 1 ? "1px solid var(--line)" : "none", border: 0, borderBottomWidth: i < faqs.length - 1 ? 1 : 0, background: "transparent", cursor: "pointer", textAlign: "left" }}>
                <span style={{ flex: 1, font: "600 12.5px/1.3 Inter", color: "var(--text)" }}>{q}</span>
                <Ic.ChevronR size={15} style={{ color: "var(--muted-2)" }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </SheetShell>
  );
}

/* ===================================================================== */
/* SETTINGS PAGE — verify email, mobile, DOB, profession, state          */
/* ===================================================================== */
function Field({ icon: I, label, children, editable }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "15px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ width: 38, height: 38, flex: "none", borderRadius: 11, display: "grid", placeItems: "center", background: "var(--inset)", color: "var(--muted)" }}><I size={18} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "700 9.5px/1 Inter", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted-2)" }}>{label}</div>
        <div style={{ marginTop: 7 }}>{children}</div>
      </div>
      {editable && <Ix.Pencil size={15} style={{ color: "var(--muted-2)", flex: "none" }} />}
    </div>
  );
}
function TextIn({ value, onChange, placeholder, type = "text" }) {
  return <input value={value} type={type} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", border: 0, background: "transparent", font: "700 14.5px/1.2 Inter", color: "var(--text)", outline: "none", padding: 0 }} />;
}
function SelectIn({ value, onChange, options }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", appearance: "none", WebkitAppearance: "none", border: 0, background: "transparent", font: "700 14.5px/1.2 Inter", color: "var(--text)", outline: "none", padding: 0, cursor: "pointer" }}>
        {options.map((o) => <option key={o} value={o} style={{ color: "#111" }}>{o}</option>)}
      </select>
      <Ic.Chevron size={16} style={{ color: "var(--muted-2)", flex: "none" }} />
    </div>
  );
}
function SettingsPage({ tier, acct = "active", onNav, desktop, themePref = "light", onTheme }) {
  const [verified, setVerified] = useStateC(false);
  const [mobile, setMobile] = useStateC("0412 345 678");
  const [dob, setDob] = useStateC("1994-08-27");
  const [prof, setProf] = useStateC("Carpenter");
  const [state, setState] = useStateC("NSW");
  const dirty = true;
  return (
    <Frame label={"Settings page (" + acct + ")"} desktop={desktop} active="overview" onNav={onNav}>
      <PageHeader tier={tier} sub="Your details" title="Account settings"
        action={<div style={{ width: 44, height: 44, flex: "none", borderRadius: 13, display: "grid", placeItems: "center", background: "rgba(255,255,255,.16)", border: "1px solid rgba(255,255,255,.28)", color: "inherit" }}><Ic.Settings size={20} /></div>} />
      <Body>
        {/* identity */}
        <div className="card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 54, height: 54, flex: "none", borderRadius: 16, display: "grid", placeItems: "center", font: "900 20px/1 Poppins", color: inkOn(tier.color), background: glossGrad(tier.color) }}>{MON}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "800 17px/1.1 Poppins" }}>{NAME}</div>
            <div style={{ font: "600 12px/1 Inter", color: "var(--muted)", marginTop: 5 }}>{prof} · {state}</div>
          </div>
        </div>

        {/* email verification — highlighted when unverified */}
        <div className="card" style={{ padding: "2px 16px 6px", border: verified ? "1px solid var(--line)" : "1.5px solid rgba(217,119,6,.5)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "16px 0 14px" }}>
            <span style={{ width: 38, height: 38, flex: "none", borderRadius: 11, display: "grid", placeItems: "center", background: verified ? "rgba(15,157,107,.15)" : "rgba(217,119,6,.16)", color: verified ? "var(--good)" : "#d97706" }}>{verified ? <Ic.Check size={19} /> : <Ix.Bell size={18} />}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ font: "700 14px/1.2 Inter", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{EMAIL}</span>
                <span style={{ flex: "none", font: "800 8.5px/1 Inter", letterSpacing: ".06em", textTransform: "uppercase", padding: "4px 7px", borderRadius: 6, color: verified ? "var(--good)" : "#d97706", background: verified ? "rgba(15,157,107,.14)" : "rgba(217,119,6,.14)" }}>{verified ? "Verified" : "Unverified"}</span>
              </div>
              <div style={{ font: "600 11px/1.3 Inter", color: "var(--muted)", marginTop: 5 }}>{verified ? "Your email is confirmed." : "Confirm your email to secure your account."}</div>
            </div>
            {!verified && <Btn variant="primary" size="sm" onClick={() => setVerified(true)}>Verify</Btn>}
          </div>
        </div>

        {/* editable details */}
        <div className="card" style={{ padding: "2px 16px 6px" }}>
          <div style={{ padding: "14px 0 2px" }}><SectionTitle>Personal details</SectionTitle></div>
          <Field icon={Ix.Phone} label="Mobile number" editable><TextIn value={mobile} onChange={setMobile} type="tel" /></Field>
          <Field icon={Ic.Cal} label="Date of birth" editable><TextIn value={dob} onChange={setDob} type="date" /></Field>
          <Field icon={Ix.Briefcase} label="Profession"><SelectIn value={prof} onChange={setProf} options={["Carpenter", "Electrician", "Plumber", "Builder", "Painter", "Landscaper", "Mechanic", "Welder", "Other"]} /></Field>
          <div style={{ borderBottom: "none" }}><Field icon={Ix.Pin} label="State"><SelectIn value={state} onChange={setState} options={["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]} /></Field></div>
        </div>

        {/* appearance */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 13 }}>
            <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, display: "grid", placeItems: "center", background: "var(--inset)", color: "var(--muted)" }}><Ic.Sun size={17} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ font: "800 13.5px/1 Poppins" }}>Appearance</div><div style={{ font: "600 11px/1 Inter", color: "var(--muted)", marginTop: 4 }}>Choose how the dashboard looks</div></div>
          </div>
          <ThemePicker value={themePref} onChange={(v) => onTheme && onTheme(v)} />
        </div>

        <Btn variant="primary" style={{ width: "100%" }}>Save changes</Btn>
        <button style={{ width: "100%", padding: "13px", borderRadius: "var(--r-lg)", border: "1px solid var(--line-2)", background: "transparent", color: "var(--red)", font: "800 13px/1 Inter", cursor: "pointer" }}>Sign out</button>
      </Body>
    </Frame>
  );
}

function Gallery() {
  const [themePref, setThemePref] = useStateC(() => { try { return localStorage.getItem("ta-theme") || "light"; } catch (e) { return "light"; } });
  const [theme, setTheme] = useStateC(() => document.documentElement.getAttribute("data-theme") || "light");
  const [tierId, setTierId] = useStateC("boss");
  const [acct, setAcct] = useStateC("active");
  const [view, setView] = useStateC("mobile");
  const [page, setPage] = useStateC("overview");
  const [sheet, setSheet] = useStateC(null);
  const [mult, setMult] = useStateC(1);
  const nav = (id) => { if (id === "support" || id === "payment" || id === "manage") setSheet(id); else setPage(id); };
  const closeSheet = () => setSheet(null);
  const tiers = D.tiers;
  const tier = tiers.find((t) => t.id === tierId) || tiers[2];
  const applyTheme = (p) => {
    try { localStorage.setItem("ta-theme", p); } catch (e) {}
    setThemePref(p);
    const resolved = p === "system" ? ((window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light") : p;
    document.documentElement.setAttribute("data-theme", resolved);
    setTheme(resolved);
  };
  React.useEffect(() => {
    if (themePref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onCh = () => { const r = mq.matches ? "dark" : "light"; document.documentElement.setAttribute("data-theme", r); setTheme(r); };
    mq.addEventListener("change", onCh);
    return () => mq.removeEventListener("change", onCh);
  }, [themePref]);
  function toggle() { applyTheme(theme === "light" ? "dark" : "light"); }
  return (
    <div style={{ minHeight: "100vh" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 30, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "15px clamp(20px,4vw,40px)", background: "var(--surface)", borderBottom: "1px solid var(--line)", boxShadow: "var(--shadow)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div className="logomark" style={{ width: 34, height: 34 }}>TA</div>
          <div>
            <div style={{ font: "800 16px/1 Poppins" }}>Rewards Dashboard</div>
            <div style={{ font: "600 12px/1 Inter", color: "var(--muted)", marginTop: 4 }}>Tools Australia · User dashboard</div>
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ font: "700 10px/1 Inter", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted-2)" }}>View</span>
            <Seg options={[{ value: "mobile", label: "Mobile" }, { value: "desktop", label: "Desktop" }]} value={view} onChange={setView} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ font: "700 10px/1 Inter", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted-2)" }}>Account</span>
            <Seg options={[{ value: "active", label: "Active" }, { value: "onetime", label: "One-time" }, { value: "pastdue", label: "Past due" }, { value: "none", label: "No plan" }]} value={acct} onChange={setAcct} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ font: "700 10px/1 Inter", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted-2)" }}>Tier</span>
            <Seg options={tiers.map((t) => ({ value: t.id, label: t.name, color: t.color }))} value={tierId} onChange={setTierId} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ font: "700 10px/1 Inter", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted-2)" }}>Multiplier</span>
            <Seg options={D.promoOptions.map((o) => ({ value: o.value, label: o.label }))} value={mult} onChange={setMult} />
          </div>
          <button className="icon-btn" onClick={toggle} title="Toggle light / dark" aria-label="Toggle light or dark mode">
            {theme === "light" ? <Ic.Moon size={18} /> : <Ic.Sun size={18} />}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", padding: "clamp(28px,4vw,48px)", overflowX: "auto" }}>
        {view === "desktop" ? (
          <DeskShell active={page} onNav={nav} sheet={sheet} onCloseSheet={closeSheet} tier={tier} acct={acct}>
            {page === "overview" && <ConceptHubDesktop tier={tier} acct={acct} onNav={nav} mult={mult} />}
            {page === "rewards" && <RewardsPage tier={tier} acct={acct} onNav={nav} desktop />}
            {page === "draws" && <DrawsPage tier={tier} acct={acct} onNav={nav} mult={mult} desktop />}
            {page === "account-membership" && <MembershipPage tier={tier} acct={acct} onNav={nav} mult={mult} desktop />}
            {page === "settings" && <SettingsPage tier={tier} acct={acct} onNav={nav} themePref={themePref} onTheme={applyTheme} desktop />}
          </DeskShell>
        ) : (
          <div style={{ position: "relative", width: 400, borderRadius: 34, overflow: "hidden" }}>
            {page === "overview" && <ConceptHub tier={tier} tiers={tiers} acct={acct} onNav={nav} mult={mult} />}
            {page === "rewards" && <RewardsPage tier={tier} acct={acct} onNav={nav} />}
            {page === "draws" && <DrawsPage tier={tier} acct={acct} onNav={nav} mult={mult} />}
            {page === "account-membership" && <MembershipPage tier={tier} acct={acct} onNav={nav} mult={mult} />}
            {page === "settings" && <SettingsPage tier={tier} acct={acct} onNav={nav} themePref={themePref} onTheme={applyTheme} />}
            {sheet === "support" && <SupportSheet onClose={closeSheet} />}
            {sheet === "payment" && <PaymentSheet onClose={closeSheet} />}
            {sheet === "manage" && <ManageSheet tier={tier} acct={acct} onNav={nav} onClose={closeSheet} />}
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { Gallery });
