import { describe, it, expect } from 'vitest';
import { evalEnv } from './envEngine';
import type { UmweltSettings } from '../store/types';

function settings(overrides: Partial<UmweltSettings> = {}): UmweltSettings {
  return {
    useTemp: true, useHum: false, useVpd: false,
    maxTemp: 28, maxHum: 70, maxVpd: 1.2,
    hysteresis: 1.0, speed: 100, standby: 25,
    ...overrides,
  };
}

describe('evalEnv — temperature only', () => {
  it('below threshold → inactive', () => {
    expect(evalEnv(settings(), { temp: 25, humidity: null, vpd: null }, false)).toBe(false);
  });

  it('above threshold → active', () => {
    expect(evalEnv(settings(), { temp: 29, humidity: null, vpd: null }, false)).toBe(true);
  });

  it('in hysteresis band (was active) → stays active', () => {
    // temp=27.5 is below 28 but above 28-1=27
    expect(evalEnv(settings(), { temp: 27.5, humidity: null, vpd: null }, true)).toBe(true);
  });

  it('in hysteresis band (was inactive) → stays inactive', () => {
    expect(evalEnv(settings(), { temp: 27.5, humidity: null, vpd: null }, false)).toBe(false);
  });

  it('below hysteresis band → deactivates', () => {
    // temp=26.9 is below 28-1=27
    expect(evalEnv(settings(), { temp: 26.9, humidity: null, vpd: null }, true)).toBe(false);
  });
});

describe('evalEnv — temp + humidity', () => {
  const s = settings({ useHum: true });

  it('only hum over → active', () => {
    expect(evalEnv(s, { temp: 25, humidity: 75, vpd: null }, false)).toBe(true);
  });

  it('neither over, both under → inactive', () => {
    expect(evalEnv(s, { temp: 25, humidity: 65, vpd: null }, true)).toBe(false);
  });

  it('temp over, hum under → active', () => {
    expect(evalEnv(s, { temp: 29, humidity: 65, vpd: null }, false)).toBe(true);
  });
});

describe('evalEnv — invalid readings', () => {
  it('null readings with useTemp=true → inactive', () => {
    expect(evalEnv(settings(), { temp: null, humidity: null, vpd: null }, false)).toBe(false);
  });

  it('null readings (was active) → deactivates (no sensor = no trigger)', () => {
    expect(evalEnv(settings(), { temp: null, humidity: null, vpd: null }, true)).toBe(false);
  });
});
