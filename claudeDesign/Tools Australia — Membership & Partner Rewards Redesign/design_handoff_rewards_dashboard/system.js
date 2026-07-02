/* Shared design-system primitives, icons, and demo-state context. */
const { useState, useEffect, useRef, useMemo } = React;

const cx = (...a) => a.filter(Boolean).join(" ");
const fmtMoney = (n) => "$" + Number(n).toLocaleString();
function inkOn(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#0a0a0a" : "#ffffff";
}
// true when a colour is light enough to need dark ink (matches inkOn's threshold)
const inkDark = (hex) => inkOn(hex) === "#0a0a0a";
// shade a hex toward black (pct<0) or white (pct>0) by pct%
function shade(hex, pct) {
  const h = hex.replace("#", "");
  let r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
  const t = pct < 0 ? 0 : 255, p = Math.abs(pct) / 100;
  r = Math.round((t - r) * p) + r; g = Math.round((t - g) * p) + g; b = Math.round((t - b) * p) + b;
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
// the shared glossy tier/pack card fill — one source of truth for every package card
const glossGrad = (c) => "linear-gradient(150deg," + shade(c, -24) + " 0%," + c + " 40%," + shade(c, 34) + " 50%," + c + " 60%," + shade(c, -24) + " 100%)";

const TAContext = React.createContext(null);
const useTA = () => React.useContext(TAContext);

function Svg({ children, size = 18, sw = 2, style }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>{children}</svg>
  );
}
const Ic = {
  Check: (p) => <Svg {...p}><polyline points="20 6 9 17 4 12"></polyline></Svg>,
  Lock: (p) => <Svg {...p}><rect x="4" y="11" width="16" height="9" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></Svg>,
  Bolt: (p) => <Svg {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"></path></Svg>,
  Trophy: (p) => <Svg {...p}><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"></path><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 16h6M8 20h8M12 13v3"></path></Svg>,
  Cal: (p) => <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 9h18M8 3v4M16 3v4"></path></Svg>,
  Clock: (p) => <Svg {...p}><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></Svg>,
  Users: (p) => <Svg {...p}><circle cx="9" cy="8" r="3"></circle><path d="M3 20a6 6 0 0 1 12 0M16 6a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6"></path></Svg>,
  Shield: (p) => <Svg {...p}><path d="M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z"></path><polyline points="9 12 11 14 15 10"></polyline></Svg>,
  ArrowUR: (p) => <Svg {...p}><path d="M7 17 17 7M8 7h9v9"></path></Svg>,
  Chevron: (p) => <Svg {...p}><path d="m6 9 6 6 6-6"></path></Svg>,
  ChevronR: (p) => <Svg {...p}><path d="m9 6 6 6-6 6"></path></Svg>,
  Star: (p) => <Svg {...p}><path d="m12 3 2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.3l6-.8L12 3Z"></path></Svg>,
  Play: (p) => <Svg {...p}><path d="M8 5v14l11-7-11-7Z"></path></Svg>,
  Sparkle: (p) => <Svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"></path></Svg>,
  Gift: (p) => <Svg {...p}><rect x="4" y="9" width="16" height="11" rx="1"></rect><path d="M2 9h20v3H2zM12 9v11M12 9S10 4 7.5 4a2.5 2.5 0 0 0 0 5M12 9s2-5 4.5-5a2.5 2.5 0 0 1 0 5"></path></Svg>,
  Arrow: (p) => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6"></path></Svg>,
  Sun: (p) => <Svg {...p}><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"></path></Svg>,
  Moon: (p) => <Svg {...p}><path d="M21 12.8A8 8 0 1 1 11.2 3 6.4 6.4 0 0 0 21 12.8Z"></path></Svg>,
  User: (p) => <Svg {...p}><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></Svg>,
  Ticket: (p) => <Svg {...p}><path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4V7Z"></path><path d="M13 7v10"></path></Svg>,
  Card: (p) => <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 10h18"></path></Svg>,
  Chat: (p) => <Svg {...p}><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 4V6a1 1 0 0 1 1-1Z"></path></Svg>,
  Settings: (p) => <Svg {...p}><path d="M4 7h9M19 7h1M4 12h1M11 12h9M4 17h6M16 17h4"></path><circle cx="16" cy="7" r="2"></circle><circle cx="8" cy="12" r="2"></circle><circle cx="13" cy="17" r="2"></circle></Svg>,
  Eye: (p) => <Svg {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></Svg>,
  Tag: (p) => <Svg {...p}><path d="M11 3H5a2 2 0 0 0-2 2v6l9 9 8-8-9-9Z"></path><circle cx="8" cy="8" r="1.4"></circle></Svg>,
  Crown: (p) => <Svg {...p}><path d="M4 18h16M4 18l-1-9 5 4 4-7 4 7 5-4-1 9"></path></Svg>,
  Share: (p) => <Svg {...p}><circle cx="18" cy="5" r="2.5"></circle><circle cx="6" cy="12" r="2.5"></circle><circle cx="18" cy="19" r="2.5"></circle><path d="M8.2 10.8 15.8 6.2M8.2 13.2l7.6 4.6"></path></Svg>,
  Plus: (p) => <Svg {...p}><path d="M12 5v14M5 12h14"></path></Svg>,
  Refresh: (p) => <Svg {...p}><path d="M20 11a8 8 0 1 0-1 5"></path><path d="M20 5v6h-6"></path></Svg>,
  Facebook: (p) => <Svg {...p}><path d="M15 4h-2.5A3.5 3.5 0 0 0 9 7.5V10H7v3h2v7h3v-7h2.2l.5-3H12V8a1 1 0 0 1 1-1h2V4Z"></path></Svg>,
  Instagram: (p) => <Svg {...p}><rect x="4" y="4" width="16" height="16" rx="4"></rect><circle cx="12" cy="12" r="3.4"></circle><circle cx="17" cy="7" r="1"></circle></Svg>,
  MapPin: (p) => <Svg {...p}><path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"></path><circle cx="12" cy="10" r="2.5"></circle></Svg>,
  Quote: (p) => <Svg {...p}><path d="M7 7h4v4l-2 4H7V7ZM15 7h4v4l-2 4h-2V7Z"></path></Svg>
};

function Btn({ variant = "primary", size = "", as = "button", className = "", children, ...rest }) {
  const Tag = as;
  return <Tag className={cx("ta-btn", "ta-btn-" + variant, size && "ta-btn-" + size, className)} {...rest}>{children}</Tag>;
}
function Badge({ children, color = "#ee0000", solid = false, style }) {
  if (solid) return <span className="badge" style={{ background: color, color: inkOn(color), ...style }}>{children}</span>;
  return <span className="badge badge-soft" style={{ borderColor: color + "55", ...style }}><span className="bdot" style={{ background: color }}></span>{children}</span>;
}
function Seg({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} className={on ? "on" : ""} onClick={() => onChange(o.value)}
            style={on && o.color ? { background: o.color, color: inkOn(o.color) } : undefined}>{o.label}</button>
        );
      })}
    </div>
  );
}
function PromoBadge({ mult }) {
  if (!mult || mult < 2) return null;
  return <span className="promo-badge"><Ic.Bolt size={12} /> {mult}X PROMO</span>;
}
function ImageSlot({ ratio = "16 / 9", label, src, alt, rounded = "var(--r-2xl)", style }) {
  if (src) return <img src={src} alt={alt || label || ""} style={{ width: "100%", aspectRatio: ratio, objectFit: "cover", borderRadius: rounded, display: "block", ...style }} />;
  return (
    <div style={{ width: "100%", aspectRatio: ratio, borderRadius: rounded, border: "1px dashed var(--line-2)", background: "var(--inset)", display: "grid", placeItems: "center", color: "var(--muted-2)", font: "600 11.5px/1.4 Inter", textAlign: "center", padding: 12, ...style }}>{label || "image"}</div>
  );
}
function Slider({ value, onChange, min = 0, max = 100, step = 1 }) {
  return <input type="range" className="ta-range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />;
}
function useTilt(max = 7) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion:reduce)").matches) return;
    if (window.matchMedia("(hover:none)").matches) return;
    function move(e) {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = "perspective(1000px) rotateX(" + (-py * max).toFixed(2) + "deg) rotateY(" + (px * max).toFixed(2) + "deg)";
    }
    function leave() { el.style.transform = ""; }
    el.addEventListener("mousemove", move); el.addEventListener("mouseleave", leave);
    return () => { el.removeEventListener("mousemove", move); el.removeEventListener("mouseleave", leave); };
  }, []);
  return ref;
}

function Reveal({ children, delay = 0, as = "div", className = "", style = {} }) {
  const ref = useRef(null);
  const [inv, setInv] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setInv(true); io.disconnect(); } }), { threshold: 0.14 });
    io.observe(el); return () => io.disconnect();
  }, []);
  const Tag = as;
  return <Tag ref={ref} className={cx("reveal", inv && "in", className)} style={{ transitionDelay: delay + "ms", ...style }}>{children}</Tag>;
}

function CountUp({ value, dur = 1100, prefix = "", suffix = "", decimals = 0, className = "" }) {
  const [n, setN] = useState(0);
  const ref = useRef(null); const seen = useRef(false); const from = useRef(0); const raf = useRef(0);
  function animate(to) {
    const reduce = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    if (reduce) { from.current = to; setN(to); return; }
    const start = from.current; const t0 = performance.now();
    cancelAnimationFrame(raf.current);
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - p, 3); const v = start + (to - start) * e;
      setN(v); if (p < 1) raf.current = requestAnimationFrame(step); else { from.current = to; setN(to); }
    };
    raf.current = requestAnimationFrame(step);
  }
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting && !seen.current) { seen.current = true; animate(value); } }), { threshold: 0.35 });
    io.observe(el); return () => { io.disconnect(); cancelAnimationFrame(raf.current); };
  }, []);
  useEffect(() => { if (seen.current) animate(value); }, [value]);
  const shown = decimals ? n.toFixed(decimals) : Math.round(n).toLocaleString();
  return <span ref={ref} className={cx("num", className)}>{prefix}{shown}{suffix}</span>;
}

function Ring({ pct, size = 124, stroke = 11, color = "#ee0000", children }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, pct)));
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}></circle>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke={color} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 1.1s var(--ease)" }}></circle>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>{children}</div>
    </div>
  );
}

function useCountdown(targetMs) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  let diff = Math.max(0, targetMs - now);
  const d = Math.floor(diff / 86400000); diff -= d * 86400000;
  const h = Math.floor(diff / 3600000); diff -= h * 3600000;
  const m = Math.floor(diff / 60000); diff -= m * 60000;
  const s = Math.floor(diff / 1000);
  return { d, h, m, s };
}

Object.assign(window, { cx, fmtMoney, inkOn, inkDark, shade, glossGrad, TAContext, useTA, Ic, Btn, Badge, Seg, PromoBadge, ImageSlot, Slider, useTilt, Reveal, CountUp, Ring, useCountdown });
