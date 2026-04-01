import type { UmweltSettings } from '../store/types';

export interface EnvReadings {
  temp: number | null;
  humidity: number | null;
  vpd: number | null;
}

/**
 * Hysteresis-based environment trigger.
 * - Activates when any enabled sensor exceeds its threshold.
 * - Deactivates only when ALL enabled sensors fall below (threshold - hysteresis).
 * - If currently active and no sensor is over threshold but not all are under: stays active.
 */
export function evalEnv(
  settings: UmweltSettings,
  readings: EnvReadings,
  currentlyActive: boolean,
): boolean {
  const { temp, humidity, vpd } = readings;
  const u = settings;

  const tValid = temp !== null && !isNaN(temp);
  const hValid = humidity !== null && !isNaN(humidity);
  const vValid = vpd !== null && !isNaN(vpd);

  const tOver = u.useTemp && tValid && temp! > u.maxTemp;
  const hOver = u.useHum  && hValid && humidity! > u.maxHum;
  const vOver = u.useVpd  && vValid && vpd! > u.maxVpd;

  const tUnder = !u.useTemp || !tValid || temp! < u.maxTemp - u.hysteresis;
  const hUnder = !u.useHum  || !hValid || humidity! < u.maxHum - u.hysteresis;
  const vUnder = !u.useVpd  || !vValid || vpd! < u.maxVpd - u.hysteresis;

  if (tOver || hOver || vOver) return true;       // Any over threshold → activate
  if (tUnder && hUnder && vUnder) return false;   // All under hysteresis band → deactivate
  return currentlyActive;                          // In hysteresis band → hold current state
}
