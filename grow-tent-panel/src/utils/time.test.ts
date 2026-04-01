import { describe, it, expect } from 'vitest';
import { toMin, toSec } from './time';

describe('toMin', () => {
  it('parses midnight', () => expect(toMin('00:00')).toBe(0));
  it('parses noon', () => expect(toMin('12:00')).toBe(720));
  it('parses 23:59', () => expect(toMin('23:59')).toBe(1439));
  it('parses 08:30', () => expect(toMin('08:30')).toBe(510));
});

describe('toSec', () => {
  it('parses midnight', () => expect(toSec('00:00')).toBe(0));
  it('parses 01:00', () => expect(toSec('01:00')).toBe(3600));
  it('parses 00:01', () => expect(toSec('00:01')).toBe(60));
  it('parses 06:30', () => expect(toSec('06:30')).toBe(23400));
});
