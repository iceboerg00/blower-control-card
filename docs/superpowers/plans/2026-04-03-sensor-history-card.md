# Sensor History Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `sensor-history-card.js` — a single-file HA Lovelace Web Component showing Temp, Humidity, and VPD as three stacked Chart.js 4 line charts with time-range selector and crosshair sync.

**Architecture:** Single `HTMLElement` subclass with Shadow DOM, no build tools. Chart.js 4 + date-fns adapter loaded from jsDelivr CDN at runtime. HA History API provides data via `hass.callApi()`.

**Tech Stack:** Vanilla JS, Web Components, Chart.js 4, chartjs-adapter-date-fns 3, HA History REST API.

---

## File Structure

| File | Purpose |
|------|---------|
| `sensor-history-card.js` | Card entry point — class, registration, all logic |
| `sensor-history-card.test.js` | Node.js tests for pure utility functions |

---

### Task 1: Pure utility functions + tests

**Files:**
- Create: `sensor-history-card.test.js`
- Create: `sensor-history-card.js` (stubs only in this task)

- [ ] **Step 1: Create the test file**

```js
// sensor-history-card.test.js
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
    .filter(p => !isNaN(p.y));
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

console.log('✓ All sensor-history-card tests passed');
```

- [ ] **Step 2: Run tests — expect failure (functions not defined yet)**

```
node sensor-history-card.test.js
```

Expected: `ReferenceError: _rangeToMs is not defined`

- [ ] **Step 3: Create `sensor-history-card.js` with utility functions only**

```js
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
```

- [ ] **Step 4: Re-run tests — all must pass**

```
node sensor-history-card.test.js
```

Expected: `✓ All sensor-history-card tests passed`

- [ ] **Step 5: Commit**

```bash
git add sensor-history-card.js sensor-history-card.test.js
git commit -m "feat(shc): add utility functions with tests"
```

---

### Task 2: Card scaffold — Shadow DOM + static structure

**Files:**
- Modify: `sensor-history-card.js`

- [ ] **Step 1: Add the card class with Shadow DOM, `setConfig`, and `_render`**

Append to `sensor-history-card.js` after the utility functions:

```js
/* ── Card class ─────────────────────────────────────────────────────────── */
class SensorHistoryCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass     = null;
    this._config   = null;
    this._charts   = [];   // [tempChart, humChart, vpdChart]
    this._range    = '24h';
    this._rendered = false;
  }

  setConfig(config) {
    if (!config.temp || !config.humidity || !config.vpd) {
      throw new Error('[SHC] Fehlende Entities: temp, humidity und vpd sind Pflicht');
    }
    this._config = config;
    if (!this._rendered) {
      this._render();
      this._rendered = true;
    }
  }

  set hass(h) {
    this._hass = h;
    this._updateBadges();
  }

  connectedCallback() {
    const saved = localStorage.getItem(`shc__range__${_entityKey(this._config)}`);
    this._range = saved ?? this._config.default_range ?? '24h';
    this._highlightRangeBtn();
    this._initAndFetch();
  }

  disconnectedCallback() {
    this._charts.forEach(c => c?.destroy());
    this._charts = [];
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>${this._css()}</style>
      <ha-card>
        <div class="header">
          <span class="title">${this._config.title ?? 'History'}</span>
          <div class="range-btns">
            ${['1h','6h','24h','7d'].map(r =>
              `<button class="rbtn" data-range="${r}">${r}</button>`
            ).join('')}
          </div>
        </div>
        ${this._sensorRow('temp',     'TEMPERATUR',       '°C',  '#03a9f4')}
        ${this._sensorRow('humidity', 'LUFTFEUCHTIGKEIT', '%',   '#4caf50')}
        ${this._sensorRow('vpd',      'VPD',              'kPa', '#ffb300')}
      </ha-card>
    `;

    this.shadowRoot.querySelectorAll('.rbtn').forEach(btn => {
      btn.addEventListener('click', () => this._onRangeClick(btn.dataset.range));
    });
  }

  _sensorRow(key, label, unit, color) {
    return `
      <div class="sensor-row" data-sensor="${key}">
        <div class="row-header">
          <span class="row-label" style="color:${color}">${label}</span>
          <span class="badge" id="badge-${key}">— ${unit}</span>
        </div>
        <div class="chart-wrap">
          <canvas id="chart-${key}"></canvas>
        </div>
      </div>
    `;
  }

  _css() {
    return `
      ha-card { background: var(--card-background-color); padding: 0; overflow: hidden; }
      .header { display: flex; justify-content: space-between; align-items: center;
                padding: 12px 16px 8px; }
      .title  { font-size: 14px; font-weight: 600; color: var(--primary-text-color); }
      .range-btns { display: flex; gap: 4px; }
      .rbtn   { background: transparent; border: 1px solid rgba(255,255,255,0.15);
                color: rgba(255,255,255,0.5); border-radius: 4px; padding: 2px 8px;
                font-size: 11px; cursor: pointer; transition: all .15s; }
      .rbtn.active { border-color: #03a9f4; color: #03a9f4; }
      .sensor-row { padding: 8px 16px 12px; border-top: 1px solid rgba(255,255,255,0.06); }
      .row-header { display: flex; justify-content: space-between; align-items: baseline;
                    margin-bottom: 6px; }
      .row-label  { font-size: 10px; font-weight: 700; letter-spacing: .08em; }
      .badge      { font-size: 13px; font-weight: 600; color: var(--primary-text-color); }
      .chart-wrap { height: 80px; position: relative; }
      canvas      { width: 100% !important; height: 100% !important; }
    `;
  }

  _onRangeClick(range) {
    this._range = range;
    localStorage.setItem(`shc__range__${_entityKey(this._config)}`, range);
    this._highlightRangeBtn();
    this._initAndFetch();
  }

  _highlightRangeBtn() {
    this.shadowRoot?.querySelectorAll('.rbtn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.range === this._range);
    });
  }

  _updateBadges() {
    if (!this._hass || !this._config) return;
    const defs = [
      { key: 'temp',     unit: '°C'  },
      { key: 'humidity', unit: '%'   },
      { key: 'vpd',      unit: 'kPa' },
    ];
    defs.forEach(({ key, unit }) => {
      const entityId = this._config[key];
      const state = this._hass.states[entityId]?.state;
      const el = this.shadowRoot?.getElementById(`badge-${key}`);
      if (el && state && state !== 'unavailable') {
        el.textContent = `${parseFloat(state).toFixed(1)} ${unit}`;
      }
    });
  }
}

customElements.define('sensor-history-card', SensorHistoryCard);
```

- [ ] **Step 2: Verify the card registers without errors**

Open HA in browser, add the resource, add the card with a minimal YAML config. Open browser console — expected: `[SHC] v1 loaded` and card renders with three empty rows and range buttons. No JS errors.

If no HA available: open the browser console in any tab, paste the full file contents, check for errors.

- [ ] **Step 3: Commit**

```bash
git add sensor-history-card.js
git commit -m "feat(shc): add card scaffold with shadow DOM and static structure"
```

---

### Task 3: Chart.js dynamic loading

**Files:**
- Modify: `sensor-history-card.js` — add `_loadChartJs()` before the class

- [ ] **Step 1: Add the loader function** (insert between utility functions and the class)

```js
/* ── Chart.js CDN loader ─────────────────────────────────────────────────── */
// Module-level promise — prevents double-loading if multiple card instances exist
let _chartsReady = null;

function _loadChartJs() {
  if (_chartsReady) return _chartsReady;
  _chartsReady = new Promise((resolve, reject) => {
    if (window.Chart) { resolve(); return; }
    const s1 = document.createElement('script');
    s1.src = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
    s1.onload = () => {
      const s2 = document.createElement('script');
      s2.src = 'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3/dist/chartjs-adapter-date-fns.bundle.min.js';
      s2.onload = resolve;
      s2.onerror = () => reject(new Error('[SHC] Failed to load chartjs-adapter-date-fns'));
      document.head.appendChild(s2);
    };
    s1.onerror = () => reject(new Error('[SHC] Failed to load Chart.js'));
    document.head.appendChild(s1);
  });
  return _chartsReady;
}
```

- [ ] **Step 2: Add `_initAndFetch` stub to the class** (for now, just loads Chart.js and logs)

Inside the class, add:

```js
async _initAndFetch() {
  try {
    await _loadChartJs();
    console.log('[SHC] Chart.js ready, version:', window.Chart?.version);
  } catch (e) {
    console.error('[SHC] Chart.js load failed:', e);
  }
}
```

- [ ] **Step 3: Verify Chart.js loads in browser**

Add card to HA dashboard, open console, navigate away and back. Expected: `[SHC] Chart.js ready, version: 4.x.x` logged once (module-level guard prevents double-load). No 404 errors in Network tab.

- [ ] **Step 4: Commit**

```bash
git add sensor-history-card.js
git commit -m "feat(shc): add Chart.js CDN loader with dedup guard"
```

---

### Task 4: HA History API fetch + data pipeline

**Files:**
- Modify: `sensor-history-card.js` — add `_fetchHistory()` to the class

- [ ] **Step 1: Add `_fetchHistory()` to the class**

```js
async _fetchHistory() {
  const start = new Date(Date.now() - _rangeToMs(this._range)).toISOString();
  const ids = [this._config.temp, this._config.humidity, this._config.vpd].join(',');
  const path = `history/period/${start}?filter_entity_id=${ids}&minimal_response=true&no_attributes=true`;

  let raw;
  try {
    raw = await this._hass.callApi('GET', path);
  } catch (e) {
    console.error('[SHC] History API error:', e);
    return null;
  }

  // raw is an array of arrays, one per entity in the same order as filter_entity_id
  // Each item is { state, last_changed }
  return {
    temp:     _parseEntityHistory(raw[0] ?? []),
    humidity: _parseEntityHistory(raw[1] ?? []),
    vpd:      _parseEntityHistory(raw[2] ?? []),
  };
}
```

- [ ] **Step 2: Update `_initAndFetch` to call `_fetchHistory` and log the result**

Replace the `_initAndFetch` stub:

```js
async _initAndFetch() {
  if (!this._hass) return;
  try {
    await _loadChartJs();
    const data = await this._fetchHistory();
    if (!data) return;
    console.log('[SHC] History fetched:', {
      temp: data.temp.length,
      humidity: data.humidity.length,
      vpd: data.vpd.length,
    });
  } catch (e) {
    console.error('[SHC] Init error:', e);
  }
}
```

- [ ] **Step 3: Verify data fetches correctly in browser**

Open HA, add card, open console. Expected log: `[SHC] History fetched: {temp: N, humidity: N, vpd: N}` with non-zero counts. Adjust entity IDs in YAML if counts are zero.

- [ ] **Step 4: Commit**

```bash
git add sensor-history-card.js
git commit -m "feat(shc): add HA history API fetch and data pipeline"
```

---

### Task 5: Chart initialization — 3 stacked Chart.js line charts

**Files:**
- Modify: `sensor-history-card.js` — add `_initCharts()` and `_chartConfig()` to the class

- [ ] **Step 1: Add `_chartConfig()` helper** (shared options for all three charts)

```js
_chartConfig(color, unit, data) {
  return {
    type: 'line',
    data: {
      datasets: [{
        data,
        borderColor: color,
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        fill: true,
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          gradient.addColorStop(0, color + '55');
          gradient.addColorStop(1, color + '00');
          return gradient;
        },
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toFixed(2)} ${unit}`,
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          time: { tooltipFormat: 'HH:mm dd.MM' },
          grid: { color: 'rgba(255,255,255,0.07)' },
          ticks: { color: 'rgba(255,255,255,0.4)', maxTicksLimit: 6, font: { size: 10 } },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.07)' },
          ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 } },
        },
      },
    },
  };
}
```

- [ ] **Step 2: Add `_initCharts()` to the class**

```js
_initCharts(data) {
  // Destroy existing instances before re-creating (happens on range change)
  this._charts.forEach(c => c?.destroy());
  this._charts = [];

  const defs = [
    { key: 'temp',     color: '#03a9f4', unit: '°C'  },
    { key: 'humidity', color: '#4caf50', unit: '%'   },
    { key: 'vpd',      color: '#ffb300', unit: 'kPa' },
  ];

  defs.forEach(({ key, color, unit }) => {
    const canvas = this.shadowRoot.getElementById(`chart-${key}`);
    if (!canvas) return;
    const chart = new Chart(canvas, this._chartConfig(color, unit, data[key]));
    this._charts.push(chart);
  });
}
```

- [ ] **Step 3: Update `_initAndFetch` to call `_initCharts`**

Replace `_initAndFetch`:

```js
async _initAndFetch() {
  if (!this._hass) return;
  try {
    await _loadChartJs();
    const data = await this._fetchHistory();
    if (!data) return;
    this._initCharts(data);
  } catch (e) {
    console.error('[SHC] Init error:', e);
  }
}
```

- [ ] **Step 4: Verify charts render in browser**

Reload HA. Three charts should appear with colored lines and gradient fills. Range buttons should already re-fetch and re-draw (because `_onRangeClick` calls `_initAndFetch`).

- [ ] **Step 5: Commit**

```bash
git add sensor-history-card.js
git commit -m "feat(shc): initialize three Chart.js line charts with gradient fill"
```

---

### Task 6: Time range selector — verify and polish

**Files:**
- Modify: `sensor-history-card.js` — `_onRangeClick` is already wired; this task verifies and fixes edge cases

- [ ] **Step 1: Verify range buttons work end-to-end**

In HA: click `1h`, `6h`, `24h`, `7d` buttons. Each click should:
1. Highlight the clicked button
2. Fetch new history data
3. Re-draw all three charts

Open localStorage in browser devtools (Application → Local Storage). After clicking a range, confirm key `shc__range__<hash>` exists with the selected value.

- [ ] **Step 2: Verify range persists across page reload**

Note the active range, reload the page. The same range should be pre-selected and charts should load with that range immediately.

- [ ] **Step 3: Commit if no fixes needed, or fix and commit**

```bash
git add sensor-history-card.js
git commit -m "feat(shc): verify time range selector with localStorage persistence"
```

---

### Task 7: Crosshair sync

**Files:**
- Modify: `sensor-history-card.js` — add crosshair plugin registration and event wiring

- [ ] **Step 1: Add crosshair plugin registration** (call this once after Chart.js loads, inside `_loadChartJs` resolve or guarded by a flag)

Add this function before the class:

```js
let _crosshairRegistered = false;

function _registerCrosshairPlugin() {
  if (_crosshairRegistered || !window.Chart) return;
  _crosshairRegistered = true;
  Chart.register({
    id: 'shcCrosshair',
    afterDraw(chart) {
      if (chart._shcX == null) return;
      const { ctx, chartArea: { top, bottom } } = chart;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(chart._shcX, top);
      ctx.lineTo(chart._shcX, bottom);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    },
  });
}
```

- [ ] **Step 2: Add `_wireCrosshair()` to the class**

```js
_wireCrosshair() {
  this._charts.forEach(sourceChart => {
    sourceChart.canvas.addEventListener('mousemove', (e) => {
      const rect = sourceChart.canvas.getBoundingClientRect();
      const xPixel = e.clientX - rect.left;
      const xRatio = (xPixel - sourceChart.chartArea.left) /
                     (sourceChart.chartArea.right - sourceChart.chartArea.left);

      this._charts.forEach(chart => {
        const x = chart.chartArea.left + xRatio * (chart.chartArea.right - chart.chartArea.left);
        chart._shcX = x;

        // Sync tooltip to nearest data point
        const meta = chart.getDatasetMeta(0);
        if (meta.data.length) {
          const nearest = meta.data.reduce((prev, curr) =>
            Math.abs(curr.x - x) < Math.abs(prev.x - x) ? curr : prev
          );
          chart.tooltip.setActiveElements(
            [{ datasetIndex: 0, index: nearest.$context.index }],
            { x, y: nearest.y }
          );
        }
        chart.update('none');
      });
    });

    sourceChart.canvas.addEventListener('mouseleave', () => {
      this._charts.forEach(chart => {
        chart._shcX = null;
        chart.tooltip.setActiveElements([], { x: 0, y: 0 });
        chart.update('none');
      });
    });
  });
}
```

- [ ] **Step 3: Call `_registerCrosshairPlugin()` and `_wireCrosshair()` inside `_initAndFetch`**

Update `_initAndFetch`:

```js
async _initAndFetch() {
  if (!this._hass) return;
  try {
    await _loadChartJs();
    _registerCrosshairPlugin();
    const data = await this._fetchHistory();
    if (!data) return;
    this._initCharts(data);
    this._wireCrosshair();
  } catch (e) {
    console.error('[SHC] Init error:', e);
  }
}
```

- [ ] **Step 4: Verify crosshair in browser**

Hover over any of the three charts. A vertical white line should appear on all three charts simultaneously. Tooltip should show on all three. Moving mouse left/right should update all charts in sync. Moving cursor off the chart area should clear the crosshair.

- [ ] **Step 5: Commit**

```bash
git add sensor-history-card.js
git commit -m "feat(shc): add synchronized crosshair with tooltip sync across charts"
```

---

### Task 8: Release v1

**Files:**
- Modify: `sensor-history-card.js` — bump version, final check

- [ ] **Step 1: Run unit tests one final time**

```
node sensor-history-card.test.js
```

Expected: `✓ All sensor-history-card tests passed`

- [ ] **Step 2: Verify full card in HA**

Checklist:
- [ ] Card renders with title and three chart rows
- [ ] Range buttons highlight correct active state
- [ ] Clicking a range button refetches and redraws
- [ ] Range selection persists after page reload
- [ ] Badges show current sensor values and update live
- [ ] Crosshair syncs across all three charts on hover
- [ ] No JS errors in console
- [ ] `SHC_VERSION` is `'v1'` in the console log

- [ ] **Step 3: Commit and tag**

```bash
git add sensor-history-card.js sensor-history-card.test.js
git commit -m "chore: release v1.0.0 — sensor-history-card initial release"
git tag v1.0.0
git push && git push --tags
```

---

## Deployment reminder

```
1. Copy sensor-history-card.js → HA /config/www/
2. In HA: Settings → Dashboards → Resources → Add /local/sensor-history-card.js
3. Hard-refresh browser (Ctrl+Shift+R)
4. Add card YAML:
```

```yaml
type: custom:sensor-history-card
temp: sensor.grow_tent_temperature
humidity: sensor.grow_tent_humidity
vpd: sensor.grow_tent_vpd
title: Grow Tent
default_range: 24h
```
