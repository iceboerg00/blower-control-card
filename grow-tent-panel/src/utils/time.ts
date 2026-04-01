/** Minutes since midnight (0–1439). */
export function nowMin(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** Seconds since midnight (0–86399). */
export function nowSec(): number {
  const d = new Date();
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

/** Parse "HH:MM" → minutes since midnight. */
export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Parse "HH:MM" → seconds since midnight. */
export function toSec(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 3600 + m * 60;
}

/** Format milliseconds as "Xh Ymin" or "Y min". */
export function fmtMs(ms: number): string {
  const totMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totMin / 60);
  const m = totMin % 60;
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}
