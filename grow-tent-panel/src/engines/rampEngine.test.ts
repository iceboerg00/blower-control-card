import { describe, it, expect } from 'vitest';
import { evalRamp } from './rampEngine';
import { toSec, toMin } from '../utils/time';
import type { LightSchedule } from '../store/types';

function sched(overrides: Partial<LightSchedule> = {}): LightSchedule {
  return { start: '06:00', end: '22:00', rampUp: 30, rampDown: 30, ...overrides };
}

describe('outside window → off', () => {
  it('before start', () => {
    const r = evalRamp(sched(), 100, toSec('03:00'), toMin('03:00'), false, true);
    expect(r.phase).toBe('off');
    expect(r.brightness).toBe(0);
  });

  it('after end', () => {
    const r = evalRamp(sched(), 100, toSec('23:00'), toMin('23:00'), false, true);
    expect(r.phase).toBe('off');
  });
});

describe('sunrise phase', () => {
  it('start of window → 0% brightness', () => {
    const r = evalRamp(sched(), 100, toSec('06:00'), toMin('06:00'), false, true);
    expect(r.phase).toBe('sunrise');
    expect(r.brightness).toBe(0);
  });

  it('halfway through sunrise (15 of 30 min) → 50%', () => {
    const r = evalRamp(sched(), 100, toSec('06:15'), toMin('06:15'), true, true);
    expect(r.phase).toBe('sunrise');
    expect(r.brightness).toBe(50);
  });

  it('end of sunrise → near full brightness', () => {
    const r = evalRamp(sched(), 100, toSec('06:29'), toMin('06:29'), true, true);
    expect(r.phase).toBe('sunrise');
    expect(r.brightness).toBe(97); // 29/30 * 100
  });
});

describe('normal on phase', () => {
  it('midday → full brightness', () => {
    const r = evalRamp(sched(), 80, toSec('12:00'), toMin('12:00'), true, true);
    expect(r.phase).toBe('on');
    expect(r.brightness).toBe(80);
  });
});

describe('sunset phase', () => {
  it('30 min before end → starts sunset at full brightness', () => {
    // rampDown=30min, end=22:00, so sunset starts at 21:30
    const r = evalRamp(sched(), 100, toSec('21:30'), toMin('21:30'), true, true);
    expect(r.phase).toBe('sunset');
    expect(r.brightness).toBe(100);
  });

  it('halfway through sunset (15 of 30 min) → 50%', () => {
    const r = evalRamp(sched(), 100, toSec('21:45'), toMin('21:45'), true, true);
    expect(r.phase).toBe('sunset');
    expect(r.brightness).toBe(50);
  });
});

describe('ramp interruption', () => {
  it('light off during active window → rampOk becomes false', () => {
    // 12:00, well past sunrise, light is off → interrupted
    const r = evalRamp(sched(), 100, toSec('12:00'), toMin('12:00'), false, true);
    expect(r.rampOk).toBe(false);
    expect(r.phase).toBe('on'); // still sends full brightness
  });

  it('when rampOk=false → no sunrise/sunset, always full brightness', () => {
    const r = evalRamp(sched(), 100, toSec('06:10'), toMin('06:10'), true, false);
    expect(r.phase).toBe('on');
    expect(r.brightness).toBe(100);
  });
});
