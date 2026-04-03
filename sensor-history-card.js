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
    .filter(p => !isNaN(p.x) && !isNaN(p.y));
}

/* ── Chart.js CDN loader placeholder ───────────────────────────────────── */
// (will be filled in Task 3)
let _chartsReady = null;
async function _loadChartJs() { return Promise.resolve(); }

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
    if (!this._config) return;
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

  async _initAndFetch() {
    if (!this._hass) return;
    try {
      await _loadChartJs();
      console.log('[SHC] Chart.js ready (stub)');
    } catch (e) {
      console.error('[SHC] Init error:', e);
    }
  }
}

customElements.define('sensor-history-card', SensorHistoryCard);
