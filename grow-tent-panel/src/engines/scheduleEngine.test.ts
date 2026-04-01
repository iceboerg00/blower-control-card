import { describe, it, expect } from 'vitest';
import { isInWindow } from './scheduleEngine';

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

describe('isInWindow — normal (no midnight wrap)', () => {
  it('inside window', () => expect(isInWindow(toMin('12:00'), toMin('08:00'), toMin('20:00'))).toBe(true));
  it('at start', () => expect(isInWindow(toMin('08:00'), toMin('08:00'), toMin('20:00'))).toBe(true));
  it('just before end', () => expect(isInWindow(toMin('19:59'), toMin('08:00'), toMin('20:00'))).toBe(true));
  it('at end (exclusive)', () => expect(isInWindow(toMin('20:00'), toMin('08:00'), toMin('20:00'))).toBe(false));
  it('before start', () => expect(isInWindow(toMin('07:59'), toMin('08:00'), toMin('20:00'))).toBe(false));
  it('after end', () => expect(isInWindow(toMin('21:00'), toMin('08:00'), toMin('20:00'))).toBe(false));
});

describe('isInWindow — midnight-wrap (e.g. 22:00–06:00)', () => {
  it('late evening inside', () => expect(isInWindow(toMin('23:00'), toMin('22:00'), toMin('06:00'))).toBe(true));
  it('early morning inside', () => expect(isInWindow(toMin('05:00'), toMin('22:00'), toMin('06:00'))).toBe(true));
  it('at start', () => expect(isInWindow(toMin('22:00'), toMin('22:00'), toMin('06:00'))).toBe(true));
  it('just before end', () => expect(isInWindow(toMin('05:59'), toMin('22:00'), toMin('06:00'))).toBe(true));
  it('at end (exclusive)', () => expect(isInWindow(toMin('06:00'), toMin('22:00'), toMin('06:00'))).toBe(false));
  it('midday outside', () => expect(isInWindow(toMin('12:00'), toMin('22:00'), toMin('06:00'))).toBe(false));
});
