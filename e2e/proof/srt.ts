export interface Cue { title: string; startMs: number; endMs: number }

function ts(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const mil = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(mil, 3)}`;
}

export function toSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${ts(c.startMs)} --> ${ts(c.endMs)}\n${c.title}\n`).join("\n");
}

/** Watchability pacing: hold the frame long enough to read/hear the caption. */
export function holdFor(title: string): number {
  return Math.max(1800, 300 * title.trim().split(/\s+/).length);
}
