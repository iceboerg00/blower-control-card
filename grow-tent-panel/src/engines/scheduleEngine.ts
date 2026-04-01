/**
 * Returns true if `nowMinutes` falls inside the window [startMin, endMin).
 * Handles midnight-wrap (e.g. 22:00–06:00).
 */
export function isInWindow(nowMinutes: number, startMin: number, endMin: number): boolean {
  if (startMin <= endMin) {
    return nowMinutes >= startMin && nowMinutes < endMin;
  }
  // Midnight-wrapping window: active from start until midnight AND from midnight until end
  return nowMinutes >= startMin || nowMinutes < endMin;
}
