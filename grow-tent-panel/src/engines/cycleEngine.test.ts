import { describe, it, expect } from 'vitest';
import { evalCycle } from './cycleEngine';
import type { ZyklusSettings } from '../store/types';

function makeSettings(overrides: Partial<ZyklusSettings> = {}): ZyklusSettings {
  return {
    start: '08:00',
    runtime: 15,
    pause: 45,
    repetitions: 2,
    speed: 80,
    standby: 25,
    _state: { phase: 'waiting', count: 0, since: null },
    ...overrides,
  };
}

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

describe('waiting phase', () => {
  it('outside start window → standby speed', () => {
    const s = makeSettings();
    const result = evalCycle(s, Date.now(), toMin('10:00'));
    expect(result.speed).toBe(25);
    expect(result.nextState).toBeUndefined();
  });

  it('within 2-min start window → transitions to run', () => {
    const s = makeSettings();
    const nowMs = Date.now();
    const result = evalCycle(s, nowMs, toMin('08:01'));
    expect(result.speed).toBe(80);
    expect(result.nextState?.phase).toBe('run');
    expect(result.nextState?.count).toBe(0);
    expect(result.nextState?.since).toBe(nowMs);
  });

  it('midnight-safe: start 23:59, now 00:00 → triggers', () => {
    const s = makeSettings({ start: '23:59' });
    const result = evalCycle(s, Date.now(), toMin('00:00'));
    expect(result.nextState?.phase).toBe('run');
  });
});

describe('run phase', () => {
  it('within runtime → run speed', () => {
    const since = Date.now() - 5 * 60_000; // 5 min ago
    const s = makeSettings({ _state: { phase: 'run', count: 0, since } });
    const result = evalCycle(s, Date.now(), toMin('10:00'));
    expect(result.speed).toBe(80);
    expect(result.nextState).toBeUndefined();
  });

  it('runtime expired, more reps remaining → transitions to pause', () => {
    const since = Date.now() - 20 * 60_000; // 20 min ago, runtime=15
    const s = makeSettings({ _state: { phase: 'run', count: 0, since } });
    const result = evalCycle(s, Date.now(), toMin('10:00'));
    expect(result.speed).toBe(25);
    expect(result.nextState?.phase).toBe('pause');
    expect(result.nextState?.count).toBe(1);
  });

  it('runtime expired, all reps done → back to waiting', () => {
    const since = Date.now() - 20 * 60_000;
    const s = makeSettings({ repetitions: 1, _state: { phase: 'run', count: 0, since } });
    const result = evalCycle(s, Date.now(), toMin('10:00'));
    expect(result.nextState?.phase).toBe('waiting');
    expect(result.nextState?.count).toBe(0);
    expect(result.nextState?.since).toBeNull();
  });

  it('repetitions=0 (infinite) → never returns to waiting from run', () => {
    const since = Date.now() - 20 * 60_000;
    const s = makeSettings({ repetitions: 0, _state: { phase: 'run', count: 999, since } });
    const result = evalCycle(s, Date.now(), toMin('10:00'));
    expect(result.nextState?.phase).toBe('pause');
  });
});

describe('pause phase', () => {
  it('within pause → standby speed', () => {
    const since = Date.now() - 10 * 60_000; // 10 min, pause=45
    const s = makeSettings({ _state: { phase: 'pause', count: 1, since } });
    const result = evalCycle(s, Date.now(), toMin('10:00'));
    expect(result.speed).toBe(25);
    expect(result.nextState).toBeUndefined();
  });

  it('pause expired → transitions to run', () => {
    const since = Date.now() - 50 * 60_000; // 50 min, pause=45
    const s = makeSettings({ _state: { phase: 'pause', count: 1, since } });
    const result = evalCycle(s, Date.now(), toMin('10:00'));
    expect(result.nextState?.phase).toBe('run');
    expect(result.nextState?.count).toBe(1);
  });
});

describe('safety reset', () => {
  it('stuck > 48h → resets to waiting', () => {
    const since = Date.now() - 200 * 60 * 60_000; // 200h ago
    const s = makeSettings({ _state: { phase: 'run', count: 0, since } });
    const result = evalCycle(s, Date.now(), toMin('10:00'));
    expect(result.nextState?.phase).toBe('waiting');
    expect(result.speed).toBe(25);
  });
});
