/** Sydney time for major draw copy (AEST/AEDT via Intl). */
const MAJOR_DRAW_TZ = "Australia/Sydney";

function ordinalDay(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (k >= 11 && k <= 13) return `${n}th`;
  if (j === 1) return `${n}st`;
  if (j === 2) return `${n}nd`;
  if (j === 3) return `${n}rd`;
  return `${n}th`;
}

/**
 * e.g. dateLine: "Saturday, April 27th", timeLine: "8:30PM AEDT"
 */
export function formatMajorDrawStripSchedule(iso: string): { dateLine: string; timeLine: string } | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const weekday = new Intl.DateTimeFormat("en-AU", { weekday: "long", timeZone: MAJOR_DRAW_TZ }).format(d);
  const month = new Intl.DateTimeFormat("en-AU", { month: "long", timeZone: MAJOR_DRAW_TZ }).format(d);
  const dayNum = Number(new Intl.DateTimeFormat("en-AU", { day: "numeric", timeZone: MAJOR_DRAW_TZ }).format(d));
  if (!Number.isFinite(dayNum)) return null;
  const dateLine = `${weekday}, ${month} ${ordinalDay(dayNum)}`;

  const parts = new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: MAJOR_DRAW_TZ,
    timeZoneName: "short",
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value?.toUpperCase() ?? "";
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "AEDT";
  const timeLine = `${hour}:${minute}${dayPeriod} ${tzName}`;
  return { dateLine, timeLine };
}
