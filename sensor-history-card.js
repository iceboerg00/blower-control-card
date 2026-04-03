// sensor-history-card.js
const SHC_VERSION = 'v3';
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

/* ── Crosshair plugin ────────────────────────────────────────────────────── */
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
      :host { display: flex; flex-direction: column; height: 100%; }
      ha-card {
        background: rgba(255,255,255,0.06);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 18px;
        padding: 0;
        overflow: hidden;
        box-shadow: 0 4px 24px rgba(0,0,0,0.18);
        display: flex; flex-direction: column; flex: 1;
      }
      .header { display: flex; justify-content: space-between; align-items: center;
                padding: 14px 16px 8px; flex-shrink: 0; }
      .title  { font-size: 14px; font-weight: 600; color: var(--primary-text-color); }
      .range-btns { display: flex; gap: 4px; }
      .rbtn   { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1);
                color: rgba(255,255,255,0.45); border-radius: 8px; padding: 3px 9px;
                font-size: 11px; cursor: pointer; transition: all .15s;
                backdrop-filter: blur(8px); }
      .rbtn:hover { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.75); }
      .rbtn.active { background: rgba(3,169,244,0.18); border-color: rgba(3,169,244,0.5);
                     color: #03a9f4; }
      .sensor-row { padding: 8px 16px 10px; border-top: 1px solid rgba(255,255,255,0.07);
                    flex: 1; display: flex; flex-direction: column; min-height: 0; }
      .row-header { display: flex; justify-content: space-between; align-items: baseline;
                    margin-bottom: 4px; flex-shrink: 0; }
      .row-label  { font-size: 10px; font-weight: 700; letter-spacing: .08em; }
      .badge      { font-size: 13px; font-weight: 600; color: var(--primary-text-color); }
      .chart-wrap { flex: 1; min-height: 0; position: relative; }
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

    // raw is array of arrays, one per entity, in same order as filter_entity_id
    return {
      temp:     _parseEntityHistory(raw[0] ?? []),
      humidity: _parseEntityHistory(raw[1] ?? []),
      vpd:      _parseEntityHistory(raw[2] ?? []),
    };
  }

  getCardSize() { return 4; }

  getLayoutOptions() {
    return {
      grid_rows: 4,
      grid_columns: 4,
      grid_min_rows: 3,
      grid_max_rows: 12,
      grid_min_columns: 2,
      grid_max_columns: 4,
    };
  }

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
}

customElements.define('sensor-history-card', SensorHistoryCard);
