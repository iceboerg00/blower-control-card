import type { LightSchedule } from '../store/types';
import { toMin, toSec } from '../utils/time';
import { isInWindow } from './scheduleEngine';

export type LightPhase = 'off' | 'sunrise' | 'on' | 'sunset';

export interface RampResult {
  phase: LightPhase;
  brightness: number; // 0–100 %; what to send to HA
  rampOk: boolean;    // false = ramp was interrupted; caller shows "Rampe unterbrochen"
}

/**
 * Pure ramp evaluation. Call every 5s.
 * @param schedule   light schedule settings
 * @param brightness target brightness (11–100 %)
 * @param nowSecVal  seconds since midnight
 * @param nowMinVal  minutes since midnight
 * @param lightIsOn  whether the HA light entity is currently on
 * @param rampOk     current rampOk state (false = interrupted by user or external off)
 */
export function evalRamp(
  schedule: LightSchedule,
  brightness: number,
  nowSecVal: number,
  nowMinVal: number,
  lightIsOn: boolean,
  rampOk: boolean,
): RampResult {
  const sm = toMin(schedule.start);
  const em = toMin(schedule.end);
  const inW = isInWindow(nowMinVal, sm, em);

  if (!inW) {
    return { phase: 'off', brightness: 0, rampOk };
  }

  const ss = toSec(schedule.start);
  const es = toSec(schedule.end);
  const elapsed  = ((nowSecVal - ss) + 86400) % 86400;
  const total    = ((es - ss) + 86400) % 86400;
  const toEnd    = total - elapsed;
  const rampUpSec   = schedule.rampUp * 60;
  const rampDownSec = schedule.rampDown * 60;

  // Detect ramp interruption: light entity turned off after sunrise completed
  let nextRampOk = rampOk;
  if (rampOk && !lightIsOn && elapsed >= rampUpSec) {
    nextRampOk = false;
  }

  // Sunset: last rampDownSec seconds of the window
  if (nextRampOk && rampDownSec > 0 && toEnd <= rampDownSec) {
    const pct = Math.max(0, Math.round(brightness * (toEnd / rampDownSec)));
    return { phase: 'sunset', brightness: pct, rampOk: nextRampOk };
  }

  // Sunrise: first rampUpSec seconds of the window
  if (nextRampOk && rampUpSec > 0 && elapsed < rampUpSec) {
    const pct = Math.max(0, Math.round(brightness * (elapsed / rampUpSec)));
    return { phase: 'sunrise', brightness: pct, rampOk: nextRampOk };
  }

  return { phase: 'on', brightness, rampOk: nextRampOk };
}
