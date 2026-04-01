import type { ZyklusSettings, CycleState } from '../store/types';
import { toMin } from '../utils/time';

export interface CycleResult {
  speed: number;
  nextState?: CycleState; // defined when a phase transition occurred
}

const SAFETY_RESET_MS = 172_800_000; // 48 hours

/**
 * Pure cycle evaluation. Returns desired fan speed and optional state transition.
 * Caller must persist nextState to the settings store if defined.
 */
export function evalCycle(
  settings: ZyklusSettings,
  nowMs: number,
  nowMinutes: number,
): CycleResult {
  const st = settings._state;
  const startMin = toMin(settings.start);
  const max = settings.repetitions === 0 ? Infinity : settings.repetitions;

  // Safety reset: if stuck in a phase for more than 48h, return to waiting
  if (st.since != null && nowMs - st.since > SAFETY_RESET_MS) {
    return {
      speed: settings.standby,
      nextState: { phase: 'waiting', count: 0, since: null },
    };
  }

  // ── Waiting: check 2-minute start window (midnight-safe mod) ─────────
  if (st.phase === 'waiting') {
    const minutesFromStart = (nowMinutes - startMin + 1440) % 1440;
    if (minutesFromStart < 2) {
      return {
        speed: settings.speed,
        nextState: { phase: 'run', count: 0, since: nowMs },
      };
    }
    return { speed: settings.standby };
  }

  const elapsedMin = st.since != null ? (nowMs - st.since) / 60_000 : 0;

  // ── Running ───────────────────────────────────────────────────────────
  if (st.phase === 'run') {
    if (elapsedMin >= settings.runtime) {
      const newCount = st.count + 1;
      if (newCount >= max) {
        // All repetitions done — go back to waiting
        return {
          speed: settings.standby,
          nextState: { phase: 'waiting', count: 0, since: null },
        };
      }
      return {
        speed: settings.standby,
        nextState: { phase: 'pause', count: newCount, since: nowMs },
      };
    }
    return { speed: settings.speed };
  }

  // ── Pausing ───────────────────────────────────────────────────────────
  if (st.phase === 'pause') {
    if (elapsedMin >= settings.pause) {
      return {
        speed: settings.speed,
        nextState: { phase: 'run', count: st.count, since: nowMs },
      };
    }
    return { speed: settings.standby };
  }

  return { speed: settings.standby };
}
