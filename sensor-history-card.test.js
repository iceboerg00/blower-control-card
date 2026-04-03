const assert = require('assert');

// ── Paste these functions directly from sensor-history-card.js ──────────────

function _rangeToMs(range) {
  const map = { '1h': 3600000, '6h': 21600000, '24h': 86400000, '7d': 604800000 };
  return map[range] ?? 86400000;
}

function _entityKey(config) {
  const s = [config.temp, config.humidity, config.vpd].join('|');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function _parseEntityHistory(states) {
  return states
    .filter(s => s.state !== 'unavailable' && s.state !== 'unknown')
    .map(s => ({ x: new Date(s.last_changed).getTime(), y: parseFloat(s.state) }))
    .filter(p => !isNaN(p.x) && !isNaN(p.y));
}

// ── Tests ────────────────────────────────────────────────────────────────────

// _rangeToMs
assert.strictEqual(_rangeToMs('1h'),  3600000,  '1h should be 3600000 ms');
assert.strictEqual(_rangeToMs('6h'),  21600000, '6h should be 21600000 ms');
assert.strictEqual(_rangeToMs('24h'), 86400000, '24h should be 86400000 ms');
assert.strictEqual(_rangeToMs('7d'),  604800000,'7d should be 604800000 ms');
assert.strictEqual(_rangeToMs('bad'), 86400000, 'unknown range should fall back to 24h');

// _entityKey — same config produces same key, different config produces different key
const key1 = _entityKey({ temp: 'sensor.t', humidity: 'sensor.h', vpd: 'sensor.v' });
const key2 = _entityKey({ temp: 'sensor.t', humidity: 'sensor.h', vpd: 'sensor.v' });
const key3 = _entityKey({ temp: 'sensor.x', humidity: 'sensor.h', vpd: 'sensor.v' });
assert.strictEqual(key1, key2, 'same config must produce same key');
assert.notStrictEqual(key1, key3, 'different config must produce different key');
assert.ok(typeof key1 === 'string' && key1.length > 0, 'key must be a non-empty string');

// _parseEntityHistory
const raw = [
  { state: '22.4', last_changed: '2026-04-03T10:00:00+00:00' },
  { state: 'unavailable', last_changed: '2026-04-03T10:01:00+00:00' },
  { state: 'unknown', last_changed: '2026-04-03T10:02:00+00:00' },
  { state: '23.1', last_changed: '2026-04-03T10:03:00+00:00' },
  { state: 'nan', last_changed: '2026-04-03T10:04:00+00:00' },
];
const parsed = _parseEntityHistory(raw);
assert.strictEqual(parsed.length, 2, 'should keep only numeric, available states');
assert.strictEqual(parsed[0].y, 22.4, 'first point y should be 22.4');
assert.strictEqual(parsed[1].y, 23.1, 'second point y should be 23.1');
assert.ok(typeof parsed[0].x === 'number', 'x must be a numeric timestamp');

// _parseEntityHistory — invalid dates
const rawBadDate = [
  { state: '22.4', last_changed: 'not-a-date' },
  { state: '23.1', last_changed: '2026-04-03T10:03:00+00:00' },
];
const parsedBadDate = _parseEntityHistory(rawBadDate);
assert.strictEqual(parsedBadDate.length, 1, 'should filter out entries with invalid timestamps');

console.log('✓ All sensor-history-card tests passed');
