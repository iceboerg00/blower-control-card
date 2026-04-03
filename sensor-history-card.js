// sensor-history-card.js
const SHC_VERSION = 'v1';
console.log(`%c[SHC] ${SHC_VERSION} loaded`, 'color:#03a9f4;font-weight:bold');

/* ── Pure utility functions ─────────────────────────────────────────────── */

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
    .filter(p => !isNaN(p.y));
}
