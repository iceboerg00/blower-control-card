// blower-control-card.js v15
// type: custom:blower-control-card
const BCC_VERSION = 'v44';
console.log(`%c[BCC] ${BCC_VERSION} loaded`, 'color:#03a9f4;font-weight:bold');

const TAG = 'blower-control-card';
const S_ANG = 135, T_ANG = 270, MIN = 25, MAX = 100;
const CX = 110, CY = 110, R = 85;

/* ── Utility functions ─────────────────────────────────────────────────── */
function xy(cx, cy, r, deg) {
  const a = deg * Math.PI / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function arcPath(cx, cy, r, startDeg, sweepDeg) {
  const p1 = xy(cx, cy, r, startDeg);
  const p2 = xy(cx, cy, r, startDeg + Math.max(0.01, sweepDeg));
  return `M${p1.x.toFixed(2)},${p1.y.toFixed(2)} A${r},${r} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
}
function pctToSweep(pct) {
  return ((clamp(pct, MIN, MAX) - MIN) / (MAX - MIN)) * T_ANG;
}
function dragToPct(deg) {
  const a = ((deg % 360) + 360) % 360;
  const rel = ((a - S_ANG) + 360) % 360;
  if (rel > T_ANG) return rel > T_ANG + (360 - T_ANG) / 2 ? MIN : MAX;
  return Math.round(MIN + (rel / T_ANG) * (MAX - MIN));
}
function dragToPct0s(deg) {
  const a = ((deg % 360) + 360) % 360;
  const rel = ((a - S_ANG) + 360) % 360;
  if (rel > T_ANG) return rel > T_ANG + (360 - T_ANG) / 2 ? 0 : 100;
  return snap10(Math.round((rel / T_ANG) * 100));
}
function pctToSweep0(pct) { return (clamp(pct, 0, 100) / 100) * T_ANG; }
function dragToPct0(deg) {
  const a = ((deg % 360) + 360) % 360;
  const rel = ((a - S_ANG) + 360) % 360;
  if (rel > T_ANG) return rel > T_ANG + (360 - T_ANG) / 2 ? 0 : 100;
  return Math.round((rel / T_ANG) * 100);
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function snap10(v) { return Math.round(v / 10) * 10; }
function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function fmtMin(ms) {
  const m = Math.floor(ms / 60000);
  return m > 0 ? `${m} min` : `< 1 min`;
}
function throttle(fn, ms) {
  let last = 0, timer = null;
  return function (...args) {
    const now = Date.now();
    const remaining = ms - (now - last);
    clearTimeout(timer);
    if (remaining <= 0) {
      last = now;
      fn.apply(this, args);
    } else {
      timer = setTimeout(() => { last = Date.now(); fn.apply(this, args); }, remaining);
    }
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
class BlowerControlCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = null;
    this._settings = null;
    this._interval = null;
    this._tab = 'manual';
    this._isDragging = false;
    this._cmdGuardUntil = 0;
    this._assertAttempts = 0;
    this._lastAssertTime = 0;
    this._lastFanState = null;
    this._tabAbort = null;
    this._rendered = false;
    this._cfgOpen = false;
    this._lastEvalTime = 0;
    this._throttledSetFan = throttle((pct, src) => this._setFan(pct, src), 300);
    // Humidifier
    this._humTarget = 60;
    this._humDragging = false;
    this._throttledSetHum = throttle((val) => this._setHumidity(val), 500);
    // Light
    this._lightTab = 'manual';
    this._lightDragging = false;
    this._lightTabAbort = null;
    this._throttledSetLight = throttle((pct) => {
      if (!this._hass) return;
      if (pct <= 0) {
        this._hass.callService('light', 'turn_off', { entity_id: this._light });
      } else {
        const bri = clamp(Math.round(clamp(pct, 1, 100) * 2.55), 1, 255);
        this._hass.callService('light', 'turn_on', { entity_id: this._light, brightness: bri });
      }
    }, 100);
    this._lightCmdGuard = 0;
    this._lightRampOk = true;
    this._lightWasInSched = false;
    // Circulation fan (Umluft)
    this._circTab = 'manual';
    this._circDragging = false;
    this._circTabAbort = null;
    this._circCmdGuard = 0;
    this._circLastEvalTime = 0;
  }

  /* ── Config ──────────────────────────────────────────────────────────── */
  setConfig(c) {
    this._config = c || {};
    this._cfgKey = `bcc3_entities__${c.entity || 'default'}`;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(this._cfgKey) || '{}'); } catch {}
    this._fan   = saved.fan      || c.entity   || 'fan.schedule_4_real_cb_blower';
    this._tempE = saved.temp     || c.temp     || 'sensor.schedule_4_real_cb_temperature';
    this._humE  = saved.humidity || c.humidity  || 'sensor.schedule_4_real_cb_humidity';
    this._vpdE  = saved.vpd      || c.vpd      || 'sensor.schedule_4_real_cb_vpd';
    this._humidifier = saved.humidifier || c.humidifier || 'humidifier.ihc_200_wifi';
    this._light = saved.light || c.light || 'light.schedule_4_real_cb_light_1';
    this._circFan = saved.circFan || c.circ_fan || 'fan.schedule_4_real_cb_fan';
    this._moduleOrder = saved.moduleOrder || c.module_order || ['blower', 'humidifier', 'light', 'circ'];
    this._key = `bcc__${this._fan}`;
    try {
      const old = localStorage.getItem(`bcc3__${this._fan}`);
      if (old && !localStorage.getItem(this._key)) localStorage.setItem(this._key, old);
    } catch {}
    this._cfgOpen = false;
    this._loadSettings();
    if (!this._rendered) this._render();
  }

  _saveEntities() {
    try { localStorage.setItem(this._cfgKey, JSON.stringify({ fan: this._fan, temp: this._tempE, humidity: this._humE, vpd: this._vpdE, humidifier: this._humidifier, light: this._light, circFan: this._circFan, moduleOrder: this._moduleOrder })); } catch {}
  }

  /* ── Hass setter ─────────────────────────────────────────────────────── */
  set hass(h) {
    this._hass = h;
    if (!this._config) return;
    if (!this._rendered) { this._loadSettings(); this._render(); }

    // When card is disabled, only update sensors display — no commands
    if (this._settings?.cardDisabled) {
      this._updateSensors();
      return;
    }

    const _fs = h.states[this._fan];
    if (_fs && this._lastFanState !== _fs.state) {
      console.log(`%c[BCC] HA: fan=${_fs.state} pct=${_fs.attributes?.percentage} (mode=${this._settings?.activeMode} on=${this._settings?.manual?.on})`, _fs.state === 'on' ? 'color:#4caf50' : 'color:#f44336');
      this._lastFanState = _fs.state;
    }

    // Re-assertion: manual mode ON but fan is off → fight back (max 10x, 3s cooldown)
    // NOTE: this is NOT gated by _cmdGuardUntil — we WANT to fight external overrides
    if (this._settings?.activeMode === 'manual' &&
        this._settings.manual.on &&
        this._assertAttempts < 10) {
      const fanSt = _fs?.state;
      if (fanSt === 'off' && Date.now() - this._lastAssertTime >= 3000) {
        this._assertAttempts++;
        this._lastAssertTime = Date.now();
        console.log(`%c[BCC] RE-ASSERT #${this._assertAttempts}: fan off but manual.on=true`, 'color:#ff9800;font-weight:bold');
        this._syncHAMode('manual');
        this._setFan(this._settings.manual.speed, 'reassert');
      } else if (fanSt === 'on') {
        if (this._assertAttempts > 0) console.log(`%c[BCC] fan on, assert reset`, 'color:#4caf50');
        this._assertAttempts = 0;
      }
    }

    // Evaluate on every hass update (5s debounce to avoid spam)
    if (Date.now() - this._lastEvalTime >= 5000) {
      this._evaluate();
    }

    this._syncDialFromHA(_fs);
    this._syncHumidifier();
    this._syncLight();
    this._evalLight();
    this._syncCircFromHA();
    if (Date.now() - this._circLastEvalTime >= 5000) {
      this._evaluateCirc();
    }
    this._updateCircStatus();
    this._updateCircModeStatus();
    this._updateSensors();
    this._updateStatus();
    this._updateModeStatus();
  }

  /* ── Sync dial with HA state ─────────────────────────────────────────── */
  _syncDialFromHA(fanState) {
    if (!fanState) return;

    const isOn = fanState.state === 'on';
    const haPct = fanState.attributes?.percentage;
    const r = this.shadowRoot;

    // 1. Status-Badge IMMER updaten (kein Guard)
    const dot = r.querySelector('#sdot');
    const lbl = r.querySelector('#slbl');
    const spctEl = r.querySelector('#spct');
    if (dot) dot.className = `sdot ${isOn ? 'on' : 'off'}`;
    if (lbl) lbl.textContent = isOn ? 'AN' : 'AUS';
    if (spctEl && !this._isDragging) spctEl.textContent = (isOn && haPct != null) ? ` ${Math.round(haPct)}%` : '';

    // 2. Toggle-Button IMMER updaten
    const tog = r.querySelector('#tog');
    if (tog) {
      tog.className = `pbtn${isOn ? ' on' : ''}`;
      tog.innerHTML = isOn ? '⏻&nbsp;&nbsp;Ausschalten' : '⏻&nbsp;&nbsp;Einschalten';
    }

    // 3. Guard für Dial-Sync — nicht während Drag oder Guard
    if (this._isDragging) return;
    if (Date.now() < this._cmdGuardUntil) return;

    // 4. Sync manual.on mit Entity-State
    if (this._settings.manual.on !== isOn) {
      this._settings.manual.on = isOn;
      this._save();
    }

    // 5. Sync Speed + Dial-Visuals
    if (isOn && haPct != null && haPct >= MIN) {
      const rounded = Math.round(haPct);
      if (this._settings.manual.speed !== rounded) {
        this._settings.manual.speed = rounded;
        this._save();
      }
      this._updateDialVisuals(rounded);
    }
  }

  _updateDialVisuals(pct) {
    const r = this.shadowRoot;
    const svg = r.querySelector('#dial');
    if (!svg) return;
    const sw = pctToSweep(pct);
    const va = arcPath(CX, CY, R, S_ANG, Math.max(1, sw));
    const th = xy(CX, CY, R, S_ANG + sw);
    const valArc = svg.querySelector('#arc-val');
    if (valArc) { valArc.setAttribute('d', va); valArc.style.opacity = sw > 5 ? '1' : '0'; }
    const thumb = svg.querySelector('#thumb');
    if (thumb) { thumb.setAttribute('cx', th.x.toFixed(2)); thumb.setAttribute('cy', th.y.toFixed(2)); }
    const pnum = svg.querySelector('#pnum');
    if (pnum) pnum.textContent = pct;
  }

  /* ── Lifecycle ───────────────────────────────────────────────────────── */
  connectedCallback() {
    if (!this._config) return;
    this._loadSettings();
    if (!this._rendered) {
      this._render();
    } else {
      // Re-bind listeners that were cleaned up in disconnectedCallback
      this._bindTab();
      this._bindLightTab();
      this._bindCircTab();
    }
    if (!this._interval) this._interval = setInterval(() => this._evaluate(), 10000);
  }
  disconnectedCallback() {
    clearInterval(this._interval);
    this._interval = null;
    if (this._tabAbort) { this._tabAbort.abort(); this._tabAbort = null; }
    if (this._lightTabAbort) { this._lightTabAbort.abort(); this._lightTabAbort = null; }
    if (this._circTabAbort) { this._circTabAbort.abort(); this._circTabAbort = null; }
  }
  getCardSize() { return 16; }
  static getStubConfig() { return {}; }

  /* ── Settings ────────────────────────────────────────────────────────── */
  _def() {
    return {
      cardDisabled: false,
      activeMode: 'off',
      manual: { on: false, speed: 50 },
      zeitfenster: { start: '08:00', end: '20:00', speed: 75, standby: 25 },
      zyklus: {
        start: '08:00', runtime: 15, pause: 45, repetitions: 4, speed: 80, standby: 25,
        _state: { phase: 'waiting', count: 0, since: null }
      },
      umwelt: { mode: 'both', maxTemp: 28, maxHum: 70, speed: 100, standby: 25 },
      light: {
        mode: 'off',
        brightness: 100,
        schedule: { start: '06:00', end: '00:00', rampUp: 30, rampDown: 30 }
      }
      ,circ: {
        activeMode: 'off',
        manual: { on: false, speed: 50 },
        zeitfenster: { start: '08:00', end: '20:00', speed: 80, standby: 0 },
        zyklus: {
          start: '08:00', runtime: 15, pause: 45, repetitions: 4, speed: 80, standby: 0,
          _state: { phase: 'waiting', count: 0, since: null }
        },
        umwelt: { mode: 'both', maxTemp: 28, maxHum: 70, speed: 100, standby: 0 }
      }
    };
  }
  _loadSettings() {
    try {
      const r = localStorage.getItem(this._key);
      this._settings = r ? this._merge(this._def(), JSON.parse(r)) : this._def();
    } catch { this._settings = this._def(); }
    // Migrate removed modes
    const m = this._settings.umwelt?.mode;
    if (m === 'temp_prio' || m === 'hum_prio') {
      this._settings.umwelt.mode = 'both';
    }
  }
  _save() { try { localStorage.setItem(this._key, JSON.stringify(this._settings)); } catch {} }
  _merge(a, b) {
    const o = { ...a };
    for (const k in b) {
      if (b[k] === null || b[k] === undefined) { o[k] = b[k]; continue; }
      if (Array.isArray(b[k])) { o[k] = [...b[k]]; continue; }
      if (typeof b[k] === 'object') { o[k] = this._merge(a[k] || {}, b[k]); continue; }
      o[k] = b[k];
    }
    return o;
  }

  /* ── Scaffold render (runs once) ─────────────────────────────────────── */
  _render() {
    if (!this._settings) this._loadSettings();
    const s = this._settings;
    const TABS = ['manual', 'zeitfenster', 'zyklus', 'umwelt'];
    const NAMES = { manual: 'Manuell', zeitfenster: 'Zeitfenster', zyklus: 'Zyklus', umwelt: 'Umwelt' };

    this.shadowRoot.innerHTML = `<style>${this._css()}</style>
<ha-card>
  <div class="cc${s.cardDisabled ? ' card-disabled' : ''}">
    <div class="toprow">
      <div class="title"><span class="ticon">💨</span> Blower Control <span class="ver">${BCC_VERSION}</span></div>
      <div class="hdr-right">
        <button class="master-btn${this._settings.cardDisabled ? ' off' : ''}" id="master-btn" title="Karte ein/ausschalten">⏻</button>
        <button class="gear-btn${this._cfgOpen ? ' open' : ''}" id="gear-btn" title="Entitäten konfigurieren">⚙</button>
      </div>
    </div>

    <div class="cfg-panel${this._cfgOpen ? ' open' : ''}" id="cfg-panel">
      <div class="sec" style="margin-bottom:14px">
        <div class="seclbl">Entitäten konfigurieren</div>
        <div class="cfg-row"><label>Lüfter</label><input class="cfg-input" id="cfg-fan" type="text" value="${this._fan}" placeholder="fan.entity_id"></div>
        <div class="cfg-row"><label>Temperatur</label><input class="cfg-input" id="cfg-temp" type="text" value="${this._tempE}" placeholder="sensor.entity_id"></div>
        <div class="cfg-row"><label>Luftfeuchte</label><input class="cfg-input" id="cfg-hum" type="text" value="${this._humE}" placeholder="sensor.entity_id"></div>
        <div class="cfg-row"><label>VPD</label><input class="cfg-input" id="cfg-vpd" type="text" value="${this._vpdE}" placeholder="sensor.entity_id"></div>
        <div class="cfg-row"><label>Luftbefeuchter</label><input class="cfg-input" id="cfg-humidifier" type="text" value="${this._humidifier}" placeholder="humidifier.entity_id"></div>
        <div class="cfg-row"><label>Licht</label><input class="cfg-input" id="cfg-light" type="text" value="${this._light}" placeholder="light.entity_id"></div>
        <div class="cfg-row"><label>Umluft</label><input class="cfg-input" id="cfg-circfan" type="text" value="${this._circFan}" placeholder="fan.entity_id"></div>
        <div class="cfg-row" style="margin-top:10px"><label>Modul-Reihenfolge</label>
          <div id="cfg-modorder" class="mod-order">
            ${this._moduleOrder.map((m, i) => `<div class="mod-item" data-mod="${m}">
              <span class="mod-name">${{blower:'💨 Blower',humidifier:'💧 Luftbefeuchter',light:'💡 Licht',circ:'🌀 Umluft'}[m] || m}</span>
              <span class="mod-btns">
                <button class="mod-btn" data-dir="up" data-idx="${i}" ${i === 0 ? 'disabled' : ''}>▲</button>
                <button class="mod-btn" data-dir="down" data-idx="${i}" ${i === this._moduleOrder.length - 1 ? 'disabled' : ''}>▼</button>
              </span>
            </div>`).join('')}
          </div>
        </div>
        <button class="cfg-save-btn" id="cfg-save">Speichern &amp; Neu laden</button>
      </div>
    </div>

    <div class="chips" id="chips">
      <div class="chip" id="chip-temp"><span class="cicon">🌡</span><span><b id="s-temp">--</b>°C</span></div>
      <div class="chip" id="chip-hum"><span class="cicon">💧</span><span><b id="s-hum">--</b>%</span></div>
      <div class="chip" id="chip-vpd"><span class="cicon">🌿</span><span>VPD <b id="s-vpd">--</b></span></div>
    </div>

    ${this._moduleOrder.map((mod, i) => {
      const html = mod === 'blower' ? `
    <div class="blower-section">
      <div class="toprow" style="margin-bottom:8px">
        <div class="title"><span class="ticon">💨</span> Lüfter</div>
        <div class="hdr-right">
          <div class="status-badge">
            <span class="sdot off" id="sdot"></span>
            <span id="slbl">AUS</span><span class="spct" id="spct"></span>
          </div>
        </div>
      </div>
      <div class="tabbar">
        ${TABS.map(t => `<button class="tab${t === this._tab ? ' act' : ''}${s.activeMode === t ? ' run' : ''}" data-tab="${t}">
          ${NAMES[t]}${s.activeMode === t ? '<span class="rdot"></span>' : ''}
        </button>`).join('')}
      </div>
      <div id="body">${this._renderTab(this._tab)}</div>
    </div>`
        : mod === 'humidifier' ? this._renderHumidifier()
        : mod === 'light' ? this._renderLight()
        : mod === 'circ' ? this._renderCirc()
        : '';
      return (i > 0 ? '<div class="divider"></div>' : '') + html;
    }).join('\n')}
  </div>
</ha-card>`;

    this._rendered = true;

    // Scaffold-level listeners — bound once, never re-bound
    this.shadowRoot.querySelectorAll('.tab[data-tab]').forEach(b =>
      b.addEventListener('click', () => this._switchTab(b.dataset.tab)));

    this.shadowRoot.querySelector('#master-btn').addEventListener('click', () => this._toggleCardDisabled());

    this.shadowRoot.querySelector('#gear-btn').addEventListener('click', () => {
      this._cfgOpen = !this._cfgOpen;
      this.shadowRoot.querySelector('#gear-btn').classList.toggle('open', this._cfgOpen);
      this.shadowRoot.querySelector('#cfg-panel').classList.toggle('open', this._cfgOpen);
    });

    this.shadowRoot.querySelector('#cfg-modorder')?.addEventListener('click', e => {
      const btn = e.target.closest('.mod-btn');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx);
      const dir = btn.dataset.dir;
      const arr = [...this._moduleOrder];
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= arr.length) return;
      [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
      this._moduleOrder = arr;
      const names = {blower:'💨 Blower',humidifier:'💧 Luftbefeuchter',light:'💡 Licht',circ:'🌀 Umluft'};
      const container = this.shadowRoot.querySelector('#cfg-modorder');
      container.innerHTML = arr.map((m, i) => `<div class="mod-item" data-mod="${m}">
        <span class="mod-name">${names[m] || m}</span>
        <span class="mod-btns">
          <button class="mod-btn" data-dir="up" data-idx="${i}" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button class="mod-btn" data-dir="down" data-idx="${i}" ${i === arr.length - 1 ? 'disabled' : ''}>▼</button>
        </span>
      </div>`).join('');
    });

    this.shadowRoot.querySelector('#cfg-save').addEventListener('click', () => {
      this._fan   = this.shadowRoot.querySelector('#cfg-fan')?.value.trim()  || this._fan;
      this._tempE = this.shadowRoot.querySelector('#cfg-temp')?.value.trim() || this._tempE;
      this._humE  = this.shadowRoot.querySelector('#cfg-hum')?.value.trim()  || this._humE;
      this._vpdE  = this.shadowRoot.querySelector('#cfg-vpd')?.value.trim()  || this._vpdE;
      this._humidifier = this.shadowRoot.querySelector('#cfg-humidifier')?.value.trim() || this._humidifier;
      this._light = this.shadowRoot.querySelector('#cfg-light')?.value.trim() || this._light;
      this._circFan = this.shadowRoot.querySelector('#cfg-circfan')?.value.trim() || this._circFan;
      this._key   = `bcc__${this._fan}`;
      this._saveEntities();
      this._loadSettings();
      this._cfgOpen = false;
      this._rendered = false;
      this._render();
    });

    // Bind tab-specific listeners
    this._bindTab();
    this._bindHumidifier();
    this._bindLightTab();
    this._bindCircTab();
    this._updateSensors();
    this._updateStatus();
    this._updateModeStatus();
  }

  /* ── Tab switching ───────────────────────────────────────────────────── */
  _switchTab(tab) {
    this._tab = tab;
    this.shadowRoot.querySelectorAll('.tab[data-tab]').forEach(b => b.classList.toggle('act', b.dataset.tab === tab));
    this.shadowRoot.querySelector('#body').innerHTML = this._renderTab(tab);
    this._bindTab();
    this._updateModeStatus();
  }

  /* ── Tab templates ───────────────────────────────────────────────────── */
  _renderTab(t) {
    switch (t) {
      case 'manual':      return this._tManual();
      case 'zeitfenster': return this._tZeit();
      case 'zyklus':      return this._tZyklus();
      case 'umwelt':      return this._tUmwelt();
    }
    return '';
  }

  _tManual() {
    const m = this._settings.manual;
    const sw = pctToSweep(m.speed);
    const bg = arcPath(CX, CY, R, S_ANG, T_ANG);
    const va = arcPath(CX, CY, R, S_ANG, Math.max(1, sw));
    const th = xy(CX, CY, R, S_ANG + sw);
    const startPt = xy(CX, CY, R, S_ANG);
    const endPt   = xy(CX, CY, R, S_ANG + T_ANG);
    const startIn = xy(CX, CY, R - 10, S_ANG);
    const endIn   = xy(CX, CY, R - 10, S_ANG + T_ANG);
    const isAct = this._settings.activeMode === 'manual';
    return `
<div class="mwrap">
  <div class="dial-wrap">
    <svg id="dial" viewBox="0 0 220 220" class="dial" touch-action="none">
      <defs>
        <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path class="arc-bg" d="${bg}"/>
      <path class="arc-val" id="arc-val" d="${va}" style="opacity:${sw > 5 ? 1 : 0}" filter="url(#glow)"/>
      <line class="tick" x1="${startPt.x.toFixed(2)}" y1="${startPt.y.toFixed(2)}" x2="${startIn.x.toFixed(2)}" y2="${startIn.y.toFixed(2)}"/>
      <line class="tick" x1="${endPt.x.toFixed(2)}" y1="${endPt.y.toFixed(2)}" x2="${endIn.x.toFixed(2)}" y2="${endIn.y.toFixed(2)}"/>
      <circle class="thumb" id="thumb" cx="${th.x.toFixed(2)}" cy="${th.y.toFixed(2)}" r="13"/>
      <text class="pnum" id="pnum" x="${CX}" y="${CY + 2}">${m.speed}</text>
      <text class="punit" x="${CX}" y="${CY + 22}">%</text>
    </svg>
    <div class="tick-label l">25</div>
    <div class="tick-label r">100</div>
  </div>
  <div class="mbtns">
    <button id="tog" class="pbtn${m.on ? ' on' : ''}">${m.on ? '⏻&nbsp;&nbsp;Ausschalten' : '⏻&nbsp;&nbsp;Einschalten'}</button>
    <button class="abtn${isAct ? ' a' : ''}" data-act="manual">${isAct ? '✓ Aktiv' : 'Aktivieren'}</button>
  </div>
</div>`;
  }

  _row(id, label, min, max, step, val, fmt) {
    const p = ((val - min) / (max - min) * 100).toFixed(1);
    const d = typeof fmt === 'function' ? fmt(val) : val + fmt;
    return `<div class="srow">
  <div class="slbl"><span>${label}</span><span class="sv" id="${id}-v">${d}</span></div>
  <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}" style="--v:${p}%">
</div>`;
  }
  _trow(id, label, val) {
    return `<div class="srow trow"><span class="slbl-s">${label}</span>
  <input type="time" id="${id}" value="${val}" class="tinput"></div>`;
  }
  _abtn(mode) {
    const a = this._settings.activeMode === mode;
    return `<div class="abtn-row">
  <button class="abtn${a ? ' a' : ''}" data-act="${mode}">${a ? '✓ Aktiv' : 'Aktivieren'}</button>
  ${a ? '<button class="abtn off-btn" data-act="off">⏻ Ausschalten</button>' : ''}
</div>`;
  }
  _fs(v) { return v < MIN ? 'AUS' : v + '%'; }

  _tZeit() {
    const z = this._settings.zeitfenster;
    const isAct = this._settings.activeMode === 'zeitfenster';
    let statusHtml = '';
    if (isAct) {
      statusHtml = `<div id="zeit-info" class="info-card standby">
        <span class="ic-dot"></span><span id="zeit-text">—</span>
      </div>`;
    }
    return `<div class="swrap">
  ${statusHtml}
  <div class="sec"><div class="seclbl">Zeitfenster</div>
    ${this._trow('zf-s', 'Startzeit', z.start)}
    ${this._trow('zf-e', 'Endzeit', z.end)}
  </div>
  <div class="sec"><div class="seclbl">Geschwindigkeit</div>
    ${this._row('zf-spd', 'Im Zeitfenster', MIN, 100, 1, z.speed, v => v + '%')}
    ${this._row('zf-stby', 'Standby (außerhalb)', 0, 100, 1, z.standby, this._fs.bind(this))}
  </div>
  ${this._abtn('zeitfenster')}
</div>`;
  }

  _tZyklus() {
    const z = this._settings.zyklus;
    const isAct = this._settings.activeMode === 'zyklus';
    let statusHtml = '';
    if (isAct) {
      statusHtml = `<div id="cycle-info" class="info-card standby">
        <span class="ic-dot"></span><span id="cycle-text">Warte auf Startzeit…</span>
      </div>`;
    }
    return `<div class="swrap">
  ${statusHtml}
  <div class="sec"><div class="seclbl">Zeitplan</div>
    ${this._trow('zy-s', 'Startzeit', z.start)}
    ${this._row('zy-run', 'Laufzeit', 1, 120, 1, z.runtime, v => v + ' min')}
    ${this._row('zy-pau', 'Pause', 1, 240, 1, z.pause, v => v + ' min')}
    ${this._row('zy-rep', 'Wiederholungen', 0, 24, 1, z.repetitions, v => v === 0 ? '∞' : String(v))}
  </div>
  <div class="sec"><div class="seclbl">Geschwindigkeit</div>
    ${this._row('zy-spd', 'Zyklus aktiv', MIN, 100, 1, z.speed, v => v + '%')}
    ${this._row('zy-stby', 'Standby (Pause)', 0, 100, 1, z.standby, this._fs.bind(this))}
  </div>
  ${this._abtn('zyklus')}
</div>`;
  }

  _tUmwelt() {
    const u = this._settings.umwelt;
    const M = [
      ['both', 'Temp & Feuchte'], ['only_temp', 'Nur Temp'], ['only_hum', 'Nur Feuchte']
    ];
    const isAct = this._settings.activeMode === 'umwelt';
    let statusHtml = '';
    if (isAct) {
      statusHtml = `<div id="umwelt-info" class="info-card standby">
        <span class="ic-dot"></span><span id="umwelt-text">—</span>
      </div>`;
    }
    return `<div class="swrap">
  ${statusHtml}
  <div class="sec"><div class="seclbl">Betriebsmodus</div>
    <div class="mgrid">${M.map(([v, l]) => `<button class="mbtn${u.mode === v ? ' a' : ''}" data-mode="${v}">${l}</button>`).join('')}</div>
  </div>
  <div class="sec"><div class="seclbl">Grenzwerte</div>
    ${this._row('um-temp', 'Max Temperatur', 15, 40, .5, u.maxTemp, v => v + '°C')}
    ${this._row('um-hum', 'Max Luftfeuchte', 30, 100, 1, u.maxHum, v => v + '%')}
  </div>
  <div class="sec"><div class="seclbl">Geschwindigkeit</div>
    ${this._row('um-spd', 'Lüfter aktiv', MIN, 100, 1, u.speed, v => v + '%')}
    ${this._row('um-stby', 'Standby', 0, 100, 1, u.standby, this._fs.bind(this))}
  </div>
  ${this._abtn('umwelt')}
</div>`;
  }

  _shouldRun(u, tO, hO) {
    switch (u.mode) {
      case 'both': return tO || hO;
      case 'only_temp': return tO;
      case 'only_hum':  return hO;
    }
    return false;
  }

  /* ── Event binding (with AbortController cleanup) ────────────────────── */
  _bindTab() {
    if (this._tabAbort) this._tabAbort.abort();
    this._tabAbort = new AbortController();
    const sig = { signal: this._tabAbort.signal };

    const r = this.shadowRoot, s = this._settings, t = this._tab;

    // Activate buttons (present in all tabs)
    r.querySelectorAll('[data-act]').forEach(b =>
      b.addEventListener('click', () => this._activate(b.dataset.act), sig));

    if (t === 'manual') {
      const dial = r.querySelector('#dial');
      if (dial) {
        dial.addEventListener('pointerdown', e => {
          e.preventDefault(); dial.setPointerCapture(e.pointerId);
          this._isDragging = true; this._onDrag(e, dial);
        }, sig);
        dial.addEventListener('pointermove', e => {
          if (!this._isDragging) return; e.preventDefault(); this._onDrag(e, dial);
        }, sig);
        const end = () => {
          if (this._isDragging) {
            this._isDragging = false;
            if (this._settings.manual.on && this._settings.activeMode === 'manual') {
              this._cmdGuardUntil = Date.now() + 2000;
              this._setFan(this._settings.manual.speed, 'drag-end');
            }
            // Status-Badge sofort updaten
            const spctEl = r.querySelector('#spct');
            if (spctEl) spctEl.textContent = ` ${this._settings.manual.speed}%`;
            this._save();
          }
        };
        dial.addEventListener('pointerup', end, sig);
        dial.addEventListener('pointercancel', end, sig);
      }
      const tog = r.querySelector('#tog');
      if (tog) tog.addEventListener('click', () => this._toggleManual(), sig);
    }

    if (t === 'zeitfenster') {
      this._otime(r, '#zf-s', v => s.zeitfenster.start = v, sig);
      this._otime(r, '#zf-e', v => s.zeitfenster.end = v, sig);
      this._orange(r, '#zf-spd', v => s.zeitfenster.speed = v, v => v + '%', sig);
      this._orange(r, '#zf-stby', v => s.zeitfenster.standby = v, this._fs.bind(this), sig);
    }

    if (t === 'zyklus') {
      this._otime(r, '#zy-s', v => { s.zyklus.start = v; s.zyklus._state = { phase: 'waiting', count: 0, since: null }; }, sig);
      this._orange(r, '#zy-run', v => s.zyklus.runtime = v, v => v + ' min', sig);
      this._orange(r, '#zy-pau', v => s.zyklus.pause = v, v => v + ' min', sig);
      this._orange(r, '#zy-rep', v => s.zyklus.repetitions = v, v => v === 0 ? '∞' : String(v), sig);
      this._orange(r, '#zy-spd', v => s.zyklus.speed = v, v => v + '%', sig);
      this._orange(r, '#zy-stby', v => s.zyklus.standby = v, this._fs.bind(this), sig);
    }

    if (t === 'umwelt') {
      r.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
        s.umwelt.mode = b.dataset.mode;
        r.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('a', x === b));
        this._save();
      }, sig));
      this._orange(r, '#um-temp', v => s.umwelt.maxTemp = v, v => v + '°C', sig);
      this._orange(r, '#um-hum', v => s.umwelt.maxHum = v, v => v + '%', sig);
      this._orange(r, '#um-spd', v => s.umwelt.speed = v, v => v + '%', sig);
      this._orange(r, '#um-stby', v => s.umwelt.standby = v, this._fs.bind(this), sig);
    }
  }

  _otime(r, sel, cb, sig) {
    const el = r.querySelector(sel);
    if (el) el.addEventListener('change', e => { cb(e.target.value); this._save(); }, sig);
  }
  _orange(r, sel, cb, fmt, sig) {
    const el = r.querySelector(sel); if (!el) return;
    const vEl = r.querySelector(`${sel}-v`);
    el.addEventListener('input', e => {
      const v = parseFloat(e.target.value); cb(v);
      if (vEl) vEl.textContent = fmt(v);
      el.style.setProperty('--v', `${(v - parseFloat(el.min)) / (parseFloat(el.max) - parseFloat(el.min)) * 100}%`);
    }, sig);
    el.addEventListener('change', () => this._save(), sig);
  }

  /* ── Dial drag ───────────────────────────────────────────────────────── */
  _onDrag(e, svg) {
    const rc = svg.getBoundingClientRect();
    const deg = Math.atan2(e.clientY - (rc.top + rc.height / 2), e.clientX - (rc.left + rc.width / 2)) * 180 / Math.PI;
    const pct = dragToPct(deg);
    this._settings.manual.speed = pct;
    const sw = pctToSweep(pct);
    const va = arcPath(CX, CY, R, S_ANG, Math.max(1, sw));
    const th = xy(CX, CY, R, S_ANG + sw);
    const valArc = svg.querySelector('#arc-val');
    if (valArc) { valArc.setAttribute('d', va); valArc.style.opacity = sw > 5 ? '1' : '0'; }
    const thumb = svg.querySelector('#thumb');
    if (thumb) { thumb.setAttribute('cx', th.x.toFixed(2)); thumb.setAttribute('cy', th.y.toFixed(2)); }
    const pnum = svg.querySelector('#pnum');
    if (pnum) pnum.textContent = pct;
    // Status-Badge live updaten
    const spctEl = this.shadowRoot.querySelector('#spct');
    if (spctEl) spctEl.textContent = ` ${pct}%`;
    // Kein Befehl während dem Ziehen — wird erst bei pointerup gesendet
  }

  /* ── Manual toggle ───────────────────────────────────────────────────── */
  _toggleManual() {
    const s = this._settings, r = this.shadowRoot;
    s.manual.on = !s.manual.on;
    s.activeMode = 'manual';
    this._assertAttempts = 0;
    this._cmdGuardUntil = Date.now() + 2000;
    this._syncHAMode('manual');
    this._setFan(s.manual.on ? s.manual.speed : 0, 'toggle');
    this._save();

    const tog = r.querySelector('#tog');
    if (tog) {
      tog.innerHTML = s.manual.on ? '⏻&nbsp;&nbsp;Ausschalten' : '⏻&nbsp;&nbsp;Einschalten';
      tog.className = `pbtn${s.manual.on ? ' on' : ''}`;
    }
    this._setRunDot('manual');
    r.querySelectorAll('[data-act]').forEach(b => {
      const a = b.dataset.act === 'manual';
      b.textContent = a ? '✓ Aktiv' : 'Aktivieren';
      b.classList.toggle('a', a);
    });
  }

  /* ── Activate mode ───────────────────────────────────────────────────── */
  _activate(mode) {
    this._settings.activeMode = mode;
    // Clear guard so evaluate runs immediately when switching away from manual
    this._cmdGuardUntil = 0;
    this._save();
    this._setRunDot(mode);
    this.shadowRoot.querySelectorAll('[data-act]').forEach(b => {
      const a = b.dataset.act === mode;
      b.textContent = a ? '✓ Aktiv' : 'Aktivieren';
      b.classList.toggle('a', a);
    });
    this._syncHAMode(mode);
    if (mode === 'off') {
      // Reset manual.on so re-assertion doesn't fight back
      this._settings.manual.on = false;
      this._assertAttempts = 0;
      this._save();
      this._setFan(0, 'activate-off');
    } else if (mode === 'manual') {
      const m = this._settings.manual;
      this._setFan(m.on ? m.speed : 0, 'activate-manual');
    } else {
      this._evaluate();
    }
    this.shadowRoot.querySelector('#body').innerHTML = this._renderTab(this._tab);
    this._bindTab();
    this._updateModeStatus();
  }

  _toggleCardDisabled() {
    const s = this._settings;
    s.cardDisabled = !s.cardDisabled;
    const r = this.shadowRoot;
    const btn = r.querySelector('#master-btn');
    if (btn) btn.classList.toggle('off', s.cardDisabled);
    if (s.cardDisabled) {
      // Turn everything off
      s.activeMode = 'off';
      s.manual.on = false;
      this._assertAttempts = 0;
      this._setFan(0, 'master-off');
      s.light.mode = 'off';
      this._setLight(0);
      s.circ.activeMode = 'off';
      s.circ.manual.on = false;
      this._setCircFan(0, 'master-off');
      console.log('%c[BCC] Card DISABLED — all off', 'color:#f44336;font-weight:bold');
    } else {
      console.log('%c[BCC] Card ENABLED', 'color:#4caf50;font-weight:bold');
    }
    this._save();
    // Re-render content to reflect disabled state
    const blowerBody = r.querySelector('#body');
    if (blowerBody) blowerBody.innerHTML = this._renderTab(this._tab);
    this._bindTab();
    const lightBody = r.querySelector('#light-body');
    if (lightBody) lightBody.innerHTML = this._renderLightTab(this._lightTab);
    this._bindLightTab();
    const circBody = r.querySelector('#circ-body');
    if (circBody) { circBody.innerHTML = this._renderCircTab(this._circTab); this._bindCircTab(); }
    this._syncLight();
    this._syncHumidifier();
    this._updateStatus();
    this._updateModeStatus();
    // Toggle overlay
    const cc = r.querySelector('.cc');
    if (cc) cc.classList.toggle('card-disabled', s.cardDisabled);
  }

  _syncHAMode(mode) {
    if (!this._hass) return;
    const map = { manual: 'Manuell', zeitfenster: 'Zeitfenster', zyklus: 'Zyklus', umwelt: 'Umwelt', off: 'Manuell' };
    const haMode = map[mode] || 'Manuell';
    if (this._hass.states['input_select.blower_modus'] !== undefined) {
      this._hass.callService('input_select', 'select_option', {
        entity_id: 'input_select.blower_modus',
        option: haMode
      });
    }
  }

  _setRunDot(mode) {
    this.shadowRoot.querySelectorAll('.tab[data-tab]').forEach(b => {
      const on = b.dataset.tab === mode;
      b.classList.toggle('run', on);
      let d = b.querySelector('.rdot');
      if (on && !d) { d = document.createElement('span'); d.className = 'rdot'; b.appendChild(d); }
      else if (!on && d) d.remove();
    });
  }

  /* ── Live status updates for all modes ─────────────────────────────── */
  _updateModeStatus() {
    this._updateZeitStatus();
    this._updateCycleStatus();
    this._updateUmweltStatus();
  }

  _updateZeitStatus() {
    const r = this.shadowRoot;
    const zi = r.querySelector('#zeit-info');
    if (!zi) return;
    const z = this._settings.zeitfenster;
    const n = nowMin(), s = toMin(z.start), e = toMin(z.end);
    const inW = s <= e ? (n >= s && n < e) : (n >= s || n < e);
    zi.className = `info-card ${inW ? 'running' : 'standby'}`;
    r.querySelector('#zeit-text').textContent = inW
      ? `Im Zeitfenster · ${z.speed}%`
      : `Standby · ${this._fs(z.standby)}`;
  }

  _updateCycleStatus() {
    const r = this.shadowRoot;
    const ci = r.querySelector('#cycle-info');
    if (!ci) return;
    const z = this._settings.zyklus, st = z._state;
    const max = z.repetitions === 0 ? '∞' : z.repetitions;
    if (st.phase === 'waiting') {
      ci.className = 'info-card standby';
      r.querySelector('#cycle-text').textContent = `Warte auf Startzeit (${z.start})…`;
    } else if (st.phase === 'run') {
      const rem = Math.max(0, z.runtime * 60000 - (Date.now() - st.since));
      ci.className = 'info-card running';
      r.querySelector('#cycle-text').innerHTML = `Läuft · Zyklus ${st.count + 1}/${max} · noch ${fmtMin(rem)}`;
    } else {
      const rem = Math.max(0, z.pause * 60000 - (Date.now() - st.since));
      ci.className = 'info-card standby';
      r.querySelector('#cycle-text').innerHTML = `Pause · Zyklus ${st.count}/${max} · weiter in ${fmtMin(rem)}`;
    }
  }

  _updateUmweltStatus() {
    const r = this.shadowRoot;
    const ui = r.querySelector('#umwelt-info');
    if (!ui || !this._hass) return;
    const u = this._settings.umwelt;
    const ts = this._hass.states[this._tempE], hs = this._hass.states[this._humE];
    const temp = parseFloat(ts?.state), hum = parseFloat(hs?.state);
    const tO = !isNaN(temp) && temp > u.maxTemp, hO = !isNaN(hum) && hum > u.maxHum;
    const triggered = this._shouldRun(u, tO, hO);
    ui.className = `info-card ${triggered ? 'running' : 'standby'}`;
    r.querySelector('#umwelt-text').innerHTML = `${triggered ? `Lüfter aktiv · ${u.speed}%` : `Standby · ${this._fs(u.standby)}`}${tO ? ' <span class="warn-tag">⬆ Temp</span>' : ''}${hO ? ' <span class="warn-tag">⬆ Feuchte</span>' : ''}`;
  }

  /* ── Humidifier ───────────────────────────────────────────────────────── */
  _renderHumidifier() {
    const HM = 30, HX = 90;
    const sw = ((clamp(this._humTarget, HM, HX) - HM) / (HX - HM)) * T_ANG;
    const bg = arcPath(CX, CY, R, S_ANG, T_ANG);
    const va = arcPath(CX, CY, R, S_ANG, Math.max(1, sw));
    const th = xy(CX, CY, R, S_ANG + sw);
    const startPt = xy(CX, CY, R, S_ANG);
    const endPt = xy(CX, CY, R, S_ANG + T_ANG);
    const startIn = xy(CX, CY, R - 10, S_ANG);
    const endIn = xy(CX, CY, R - 10, S_ANG + T_ANG);
    return `
<div class="hum-section">
  <div class="toprow">
    <div class="title"><span class="ticon">💧</span> Befeuchtung</div>
    <div class="hdr-right">
      <div class="status-badge">
        <span class="sdot off" id="hum-sdot"></span>
        <span id="hum-slbl">AUS</span>
      </div>
    </div>
  </div>
  <div class="hum-chips">
    <div class="chip"><span class="cicon">💧</span><span>Feuchte <b id="hum-cur">--</b>%</span></div>
  </div>
  <div class="dial-wrap">
    <svg id="hum-dial" viewBox="0 0 220 220" class="dial" touch-action="none">
      <defs>
        <filter id="hum-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path class="arc-bg" d="${bg}"/>
      <path class="arc-val hum-arc" id="hum-arc" d="${va}" style="opacity:${sw > 5 ? 1 : 0}" filter="url(#hum-glow)"/>
      <line class="tick" x1="${startPt.x.toFixed(2)}" y1="${startPt.y.toFixed(2)}" x2="${startIn.x.toFixed(2)}" y2="${startIn.y.toFixed(2)}"/>
      <line class="tick" x1="${endPt.x.toFixed(2)}" y1="${endPt.y.toFixed(2)}" x2="${endIn.x.toFixed(2)}" y2="${endIn.y.toFixed(2)}"/>
      <circle class="thumb hum-thumb" id="hum-thumb" cx="${th.x.toFixed(2)}" cy="${th.y.toFixed(2)}" r="13"/>
      <text class="hum-lbl-title" id="hum-title" x="${CX}" y="${CY - 20}">Befeuchtung</text>
      <text class="pnum" id="hum-pnum" x="${CX}" y="${CY + 10}">${this._humTarget}</text>
      <text class="punit" x="${CX}" y="${CY + 28}">%</text>
    </svg>
    <div class="tick-label l">${HM}</div>
    <div class="tick-label r">${HX}</div>
  </div>
  <div class="hum-btn-row">
    <button class="hum-step-btn" id="hum-minus">−</button>
    <button class="hum-step-btn" id="hum-plus">+</button>
  </div>

</div>`;
  }

  _bindHumidifier() {
    const r = this.shadowRoot;
    const dial = r.querySelector('#hum-dial');
    if (!dial) return;

    dial.addEventListener('pointerdown', e => {
      e.preventDefault(); dial.setPointerCapture(e.pointerId);
      this._humDragging = true; this._onHumDrag(e, dial);
    });
    dial.addEventListener('pointermove', e => {
      if (!this._humDragging) return; e.preventDefault(); this._onHumDrag(e, dial);
    });
    const end = () => {
      if (this._humDragging) { this._humDragging = false; this._setHumidity(this._humTarget); }
    };
    dial.addEventListener('pointerup', end);
    dial.addEventListener('pointercancel', end);

    r.querySelector('#hum-minus')?.addEventListener('click', () => {
      this._humTarget = clamp(this._humTarget - 1, 30, 90);
      this._updateHumDial(this._humTarget);
      this._setHumidity(this._humTarget);
    });
    r.querySelector('#hum-plus')?.addEventListener('click', () => {
      this._humTarget = clamp(this._humTarget + 1, 30, 90);
      this._updateHumDial(this._humTarget);
      this._setHumidity(this._humTarget);
    });

  }

  _onHumDrag(e, svg) {
    const rc = svg.getBoundingClientRect();
    const deg = Math.atan2(e.clientY - (rc.top + rc.height / 2), e.clientX - (rc.left + rc.width / 2)) * 180 / Math.PI;
    const a = ((deg % 360) + 360) % 360;
    const rel = ((a - S_ANG) + 360) % 360;
    let val;
    if (rel > T_ANG) val = rel > T_ANG + (360 - T_ANG) / 2 ? 30 : 90;
    else val = Math.round(30 + (rel / T_ANG) * (90 - 30));
    this._humTarget = val;
    this._updateHumDial(val);
    this._throttledSetHum(val);
  }

  _updateHumDial(val) {
    const r = this.shadowRoot;
    const sw = ((clamp(val, 30, 90) - 30) / (90 - 30)) * T_ANG;
    const va = arcPath(CX, CY, R, S_ANG, Math.max(1, sw));
    const th = xy(CX, CY, R, S_ANG + sw);
    const arc = r.querySelector('#hum-arc');
    if (arc) { arc.setAttribute('d', va); arc.style.opacity = sw > 5 ? '1' : '0'; }
    const thumb = r.querySelector('#hum-thumb');
    if (thumb) { thumb.setAttribute('cx', th.x.toFixed(2)); thumb.setAttribute('cy', th.y.toFixed(2)); }
    const pnum = r.querySelector('#hum-pnum');
    if (pnum) pnum.textContent = val;
  }

  _syncHumidifier() {
    if (!this._hass || !this._rendered) return;
    const r = this.shadowRoot;
    const st = this._hass.states[this._humidifier];
    if (!st) return;

    const isOn = st.state === 'on';
    const curHum = st.attributes.current_humidity;
    const target = st.attributes.humidity;

    // Status badge
    const dot = r.querySelector('#hum-sdot');
    const lbl = r.querySelector('#hum-slbl');
    if (dot) dot.className = `sdot ${isOn ? 'on' : 'off'}`;
    if (lbl) lbl.textContent = isOn ? 'AN' : 'AUS';

    // Current humidity chip
    const curEl = r.querySelector('#hum-cur');
    if (curEl) curEl.textContent = curHum != null ? parseFloat(curHum).toFixed(1) : '--';

    // Action text in dial
    const action = st.attributes.action;
    const titleEl = r.querySelector('#hum-title');
    if (titleEl) {
      const labels = { drying: 'Entfeuchtung', humidifying: 'Befeuchtung', idle: 'Standby', off: 'Aus' };
      titleEl.textContent = labels[action] || (isOn ? 'Aktiv' : 'Aus');
    }

    // Sync target from HA
    if (!this._humDragging && target != null) {
      const haTarget = Math.round(target);
      if (this._humTarget !== haTarget) {
        this._humTarget = haTarget;
        this._updateHumDial(haTarget);
      }
    }

  }

  _setHumidity(val) {
    if (!this._hass) return;
    console.log(`%c[BCC] humidifier set_humidity → ${val}%`, 'color:#03a9f4');
    this._hass.callService('humidifier', 'set_humidity', {
      entity_id: this._humidifier, humidity: val
    });
  }

  _toggleHumidifier() {
    if (!this._hass) return;
    const st = this._hass.states[this._humidifier];
    const isOn = st?.state === 'on';
    console.log(`%c[BCC] humidifier → ${isOn ? 'off' : 'on'}`, isOn ? 'color:#f44336' : 'color:#4caf50');
    this._hass.callService('humidifier', isOn ? 'turn_off' : 'turn_on', {
      entity_id: this._humidifier
    });
  }

  /* ── Light ────────────────────────────────────────────────────────────── */
  _renderLight() {
    const LTABS = ['manual', 'schedule'];
    const LNAMES = { manual: 'Manuell', schedule: 'Zeitplan' };
    return `
<div class="light-section">
  <div class="toprow">
    <div class="title"><span class="ticon">☀️</span> Beleuchtung</div>
    <div class="hdr-right">
      <div class="status-badge">
        <span class="sdot off" id="light-sdot"></span>
        <span id="light-slbl">AUS</span><span class="spct" id="light-spct"></span>
      </div>
    </div>
  </div>
  <div class="tabbar light-tabbar">
    ${LTABS.map(t => `<button class="tab light-tab${t === this._lightTab ? ' act' : ''}" data-ltab="${t}">${LNAMES[t]}</button>`).join('')}
  </div>
  <div id="light-body">${this._renderLightTab(this._lightTab)}</div>
</div>`;
  }

  _renderLightTab(t) {
    if (t === 'manual') return this._tLightManual();
    if (t === 'schedule') return this._tLightSchedule();
    return '';
  }

  _tLightManual() {
    const ls = this._settings.light;
    const bri = ls.brightness;
    const sw = (clamp(bri, 0, 100) / 100) * T_ANG;
    const bg = arcPath(CX, CY, R, S_ANG, T_ANG);
    const va = arcPath(CX, CY, R, S_ANG, Math.max(1, sw));
    const th = xy(CX, CY, R, S_ANG + sw);
    const startPt = xy(CX, CY, R, S_ANG);
    const endPt = xy(CX, CY, R, S_ANG + T_ANG);
    const startIn = xy(CX, CY, R - 10, S_ANG);
    const endIn = xy(CX, CY, R - 10, S_ANG + T_ANG);
    return `
<div class="mwrap">
  <div class="dial-wrap">
    <svg id="light-dial" viewBox="0 0 220 220" class="dial" touch-action="none">
      <defs>
        <filter id="light-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path class="arc-bg" d="${bg}"/>
      <path class="arc-val light-arc" id="light-arc" d="${va}" style="opacity:${sw > 5 ? 1 : 0}" filter="url(#light-glow)"/>
      <line class="tick" x1="${startPt.x.toFixed(2)}" y1="${startPt.y.toFixed(2)}" x2="${startIn.x.toFixed(2)}" y2="${startIn.y.toFixed(2)}"/>
      <line class="tick" x1="${endPt.x.toFixed(2)}" y1="${endPt.y.toFixed(2)}" x2="${endIn.x.toFixed(2)}" y2="${endIn.y.toFixed(2)}"/>
      <circle class="thumb light-thumb" id="light-thumb" cx="${th.x.toFixed(2)}" cy="${th.y.toFixed(2)}" r="13"/>
      <text class="pnum" id="light-pnum" x="${CX}" y="${CY + 2}">${bri}</text>
      <text class="punit" x="${CX}" y="${CY + 22}">%</text>
    </svg>
    <div class="tick-label l">0</div>
    <div class="tick-label r">100</div>
  </div>
  <div class="mbtns">
    <button id="light-tog" class="pbtn${this._hass?.states[this._light]?.state === 'on' ? ' on' : ''}">${this._hass?.states[this._light]?.state === 'on' ? '⏻&nbsp;&nbsp;Ausschalten' : '⏻&nbsp;&nbsp;Einschalten'}</button>
  </div>
</div>`;
  }

  _tLightSchedule() {
    const sc = this._settings.light.schedule;
    const active = this._settings.light.mode === 'schedule';
    return `<div class="swrap">
  ${active ? `<div id="light-sched-info" class="info-card standby"><span class="ic-dot"></span><span id="light-sched-text">—</span></div>` : ''}
  <div class="sec"><div class="seclbl">Lichtplan</div>
    ${this._trow('ls-start', 'Einschalten', sc.start)}
    ${this._trow('ls-end', 'Ausschalten', sc.end)}
  </div>
  <div class="sec"><div class="seclbl">Sunrise / Sunset Simulation</div>
    ${this._row('ls-rampup', 'Sonnenaufgang', 0, 120, 1, sc.rampUp, v => v === 0 ? 'Aus' : v + ' min')}
    ${this._row('ls-rampdn', 'Sonnenuntergang', 0, 120, 1, sc.rampDown, v => v === 0 ? 'Aus' : v + ' min')}
  </div>
  <div class="sec"><div class="seclbl">Helligkeit</div>
    ${this._row('ls-bri', 'Max Helligkeit', 1, 100, 1, this._settings.light.brightness, v => v + '%')}
  </div>
  <div class="abtn-row">
    <button class="abtn${active ? ' a' : ''}" id="light-sched-act">${active ? '✓ Aktiv' : 'Aktivieren'}</button>
    ${active ? '<button class="abtn off-btn" id="light-sched-off">⏻ Ausschalten</button>' : ''}
  </div>
</div>`;
  }

  _switchLightTab(tab) {
    this._lightTab = tab;
    const r = this.shadowRoot;
    r.querySelectorAll('.light-tab').forEach(b => b.classList.toggle('act', b.dataset.ltab === tab));
    r.querySelector('#light-body').innerHTML = this._renderLightTab(tab);
    this._bindLightTab();
    this._updateLightStatus();
  }

  _bindLightTab() {
    if (this._lightTabAbort) this._lightTabAbort.abort();
    this._lightTabAbort = new AbortController();
    const sig = { signal: this._lightTabAbort.signal };
    const r = this.shadowRoot, ls = this._settings.light;

    // Tab buttons
    r.querySelectorAll('.light-tab').forEach(b =>
      b.addEventListener('click', () => this._switchLightTab(b.dataset.ltab), sig));

    if (this._lightTab === 'manual') {
      const dial = r.querySelector('#light-dial');
      if (dial) {
        dial.addEventListener('pointerdown', e => {
          e.preventDefault(); dial.setPointerCapture(e.pointerId);
          this._lightDragging = true; this._onLightDrag(e, dial);
        }, sig);
        dial.addEventListener('pointermove', e => {
          if (!this._lightDragging) return; e.preventDefault(); this._onLightDrag(e, dial);
        }, sig);
        const end = () => {
          if (this._lightDragging) {
            this._lightDragging = false;
            this._lightCmdGuard = Date.now() + 2000;
            // Einmal senden beim Loslassen
            if (ls.brightness <= 0) {
              this._hass?.callService('light', 'turn_off', { entity_id: this._light });
            } else {
              const bri = clamp(Math.round(clamp(ls.brightness, 1, 100) * 2.55), 1, 255);
              this._hass?.callService('light', 'turn_on', { entity_id: this._light, brightness: bri });
            }
            // Status-Badge sofort updaten
            const spct = r.querySelector('#light-spct');
            if (spct) spct.textContent = ls.brightness > 0 ? ` ${ls.brightness}%` : '';
            const dot = r.querySelector('#light-sdot');
            if (dot) dot.className = `sdot ${ls.brightness > 0 ? 'on' : 'off'}`;
            const lbl = r.querySelector('#light-slbl');
            if (lbl) lbl.textContent = ls.brightness > 0 ? 'AN' : 'AUS';
            this._save();
          }
        };
        dial.addEventListener('pointerup', end, sig);
        dial.addEventListener('pointercancel', end, sig);
      }
      r.querySelector('#light-tog')?.addEventListener('click', () => {
        const st = this._hass?.states[this._light];
        const isOn = st?.state === 'on';
        this._lightCmdGuard = Date.now() + 2000;
        if (isOn) {
          this._hass?.callService('light', 'turn_off', { entity_id: this._light });
        } else {
          const pct = ls.brightness > 0 ? ls.brightness : 100;
          if (ls.brightness <= 0) { ls.brightness = 100; this._updateLightDial(100); }
          this._hass?.callService('light', 'turn_on', { entity_id: this._light, brightness: clamp(Math.round(pct * 2.55), 1, 255) });
        }
        // Update button immediately
        const tog = r.querySelector('#light-tog');
        if (tog) {
          tog.innerHTML = !isOn ? '⏻&nbsp;&nbsp;Ausschalten' : '⏻&nbsp;&nbsp;Einschalten';
          tog.className = `pbtn${!isOn ? ' on' : ''}`;
        }
      }, sig);
    }

    if (this._lightTab === 'schedule') {
      this._otime(r, '#ls-start', v => ls.schedule.start = v, sig);
      this._otime(r, '#ls-end', v => ls.schedule.end = v, sig);
      // Range-Slider: während Drag nur Setting ändern, bei Loslassen evaluieren
      const schedRange = (sel, cb, fmt) => {
        const el = r.querySelector(sel); if (!el) return;
        const vEl = r.querySelector(`${sel}-v`);
        el.addEventListener('input', e => {
          const v = parseFloat(e.target.value); cb(v);
          if (vEl) vEl.textContent = fmt(v);
          el.style.setProperty('--v', `${(v - parseFloat(el.min)) / (parseFloat(el.max) - parseFloat(el.min)) * 100}%`);
          this._lightCmdGuard = Date.now() + 1000;
        }, sig);
        el.addEventListener('change', () => { this._lightCmdGuard = 0; this._save(); this._evalLight(); }, sig);
      };
      schedRange('#ls-rampup', v => ls.schedule.rampUp = v, v => v === 0 ? 'Aus' : v + ' min');
      schedRange('#ls-rampdn', v => ls.schedule.rampDown = v, v => v === 0 ? 'Aus' : v + ' min');
      schedRange('#ls-bri', v => ls.brightness = v, v => v + '%');
      r.querySelector('#light-sched-act')?.addEventListener('click', () => {
        ls.mode = 'schedule'; this._save();
        r.querySelector('#light-body').innerHTML = this._renderLightTab('schedule');
        this._bindLightTab(); this._evalLight();
      }, sig);
      r.querySelector('#light-sched-off')?.addEventListener('click', () => {
        ls.mode = 'off'; this._save();
        this._hass?.callService('light', 'turn_off', { entity_id: this._light });
        r.querySelector('#light-body').innerHTML = this._renderLightTab('schedule');
        this._bindLightTab();
      }, sig);
    }
  }

  _onLightDrag(e, svg) {
    const rc = svg.getBoundingClientRect();
    const deg = Math.atan2(e.clientY - (rc.top + rc.height / 2), e.clientX - (rc.left + rc.width / 2)) * 180 / Math.PI;
    const a = ((deg % 360) + 360) % 360;
    const rel = ((a - S_ANG) + 360) % 360;
    let val;
    if (rel > T_ANG) val = rel > T_ANG + (360 - T_ANG) / 2 ? 0 : 100;
    else val = Math.round((rel / T_ANG) * 100);
    this._settings.light.mode = 'manual';
    this._settings.light.brightness = val;
    this._updateLightDial(val);
    // Status-Badge live updaten
    const spct = this.shadowRoot.querySelector('#light-spct');
    if (spct) spct.textContent = val > 0 ? ` ${val}%` : '';
    // Kein Befehl während dem Ziehen — wird erst bei pointerup gesendet
  }

  _updateLightDial(val) {
    const r = this.shadowRoot;
    const sw = (clamp(val, 0, 100) / 100) * T_ANG;
    const va = arcPath(CX, CY, R, S_ANG, Math.max(1, sw));
    const th = xy(CX, CY, R, S_ANG + sw);
    const arc = r.querySelector('#light-arc');
    if (arc) { arc.setAttribute('d', va); arc.style.opacity = sw > 5 ? '1' : '0'; }
    const thumb = r.querySelector('#light-thumb');
    if (thumb) { thumb.setAttribute('cx', th.x.toFixed(2)); thumb.setAttribute('cy', th.y.toFixed(2)); }
    const pnum = r.querySelector('#light-pnum');
    if (pnum) pnum.textContent = val;
  }

  _syncLight() {
    if (!this._hass || !this._rendered) return;
    if (this._lightDragging || Date.now() < this._lightCmdGuard) return;
    const r = this.shadowRoot;
    const st = this._hass.states[this._light];
    if (!st) return;
    const isOn = st.state === 'on';
    const bri = st.attributes.brightness;
    const ls = this._settings.light;

    // 1. Status badge — always reflects entity
    const dot = r.querySelector('#light-sdot');
    const lbl = r.querySelector('#light-slbl');
    const spct = r.querySelector('#light-spct');
    if (dot) dot.className = `sdot ${isOn ? 'on' : 'off'}`;
    if (lbl) lbl.textContent = isOn ? 'AN' : 'AUS';
    if (spct) spct.textContent = (isOn && bri != null) ? ` ${Math.round(bri / 2.55)}%` : '';

    // 2. Toggle button — always reflects entity
    const tog = r.querySelector('#light-tog');
    if (tog) {
      tog.className = `pbtn${isOn ? ' on' : ''}`;
      tog.innerHTML = isOn ? '⏻&nbsp;&nbsp;Ausschalten' : '⏻&nbsp;&nbsp;Einschalten';
    }

    // 3. Sync brightness from entity → dial (when on and not in schedule)
    if (isOn && bri != null && ls.mode !== 'schedule') {
      const pct = Math.round(bri / 2.55);
      if (ls.brightness !== pct) {
        ls.brightness = pct;
        this._save();
        this._updateLightDial(pct);
      }
    }

    // 4. Sync mode
    if (ls.mode !== 'schedule') {
      const newMode = isOn ? 'manual' : 'off';
      if (ls.mode !== newMode) {
        ls.mode = newMode;
        this._save();
      }
    }
  }

  _setLight(pct) {
    if (!this._hass) return;
    if (pct <= 0) {
      this._hass.callService('light', 'turn_off', { entity_id: this._light });
    } else {
      const bri = clamp(Math.round(clamp(pct, 1, 100) * 2.55), 1, 255);
      this._hass.callService('light', 'turn_on', { entity_id: this._light, brightness: bri });
    }
  }

  /* ── Circulation Fan (Umluft) ──────────────────────────────────────── */
  _renderCirc() {
    const CTABS = ['manual', 'zeitfenster', 'zyklus', 'umwelt'];
    const CNAMES = { manual: 'Manuell', zeitfenster: 'Zeitfenster', zyklus: 'Zyklus', umwelt: 'Umwelt' };
    return `
<div class="circ-section">
  <div class="toprow">
    <div class="title"><span class="ticon">🌀</span> Umluft</div>
    <div class="hdr-right">
      <div class="status-badge">
        <span class="sdot off" id="circ-sdot"></span>
        <span id="circ-slbl">AUS</span><span class="spct" id="circ-spct"></span>
      </div>
    </div>
  </div>
  <div class="tabbar circ-tabbar">
    ${CTABS.map(t => `<button class="tab circ-tab${t === this._circTab ? ' act' : ''}${this._settings.circ.activeMode === t ? ' run' : ''}" data-ctab="${t}">
      ${CNAMES[t]}${this._settings.circ.activeMode === t ? '<span class="rdot"></span>' : ''}
    </button>`).join('')}
  </div>
  <div id="circ-body">${this._renderCircTab(this._circTab)}</div>
</div>`;
  }

  _renderCircTab(t) {
    switch (t) {
      case 'manual': return this._tCircManual();
      case 'zeitfenster': return this._tCircZeit();
      case 'zyklus': return this._tCircZyklus();
      case 'umwelt': return this._tCircUmwelt();
    }
    return '';
  }

  _tCircManual() {
    const m = this._settings.circ.manual;
    const sw = pctToSweep0(m.speed);
    const bg = arcPath(CX, CY, R, S_ANG, T_ANG);
    const va = arcPath(CX, CY, R, S_ANG, Math.max(1, sw));
    const th = xy(CX, CY, R, S_ANG + sw);
    const startPt = xy(CX, CY, R, S_ANG);
    const endPt = xy(CX, CY, R, S_ANG + T_ANG);
    const startIn = xy(CX, CY, R - 10, S_ANG);
    const endIn = xy(CX, CY, R - 10, S_ANG + T_ANG);
    const isAct = this._settings.circ.activeMode === 'manual';
    return `
<div class="mwrap">
  <div class="dial-wrap">
    <svg id="circ-dial" viewBox="0 0 220 220" class="dial" touch-action="none">
      <defs>
        <filter id="circ-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path class="arc-bg" d="${bg}"/>
      <path class="arc-val circ-arc" id="circ-arc-val" d="${va}" style="opacity:${sw > 5 ? 1 : 0}" filter="url(#circ-glow)"/>
      <line class="tick" x1="${startPt.x.toFixed(2)}" y1="${startPt.y.toFixed(2)}" x2="${startIn.x.toFixed(2)}" y2="${startIn.y.toFixed(2)}"/>
      <line class="tick" x1="${endPt.x.toFixed(2)}" y1="${endPt.y.toFixed(2)}" x2="${endIn.x.toFixed(2)}" y2="${endIn.y.toFixed(2)}"/>
      <circle class="thumb circ-thumb" id="circ-thumb" cx="${th.x.toFixed(2)}" cy="${th.y.toFixed(2)}" r="13"/>
      <text class="pnum" id="circ-pnum" x="${CX}" y="${CY + 2}">${m.speed}</text>
      <text class="punit" x="${CX}" y="${CY + 22}">%</text>
    </svg>
    <div class="tick-label l">0</div>
    <div class="tick-label r">100</div>
  </div>
  <div class="mbtns">
    <button id="circ-tog" class="pbtn${m.on ? ' on' : ''}">${m.on ? '⏻&nbsp;&nbsp;Ausschalten' : '⏻&nbsp;&nbsp;Einschalten'}</button>
    <button class="abtn${isAct ? ' a' : ''}" data-cact="manual">${isAct ? '✓ Aktiv' : 'Aktivieren'}</button>
  </div>
</div>`;
  }

  _cfs(v) { return v <= 0 ? 'AUS' : v + '%'; }

  _tCircZeit() {
    const z = this._settings.circ.zeitfenster;
    const isAct = this._settings.circ.activeMode === 'zeitfenster';
    let statusHtml = '';
    if (isAct) {
      statusHtml = `<div id="circ-zeit-info" class="info-card standby"><span class="ic-dot"></span><span id="circ-zeit-text">—</span></div>`;
    }
    return `<div class="swrap">
  ${statusHtml}
  <div class="sec"><div class="seclbl">Zeitfenster</div>
    ${this._trow('cf-s', 'Start', z.start)}
    ${this._trow('cf-e', 'Ende', z.end)}
  </div>
  <div class="sec"><div class="seclbl">Geschwindigkeit</div>
    ${this._row('cf-spd', 'Im Zeitfenster', 10, 100, 10, z.speed, v => v + '%')}
    ${this._row('cf-stby', 'Standby (außerhalb)', 0, 100, 10, z.standby, this._cfs.bind(this))}
  </div>
  <div class="abtn-row">
    <button class="abtn${isAct ? ' a' : ''}" data-cact="zeitfenster">${isAct ? '✓ Aktiv' : 'Aktivieren'}</button>
    ${isAct ? '<button class="abtn off-btn" data-cact="off">⏻ Ausschalten</button>' : ''}
  </div>
</div>`;
  }

  _tCircZyklus() {
    const z = this._settings.circ.zyklus;
    const isAct = this._settings.circ.activeMode === 'zyklus';
    let statusHtml = '';
    if (isAct) {
      statusHtml = `<div id="circ-cycle-info" class="info-card standby"><span class="ic-dot"></span><span id="circ-cycle-text">—</span></div>`;
    }
    return `<div class="swrap">
  ${statusHtml}
  <div class="sec"><div class="seclbl">Zyklus</div>
    ${this._trow('cf-zs', 'Startzeit', z.start)}
    ${this._row('cf-run', 'Laufzeit', 1, 120, 1, z.runtime, v => v + ' min')}
    ${this._row('cf-pau', 'Pause', 1, 240, 1, z.pause, v => v + ' min')}
    ${this._row('cf-rep', 'Wiederholungen', 0, 24, 1, z.repetitions, v => v === 0 ? '∞' : String(v))}
  </div>
  <div class="sec"><div class="seclbl">Geschwindigkeit</div>
    ${this._row('cf-zspd', 'Zyklus aktiv', 10, 100, 10, z.speed, v => v + '%')}
    ${this._row('cf-zstby', 'Standby (Pause)', 0, 100, 10, z.standby, this._cfs.bind(this))}
  </div>
  <div class="abtn-row">
    <button class="abtn${isAct ? ' a' : ''}" data-cact="zyklus">${isAct ? '✓ Aktiv' : 'Aktivieren'}</button>
    ${isAct ? '<button class="abtn off-btn" data-cact="off">⏻ Ausschalten</button>' : ''}
  </div>
</div>`;
  }

  _tCircUmwelt() {
    const u = this._settings.circ.umwelt;
    const isAct = this._settings.circ.activeMode === 'umwelt';
    let statusHtml = '';
    if (isAct) {
      statusHtml = `<div id="circ-umwelt-info" class="info-card standby"><span class="ic-dot"></span><span id="circ-umwelt-text">—</span></div>`;
    }
    return `<div class="swrap">
  ${statusHtml}
  <div class="sec"><div class="seclbl">Umwelt-Schwellen</div>
    ${this._row('cf-temp', 'Max Temperatur', 15, 40, .5, u.maxTemp, v => v + '°C')}
    ${this._row('cf-hum', 'Max Luftfeuchte', 30, 100, 1, u.maxHum, v => v + '%')}
  </div>
  <div class="sec"><div class="seclbl">Geschwindigkeit</div>
    ${this._row('cf-uspd', 'Lüfter aktiv', 10, 100, 10, u.speed, v => v + '%')}
    ${this._row('cf-ustby', 'Standby', 0, 100, 10, u.standby, this._cfs.bind(this))}
  </div>
  <div class="sec"><div class="seclbl">Modus</div>
    <div class="mgrid">
      <button class="mbtn${u.mode === 'both' ? ' a' : ''}" data-cenv="both">Beide</button>
      <button class="mbtn${u.mode === 'only_temp' ? ' a' : ''}" data-cenv="only_temp">Nur Temp</button>
      <button class="mbtn${u.mode === 'only_hum' ? ' a' : ''}" data-cenv="only_hum">Nur Feuchte</button>
    </div>
  </div>
  <div class="abtn-row">
    <button class="abtn${isAct ? ' a' : ''}" data-cact="umwelt">${isAct ? '✓ Aktiv' : 'Aktivieren'}</button>
    ${isAct ? '<button class="abtn off-btn" data-cact="off">⏻ Ausschalten</button>' : ''}
  </div>
</div>`;
  }

  _switchCircTab(tab) {
    this._circTab = tab;
    const r = this.shadowRoot;
    r.querySelectorAll('.circ-tab').forEach(b => b.classList.toggle('act', b.dataset.ctab === tab));
    r.querySelector('#circ-body').innerHTML = this._renderCircTab(tab);
    this._bindCircTab();
    this._updateCircModeStatus();
  }

  _bindCircTab() {
    if (this._circTabAbort) this._circTabAbort.abort();
    this._circTabAbort = new AbortController();
    const sig = { signal: this._circTabAbort.signal };
    const r = this.shadowRoot, cs = this._settings.circ, t = this._circTab;

    // Tab buttons
    r.querySelectorAll('.circ-tab').forEach(b =>
      b.addEventListener('click', () => this._switchCircTab(b.dataset.ctab), sig));

    // Activate buttons
    r.querySelectorAll('[data-cact]').forEach(b =>
      b.addEventListener('click', () => this._activateCirc(b.dataset.cact), sig));

    if (t === 'manual') {
      const dial = r.querySelector('#circ-dial');
      if (dial) {
        dial.addEventListener('pointerdown', e => {
          e.preventDefault(); dial.setPointerCapture(e.pointerId);
          this._circDragging = true; this._onCircDrag(e, dial);
        }, sig);
        dial.addEventListener('pointermove', e => {
          if (!this._circDragging) return; e.preventDefault(); this._onCircDrag(e, dial);
        }, sig);
        const end = () => {
          if (this._circDragging) {
            this._circDragging = false;
            this._circCmdGuard = Date.now() + 2000;
            if (cs.manual.on && cs.activeMode === 'manual') {
              this._setCircFan(cs.manual.speed, 'drag-end');
            }
            const spctEl = r.querySelector('#circ-spct');
            if (spctEl) spctEl.textContent = ` ${cs.manual.speed}%`;
            this._save();
          }
        };
        dial.addEventListener('pointerup', end, sig);
        dial.addEventListener('pointercancel', end, sig);
      }
      const tog = r.querySelector('#circ-tog');
      if (tog) tog.addEventListener('click', () => this._toggleCircManual(), sig);
    }

    if (t === 'zeitfenster') {
      this._otime(r, '#cf-s', v => cs.zeitfenster.start = v, sig);
      this._otime(r, '#cf-e', v => cs.zeitfenster.end = v, sig);
      this._orange(r, '#cf-spd', v => cs.zeitfenster.speed = v, v => v + '%', sig);
      this._orange(r, '#cf-stby', v => cs.zeitfenster.standby = v, this._cfs.bind(this), sig);
    }

    if (t === 'zyklus') {
      this._otime(r, '#cf-zs', v => { cs.zyklus.start = v; cs.zyklus._state = { phase: 'waiting', count: 0, since: null }; }, sig);
      this._orange(r, '#cf-run', v => cs.zyklus.runtime = v, v => v + ' min', sig);
      this._orange(r, '#cf-pau', v => cs.zyklus.pause = v, v => v + ' min', sig);
      this._orange(r, '#cf-rep', v => cs.zyklus.repetitions = v, v => v === 0 ? '∞' : String(v), sig);
      this._orange(r, '#cf-zspd', v => cs.zyklus.speed = v, v => v + '%', sig);
      this._orange(r, '#cf-zstby', v => cs.zyklus.standby = v, this._cfs.bind(this), sig);
    }

    if (t === 'umwelt') {
      r.querySelectorAll('[data-cenv]').forEach(b =>
        b.addEventListener('click', () => {
          cs.umwelt.mode = b.dataset.cenv; this._save();
          r.querySelectorAll('[data-cenv]').forEach(x => x.classList.toggle('act', x.dataset.cenv === b.dataset.cenv));
        }, sig));
      this._orange(r, '#cf-temp', v => cs.umwelt.maxTemp = v, v => v + '°C', sig);
      this._orange(r, '#cf-hum', v => cs.umwelt.maxHum = v, v => v + '%', sig);
      this._orange(r, '#cf-uspd', v => cs.umwelt.speed = v, v => v + '%', sig);
      this._orange(r, '#cf-ustby', v => cs.umwelt.standby = v, this._cfs.bind(this), sig);
    }
  }

  _onCircDrag(e, svg) {
    const rc = svg.getBoundingClientRect();
    const deg = Math.atan2(e.clientY - (rc.top + rc.height / 2), e.clientX - (rc.left + rc.width / 2)) * 180 / Math.PI;
    const pct = dragToPct0s(deg);
    this._settings.circ.manual.speed = pct;
    const sw = pctToSweep0(pct);
    const va = arcPath(CX, CY, R, S_ANG, Math.max(1, sw));
    const th = xy(CX, CY, R, S_ANG + sw);
    const valArc = svg.querySelector('#circ-arc-val');
    if (valArc) { valArc.setAttribute('d', va); valArc.style.opacity = sw > 5 ? '1' : '0'; }
    const thumb = svg.querySelector('#circ-thumb');
    if (thumb) { thumb.setAttribute('cx', th.x.toFixed(2)); thumb.setAttribute('cy', th.y.toFixed(2)); }
    const pnum = svg.querySelector('#circ-pnum');
    if (pnum) pnum.textContent = pct;
    const spctEl = this.shadowRoot.querySelector('#circ-spct');
    if (spctEl) spctEl.textContent = ` ${pct}%`;
  }

  _updateCircDial(pct) {
    const r = this.shadowRoot;
    if (!r) return;
    const sw = pctToSweep0(pct);
    const va = arcPath(CX, CY, R, S_ANG, Math.max(1, sw));
    const th = xy(CX, CY, R, S_ANG + sw);
    const arc = r.querySelector('#circ-arc-val');
    if (arc) { arc.setAttribute('d', va); arc.style.opacity = sw > 5 ? '1' : '0'; }
    const thumb = r.querySelector('#circ-thumb');
    if (thumb) { thumb.setAttribute('cx', th.x.toFixed(2)); thumb.setAttribute('cy', th.y.toFixed(2)); }
    const pnum = r.querySelector('#circ-pnum');
    if (pnum) pnum.textContent = pct;
  }

  _toggleCircManual() {
    const cs = this._settings.circ, r = this.shadowRoot;
    cs.manual.on = !cs.manual.on;
    cs.activeMode = 'manual';
    this._circCmdGuard = Date.now() + 2000;
    this._setCircFan(cs.manual.on ? cs.manual.speed : 0, 'toggle');
    this._save();
    const tog = r.querySelector('#circ-tog');
    if (tog) {
      tog.innerHTML = cs.manual.on ? '⏻&nbsp;&nbsp;Ausschalten' : '⏻&nbsp;&nbsp;Einschalten';
      tog.className = `pbtn${cs.manual.on ? ' on' : ''}`;
    }
    this._setCircRunDot('manual');
    r.querySelectorAll('[data-cact]').forEach(b => {
      const a = b.dataset.cact === 'manual';
      b.textContent = a ? '✓ Aktiv' : 'Aktivieren';
      b.classList.toggle('a', a);
    });
  }

  _activateCirc(mode) {
    const cs = this._settings.circ;
    cs.activeMode = mode;
    this._circCmdGuard = 0;
    this._save();
    this._setCircRunDot(mode);
    this.shadowRoot.querySelectorAll('[data-cact]').forEach(b => {
      const a = b.dataset.cact === mode;
      b.textContent = a ? '✓ Aktiv' : 'Aktivieren';
      b.classList.toggle('a', a);
    });
    if (mode === 'off') {
      cs.manual.on = false;
      this._save();
      this._setCircFan(0, 'activate-off');
    } else if (mode === 'manual') {
      this._setCircFan(cs.manual.on ? cs.manual.speed : 0, 'activate-manual');
    } else {
      this._evaluateCirc();
    }
    this.shadowRoot.querySelector('#circ-body').innerHTML = this._renderCircTab(this._circTab);
    this._bindCircTab();
    this._updateCircModeStatus();
  }

  _setCircRunDot(mode) {
    this.shadowRoot.querySelectorAll('.circ-tab').forEach(b => {
      const on = b.dataset.ctab === mode;
      b.classList.toggle('run', on);
      let d = b.querySelector('.rdot');
      if (on && !d) { d = document.createElement('span'); d.className = 'rdot'; b.appendChild(d); }
      else if (!on && d) d.remove();
    });
  }

  _setCircFan(pct, src) {
    if (!this._hass) return;
    console.log(`%c[BCC] circ → ${pct}% (${src})`, 'color:#66bb6a');
    if (!pct || pct <= 0) {
      this._hass.callService('fan', 'turn_off', { entity_id: this._circFan });
      return;
    }
    const p = snap10(clamp(Math.round(pct), 10, 100));
    const st = this._hass.states[this._circFan];
    if (st?.state === 'on') {
      this._hass.callService('fan', 'set_percentage', { entity_id: this._circFan, percentage: p });
    } else {
      this._hass.callService('fan', 'turn_on', { entity_id: this._circFan });
      setTimeout(() => {
        this._hass?.callService('fan', 'set_percentage', { entity_id: this._circFan, percentage: p });
      }, 1500);
    }
  }

  _syncCircFromHA() {
    if (!this._hass || !this._rendered) return;
    const r = this.shadowRoot;
    const st = this._hass.states[this._circFan];
    if (!st) return;
    const on = st.state === 'on';
    const pct = st.attributes?.percentage;

    // 1. Status-Badge IMMER updaten (kein Guard)
    const dot = r.querySelector('#circ-sdot');
    const lbl = r.querySelector('#circ-slbl');
    const spctEl = r.querySelector('#circ-spct');
    if (dot) dot.className = `sdot ${on ? 'on' : 'off'}`;
    if (lbl) lbl.textContent = on ? 'AN' : 'AUS';
    if (spctEl && !this._circDragging) spctEl.textContent = (on && pct != null) ? ` ${Math.round(pct)}%` : '';

    // 2. Toggle-Button IMMER updaten (kein Guard)
    const tog = r.querySelector('#circ-tog');
    if (tog) {
      tog.className = `pbtn${on ? ' on' : ''}`;
      tog.innerHTML = on ? '⏻&nbsp;&nbsp;Ausschalten' : '⏻&nbsp;&nbsp;Einschalten';
    }

    // 3. Guard für Dial-Sync
    if (this._circDragging || Date.now() < this._circCmdGuard) return;

    // 4. Sync circ.manual.on mit HA-State
    if (this._settings.circ.manual.on !== on) {
      this._settings.circ.manual.on = on;
      this._save();
    }

    // 5. Sync Speed + Dial
    if (on && pct != null) {
      const p = snap10(clamp(Math.round(pct), 10, 100));
      if (this._settings.circ.manual.speed !== p) {
        this._settings.circ.manual.speed = p;
        this._save();
        this._updateCircDial(p);
      }
    }
  }

  _updateCircStatus() {
    if (!this._hass || !this._rendered) return;
    const r = this.shadowRoot;
    const st = this._hass.states[this._circFan];
    if (!st) return;
    const on = st.state === 'on';
    const pct = st.attributes?.percentage;
    const dot = r.querySelector('#circ-sdot');
    const lbl = r.querySelector('#circ-slbl');
    const spctEl = r.querySelector('#circ-spct');
    if (dot) dot.className = `sdot ${on ? 'on' : 'off'}`;
    if (lbl) lbl.textContent = on ? 'AN' : 'AUS';
    if (spctEl && !this._circDragging) spctEl.textContent = (on && pct != null) ? ` ${Math.round(pct)}%` : '';
  }

  _evaluateCirc() {
    if (!this._hass || !this._settings) return;
    if (this._settings.cardDisabled) return;
    if (this._circDragging || Date.now() < this._circCmdGuard) return;
    this._circLastEvalTime = Date.now();
    const cs = this._settings.circ;
    switch (cs.activeMode) {
      case 'zeitfenster': this._evCircZ(); break;
      case 'zyklus':      this._evCircC(); break;
      case 'umwelt':      this._evCircU(); break;
    }
    this._updateCircModeStatus();
  }

  _evCircZ() {
    const z = this._settings.circ.zeitfenster, n = nowMin(), s = toMin(z.start), e = toMin(z.end);
    this._setCircFan((s <= e ? (n >= s && n < e) : (n >= s || n < e)) ? z.speed : z.standby, 'evCircZ');
  }

  _evCircC() {
    const z = this._settings.circ.zyklus, st = z._state;
    if (st.since && Date.now() - st.since > 172800000) {
      st.phase = 'waiting'; st.count = 0; st.since = null;
    }
    const n = nowMin(), sm = toMin(z.start);
    const max = z.repetitions === 0 ? Infinity : z.repetitions;

    if (st.phase === 'waiting') {
      if (n >= sm && n < sm + 2) {
        st.phase = 'run'; st.count = 0; st.since = Date.now();
        this._setCircFan(z.speed, 'evCircC-start');
      } else {
        this._setCircFan(z.standby, 'evCircC-wait');
      }
      this._save(); return;
    }

    const elapsed = (Date.now() - st.since) / 60000;

    if (st.phase === 'run') {
      if (elapsed >= z.runtime) {
        const newCount = st.count + 1;
        if (newCount >= max) {
          st.phase = 'waiting'; st.count = 0; st.since = null;
          this._setCircFan(z.standby, 'evCircC-done');
        } else {
          st.phase = 'pause'; st.count = newCount; st.since = Date.now();
          this._setCircFan(z.standby, 'evCircC-pause');
        }
      } else {
        this._setCircFan(z.speed, 'evCircC-run');
      }
      this._save(); return;
    }

    if (st.phase === 'pause') {
      if (elapsed >= z.pause) {
        st.phase = 'run'; st.since = Date.now();
        this._setCircFan(z.speed, 'evCircC-resume');
      } else {
        this._setCircFan(z.standby, 'evCircC-pausing');
      }
      this._save(); return;
    }
  }

  _evCircU() {
    const u = this._settings.circ.umwelt;
    const tempSt = this._hass.states[this._tempE];
    const humSt = this._hass.states[this._humE];
    const temp = tempSt ? parseFloat(tempSt.state) : null;
    const hum = humSt ? parseFloat(humSt.state) : null;
    const tO = temp !== null && !isNaN(temp) && temp > u.maxTemp;
    const hO = hum !== null && !isNaN(hum) && hum > u.maxHum;
    let run = false;
    switch (u.mode) {
      case 'both': run = tO || hO; break;
      case 'only_temp': run = tO; break;
      case 'only_hum': run = hO; break;
    }
    this._setCircFan(run ? u.speed : u.standby, 'evCircU');
  }

  _updateCircModeStatus() {
    this._updateCircZeitStatus();
    this._updateCircCycleStatus();
    this._updateCircUmweltStatus();
  }

  _updateCircZeitStatus() {
    const r = this.shadowRoot;
    const zi = r.querySelector('#circ-zeit-info');
    if (!zi) return;
    const z = this._settings.circ.zeitfenster;
    const n = nowMin(), s = toMin(z.start), e = toMin(z.end);
    const inW = s <= e ? (n >= s && n < e) : (n >= s || n < e);
    zi.className = `info-card ${inW ? 'running' : 'standby'}`;
    r.querySelector('#circ-zeit-text').textContent = inW
      ? `Im Zeitfenster · ${z.speed}%`
      : `Standby · ${this._cfs(z.standby)}`;
  }

  _updateCircCycleStatus() {
    const r = this.shadowRoot;
    const ci = r.querySelector('#circ-cycle-info');
    if (!ci) return;
    const z = this._settings.circ.zyklus, st = z._state;
    if (st.phase === 'run') {
      ci.className = 'info-card running';
      const left = Math.max(0, z.runtime * 60000 - (Date.now() - st.since));
      r.querySelector('#circ-cycle-text').textContent = `Läuft · ${z.speed}% · ${fmtMin(left)} übrig`;
    } else if (st.phase === 'pause') {
      ci.className = 'info-card standby';
      const left = Math.max(0, z.pause * 60000 - (Date.now() - st.since));
      r.querySelector('#circ-cycle-text').textContent = `Pause · ${this._cfs(z.standby)} · ${fmtMin(left)} übrig`;
    } else {
      ci.className = 'info-card standby';
      r.querySelector('#circ-cycle-text').textContent = `Wartet auf ${z.start}`;
    }
  }

  _updateCircUmweltStatus() {
    const r = this.shadowRoot;
    const ui = r.querySelector('#circ-umwelt-info');
    if (!ui) return;
    const u = this._settings.circ.umwelt;
    const tempSt = this._hass?.states[this._tempE];
    const humSt = this._hass?.states[this._humE];
    const temp = tempSt ? parseFloat(tempSt.state) : null;
    const hum = humSt ? parseFloat(humSt.state) : null;
    const tO = temp !== null && !isNaN(temp) && temp > u.maxTemp;
    const hO = hum !== null && !isNaN(hum) && hum > u.maxHum;
    let run = false;
    switch (u.mode) {
      case 'both': run = tO || hO; break;
      case 'only_temp': run = tO; break;
      case 'only_hum': run = hO; break;
    }
    ui.className = `info-card ${run ? 'running' : 'standby'}`;
    const parts = [];
    if (temp !== null) parts.push(`${temp.toFixed(1)}°C${tO ? ' ⚠' : ''}`);
    if (hum !== null) parts.push(`${Math.round(hum)}%${hO ? ' ⚠' : ''}`);
    r.querySelector('#circ-umwelt-text').textContent = run
      ? `Aktiv · ${u.speed}% · ${parts.join(' · ')}`
      : `Standby · ${this._cfs(u.standby)} · ${parts.join(' · ')}`;
  }

  _evalLight() {
    if (!this._hass) return;
    if (this._lightDragging || Date.now() < this._lightCmdGuard) return;
    const ls = this._settings.light;
    if (ls.mode !== 'schedule') return;
    const sc = ls.schedule;
    const n = nowMin(), s = toMin(sc.start), e = toMin(sc.end);
    const inW = s <= e ? (n >= s && n < e) : (n >= s || n < e);

    // Detect fresh schedule cycle (entering window from outside)
    if (inW && !this._lightWasInSched) {
      this._lightRampOk = true;
    }
    this._lightWasInSched = inW;

    if (!inW) {
      this._setLight(0);
      this._updateLightSchedInfo('off', 0);
      return;
    }

    // If light entity is off while schedule says it should be on → interrupted, disable ramps
    const st = this._hass.states[this._light];
    if (st && st.state === 'off' && this._lightRampOk) {
      // Only mark interrupted if we're past the sunrise window (light should have been on by now)
      const elapsedS = ((n - s) + 1440) % 1440;
      if (elapsedS >= sc.rampUp) {
        this._lightRampOk = false;
        console.log('%c[BCC] light interrupted mid-schedule, ramps disabled', 'color:#ff9800');
      }
    }

    const elapsedFromStart = ((n - s) + 1440) % 1440;
    const totalLen = ((e - s) + 1440) % 1440;
    const timeToEnd = totalLen - elapsedFromStart;

    // Sunset: last rampDown minutes before end (only if ramps allowed)
    if (this._lightRampOk && sc.rampDown > 0 && timeToEnd <= sc.rampDown) {
      const pct = Math.round(ls.brightness * (timeToEnd / sc.rampDown));
      this._setLight(Math.max(1, pct));
      this._updateLightSchedInfo('sunset', pct);
      return;
    }

    // Sunrise: first rampUp minutes after start (only if ramps allowed)
    if (this._lightRampOk && sc.rampUp > 0 && elapsedFromStart < sc.rampUp) {
      const pct = Math.round(ls.brightness * (elapsedFromStart / sc.rampUp));
      this._setLight(Math.max(1, pct));
      this._updateLightSchedInfo('sunrise', pct);
      return;
    }

    // Normal: full brightness
    this._setLight(ls.brightness);
    this._updateLightSchedInfo('on', ls.brightness);
  }

  _updateLightStatus() {
    const r = this.shadowRoot;
    const info = r.querySelector('#light-sched-info');
    if (!info) return;
    const ls = this._settings.light;
    const sc = ls.schedule;
    const n = nowMin(), s = toMin(sc.start), e = toMin(sc.end);
    const inW = s <= e ? (n >= s && n < e) : (n >= s || n < e);
    if (!inW) { this._updateLightSchedInfo('off', 0); return; }
    const elapsed = ((n - s) + 1440) % 1440;
    const total = ((e - s) + 1440) % 1440;
    const toEnd = total - elapsed;
    if (this._lightRampOk && sc.rampDown > 0 && toEnd <= sc.rampDown) {
      this._updateLightSchedInfo('sunset', Math.round(ls.brightness * (toEnd / sc.rampDown)));
    } else if (this._lightRampOk && sc.rampUp > 0 && elapsed < sc.rampUp) {
      this._updateLightSchedInfo('sunrise', Math.round(ls.brightness * (elapsed / sc.rampUp)));
    } else {
      this._updateLightSchedInfo('on', ls.brightness);
    }
  }

  _updateLightSchedInfo(phase, pct) {
    const r = this.shadowRoot;
    const info = r.querySelector('#light-sched-info');
    const text = r.querySelector('#light-sched-text');
    if (!info || !text) return;
    if (phase === 'sunrise') {
      info.className = 'info-card running';
      text.textContent = `Sonnenaufgang · ${pct}%`;
    } else if (phase === 'sunset') {
      info.className = 'info-card running';
      text.textContent = `Sonnenuntergang · ${pct}%`;
    } else if (phase === 'on') {
      info.className = 'info-card running';
      text.textContent = `Licht an · ${pct}%`;
    } else {
      info.className = 'info-card standby';
      text.textContent = 'Licht aus';
    }
  }

  /* ── Evaluate loop ───────────────────────────────────────────────────── */
  _evaluate() {
    if (!this._hass || !this._settings) return;
    if (this._settings.cardDisabled) return;
    if (Date.now() < this._cmdGuardUntil) return;
    this._lastEvalTime = Date.now();
    console.log(`%c[BCC] _evaluate() mode=${this._settings.activeMode}`, 'color:#9c27b0');
    switch (this._settings.activeMode) {
      case 'zeitfenster': this._evZ(); break;
      case 'zyklus':      this._evC(); break;
      case 'umwelt':      this._evU(); break;
    }
    this._updateStatus();
    this._updateModeStatus();
  }

  _evZ() {
    const z = this._settings.zeitfenster, n = nowMin(), s = toMin(z.start), e = toMin(z.end);
    this._setFan((s <= e ? (n >= s && n < e) : (n >= s || n < e)) ? z.speed : z.standby, 'evZ');
  }

  _evC() {
    const z = this._settings.zyklus, st = z._state;

    // Safety reset: if state is stuck for > 48h, reset
    if (st.since && Date.now() - st.since > 172800000) {
      this._cycleTransition(st, 'waiting', 0);
    }

    const n = nowMin(), sm = toMin(z.start);
    const max = z.repetitions === 0 ? Infinity : z.repetitions;

    if (st.phase === 'waiting') {
      // Check if we're within a 2-minute start window
      if (n >= sm && n < sm + 2) {
        this._cycleTransition(st, 'run', 0);
        this._setFan(z.speed, 'evC-start');
      } else {
        this._setFan(z.standby, 'evC-wait');
      }
      return;
    }

    const elapsed = (Date.now() - st.since) / 60000;

    if (st.phase === 'run') {
      if (elapsed >= z.runtime) {
        const newCount = st.count + 1;
        if (newCount >= max) {
          this._cycleTransition(st, 'waiting', 0);
          this._setFan(z.standby, 'evC-done');
        } else {
          this._cycleTransition(st, 'pause', newCount);
          this._setFan(z.standby, 'evC-pause');
        }
      } else {
        this._setFan(z.speed, 'evC-run');
      }
      return;
    }

    if (st.phase === 'pause') {
      if (elapsed >= z.pause) {
        this._cycleTransition(st, 'run', st.count);
        this._setFan(z.speed, 'evC-next');
      } else {
        this._setFan(z.standby, 'evC-standby');
      }
    }
  }

  _cycleTransition(st, phase, count) {
    st.phase = phase;
    st.count = count;
    st.since = phase === 'waiting' ? null : Date.now();
    this._save();
    console.log(`%c[BCC] cycle → ${phase} count=${count}`, 'color:#9c27b0');
  }

  _evU() {
    const u = this._settings.umwelt;
    const ts = this._hass.states[this._tempE], hs = this._hass.states[this._humE];
    const t = ts ? parseFloat(ts.state) : null;
    const h = hs ? parseFloat(hs.state) : null;
    const tO = t !== null && !isNaN(t) && t > u.maxTemp;
    const hO = h !== null && !isNaN(h) && h > u.maxHum;
    this._setFan(this._shouldRun(u, tO, hO) ? u.speed : u.standby, 'evU');
  }

  /* ── Fan dispatch ────────────────────────────────────────────────────── */
  _setFan(pct, src = '') {
    if (!this._hass) return;
    if (!pct || pct < MIN) {
      console.log(`%c[BCC] _setFan → turn_off (pct=${pct}) src=${src}`, 'color:#f44336');
      this._hass.callService('fan', 'turn_off', { entity_id: this._fan });
      return;
    }
    const p = Math.round(clamp(pct, MIN, MAX));
    const fanSt = this._hass.states[this._fan];
    const isOn = fanSt?.state === 'on';

    if (isOn) {
      // Fan already on — just adjust speed
      console.log(`%c[BCC] _setFan → set_percentage(${p}%) src=${src}`, 'color:#4caf50');
      this._hass.callService('fan', 'set_percentage', { entity_id: this._fan, percentage: p });
    } else {
      // Fan is off — turn on first, then set speed after delay
      console.log(`%c[BCC] _setFan → turn_on + set_percentage(${p}%) src=${src}`, 'color:#4caf50;font-weight:bold');
      this._hass.callService('fan', 'turn_on', { entity_id: this._fan });
      setTimeout(() => {
        if (!this._hass) return;
        console.log(`%c[BCC] _setFan → delayed set_percentage(${p}%) src=${src}`, 'color:#4caf50');
        this._hass.callService('fan', 'set_percentage', { entity_id: this._fan, percentage: p });
      }, 1500);
    }
  }

  /* ── Status display ──────────────────────────────────────────────────── */
  _updateSensors() {
    if (!this._hass) return;
    const r = this.shadowRoot;
    const u = this._settings.umwelt;
    const upd = (id, eid, dec, chipId, threshold) => {
      const el = r.querySelector(id); if (!el) return;
      const st = this._hass.states[eid];
      const val = st ? parseFloat(st.state) : NaN;
      el.textContent = isNaN(val) ? '--' : val.toFixed(dec);
      const chip = r.querySelector(chipId);
      if (chip && threshold !== null) chip.classList.toggle('over', !isNaN(val) && val > threshold);
    };
    upd('#s-temp', this._tempE, 1, '#chip-temp', u.maxTemp);
    upd('#s-hum',  this._humE,  0, '#chip-hum',  u.maxHum);
    upd('#s-vpd',  this._vpdE,  2, '#chip-vpd',  null);
  }

  _updateStatus() {
    if (!this._hass) return;
    const r = this.shadowRoot, dot = r.querySelector('#sdot'), lbl = r.querySelector('#slbl'), pct = r.querySelector('#spct');
    if (!dot) return;
    const st = this._hass.states[this._fan], on = st?.state === 'on';
    dot.className = `sdot ${on ? 'on' : 'off'}`;
    lbl.textContent = on ? 'AN' : 'AUS';
    if (pct && !this._isDragging) pct.textContent = (on && st.attributes.percentage != null) ? ` ${Math.round(st.attributes.percentage)}%` : '';
  }

  /* ── CSS (identical design) ──────────────────────────────────────────── */
  _css() { return `
:host{display:block}
ha-card{overflow:hidden;border-radius:16px}
.cc{padding:18px 16px 20px}

/* ── Header ── */
.toprow{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.title{font-size:1.05em;font-weight:700;color:var(--primary-text-color);display:flex;align-items:center;gap:7px}
.ticon{font-size:1.2em}
.ver{font-size:.55em;font-weight:400;color:var(--secondary-text-color,#666);margin-left:2px;vertical-align:super}
.status-badge{display:flex;align-items:center;gap:5px;background:var(--secondary-background-color,rgba(255,255,255,.07));border-radius:20px;padding:5px 12px;font-size:.84em;font-weight:600;color:var(--primary-text-color)}
.sdot{width:8px;height:8px;border-radius:50%;flex-shrink:0;transition:background .3s,box-shadow .3s}
.sdot.on{background:#4caf50;box-shadow:0 0 7px #4caf5088}
.sdot.off{background:var(--disabled-text-color,#555)}
.spct{color:var(--primary-color,#03a9f4);margin-left:1px}
.hdr-right{display:flex;align-items:center;gap:8px}
.master-btn{background:none;border:none;color:var(--primary-color,#4caf50);font-size:1.15em;cursor:pointer;padding:4px;border-radius:8px;transition:color .2s;line-height:1}
.master-btn:hover{color:var(--primary-text-color)}
.master-btn.off{color:#f44336}
.gear-btn{background:none;border:none;color:var(--secondary-text-color,#888);font-size:1.15em;cursor:pointer;padding:4px;border-radius:8px;transition:color .2s,transform .3s;line-height:1}
.gear-btn:hover{color:var(--primary-text-color)}
.gear-btn.open{color:var(--primary-color,#03a9f4);transform:rotate(60deg)}
.cc.card-disabled>.chips,.cc.card-disabled>.blower-section,.cc.card-disabled>.divider,.cc.card-disabled>.light-section,.cc.card-disabled>.hum-section,.cc.card-disabled>.circ-section{opacity:.3;pointer-events:none}
.cfg-panel{max-height:0;overflow:hidden;transition:max-height .35s ease}
.cfg-panel.open{max-height:800px}
.cfg-row{display:flex;flex-direction:column;gap:3px}
.cfg-row label{font-size:.72em;color:var(--secondary-text-color);font-weight:600;text-transform:uppercase;letter-spacing:.8px}
.cfg-input{background:var(--card-background-color,rgba(0,0,0,.3));border:1px solid var(--divider-color,rgba(255,255,255,.1));border-radius:9px;color:var(--primary-text-color);padding:7px 10px;font-size:.82em;width:100%;box-sizing:border-box;font-family:monospace}
.cfg-input:focus{outline:none;border-color:var(--primary-color,#03a9f4);box-shadow:0 0 0 3px rgba(3,169,244,.15)}
.cfg-save-btn{width:100%;margin-top:4px;padding:10px;border-radius:12px;background:var(--primary-color,#03a9f4);border:none;color:#fff;font-size:.85em;font-weight:700;cursor:pointer;transition:filter .2s;letter-spacing:.5px}
.cfg-save-btn:hover{filter:brightness(1.1)}
.mod-order{display:flex;flex-direction:column;gap:4px}
.mod-item{display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-radius:9px;background:var(--card-background-color,rgba(0,0,0,.3));border:1px solid var(--divider-color,rgba(255,255,255,.1))}
.mod-name{font-size:.82em;color:var(--primary-text-color)}
.mod-btns{display:flex;gap:4px}
.mod-btn{width:28px;height:28px;border-radius:6px;border:1px solid var(--divider-color,rgba(255,255,255,.15));background:transparent;color:var(--primary-text-color);font-size:.7em;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
.mod-btn:hover:not(:disabled){border-color:var(--primary-color,#03a9f4);color:var(--primary-color,#03a9f4)}
.mod-btn:disabled{opacity:.25;cursor:default}

/* ── Sensor chips ── */
.chips{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
.chip{display:flex;align-items:center;gap:5px;background:var(--secondary-background-color,rgba(255,255,255,.07));border-radius:12px;padding:6px 12px;flex:1;font-size:.82em;color:var(--primary-text-color);transition:background .3s,border-color .3s;border:1px solid transparent}
.chip.over{background:rgba(244,67,54,.12);border-color:rgba(244,67,54,.4)}
.chip.over b{color:#f44336}
.chip b{font-weight:700}
.cicon{font-size:1em}

/* ── Tab bar ── */
.tabbar{display:flex;gap:3px;background:rgba(0,0,0,.25);border-radius:14px;padding:3px;margin-bottom:14px}
.tab{flex:1;padding:8px 3px;background:transparent;border:none;color:var(--secondary-text-color,#888);cursor:pointer;font-size:.76em;font-weight:500;border-radius:11px;position:relative;transition:background .2s,color .2s,box-shadow .2s;white-space:nowrap}
.tab:hover{color:var(--primary-text-color)}
.tab.act{background:var(--card-background-color,#1c1c1e);color:var(--primary-text-color);font-weight:700;box-shadow:0 2px 10px rgba(0,0,0,.4)}
.rdot{position:absolute;top:4px;right:4px;width:5px;height:5px;border-radius:50%;background:#4caf50;box-shadow:0 0 5px #4caf50}

/* ── Manual ── */
.mwrap{display:flex;flex-direction:column;align-items:center;gap:14px;padding:4px 0}
.dial-wrap{position:relative;display:flex;align-items:center;justify-content:center}
.dial{width:210px;height:210px;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}
.dial:active{cursor:grabbing}
.arc-bg{fill:none;stroke:var(--divider-color,rgba(255,255,255,.1));stroke-width:16;stroke-linecap:round}
.arc-val{fill:none;stroke:var(--primary-color,#03a9f4);stroke-width:16;stroke-linecap:round;transition:opacity .1s}
.tick{stroke:var(--secondary-text-color,#666);stroke-width:2;stroke-linecap:round}
.thumb{fill:#fff;stroke:var(--primary-color,#03a9f4);stroke-width:3;filter:drop-shadow(0 2px 8px rgba(0,0,0,.7));transition:r .1s}
.pnum{font-size:44px;font-weight:800;fill:var(--primary-text-color,#fff);text-anchor:middle;dominant-baseline:middle}
.punit{font-size:14px;font-weight:500;fill:var(--secondary-text-color,#888);text-anchor:middle;dominant-baseline:middle}
.dst{font-size:11px;font-weight:700;letter-spacing:2.5px;text-anchor:middle;dominant-baseline:middle}
.dst.on{fill:#4caf50}.dst.off{fill:var(--secondary-text-color,#666)}
.tick-label{position:absolute;bottom:14px;font-size:.7em;color:var(--secondary-text-color,#888);font-weight:600}
.tick-label.l{left:18px}.tick-label.r{right:18px}
.mbtns{display:flex;flex-direction:column;gap:10px;width:100%}
.pbtn{display:flex;align-items:center;justify-content:center;padding:13px;border-radius:14px;border:none;background:var(--secondary-background-color,rgba(255,255,255,.08));color:var(--secondary-text-color);cursor:pointer;font-size:.95em;font-weight:600;transition:all .2s;box-shadow:0 2px 8px rgba(0,0,0,.2);letter-spacing:.3px}
.pbtn:hover{filter:brightness(1.15)}
.pbtn.on{background:var(--primary-color,#03a9f4);color:#fff;box-shadow:0 4px 20px rgba(3,169,244,.45)}

/* ── Settings ── */
.swrap{display:flex;flex-direction:column;gap:10px}
.sec{background:var(--secondary-background-color,rgba(255,255,255,.05));border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:9px;border:1px solid var(--divider-color,rgba(255,255,255,.06))}
.seclbl{font-size:.68em;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--secondary-text-color,#888);margin-bottom:1px}
.srow{display:flex;flex-direction:column;gap:5px}
.trow{flex-direction:row;align-items:center;justify-content:space-between;gap:12px}
.slbl{display:flex;justify-content:space-between;align-items:center;font-size:.83em;color:var(--secondary-text-color)}
.slbl-s{font-size:.83em;color:var(--secondary-text-color)}
.sv{color:var(--primary-color,#03a9f4);font-weight:700}

/* ── Range slider ── */
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:5px;border-radius:3px;outline:none;cursor:pointer;background:linear-gradient(to right,var(--primary-color,#03a9f4) var(--v,50%),rgba(255,255,255,.1) var(--v,50%))}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#fff;border:2.5px solid var(--primary-color,#03a9f4);box-shadow:0 1px 5px rgba(0,0,0,.5);cursor:grab;transition:transform .1s,box-shadow .1s}
input[type=range]::-webkit-slider-thumb:active{transform:scale(1.3);cursor:grabbing;box-shadow:0 0 0 6px rgba(3,169,244,.2)}
input[type=range]::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:#fff;border:2.5px solid var(--primary-color,#03a9f4);box-shadow:0 1px 5px rgba(0,0,0,.5);cursor:grab}

/* ── Time input ── */
.tinput{background:var(--card-background-color,rgba(0,0,0,.3));border:1px solid var(--divider-color,rgba(255,255,255,.1));border-radius:10px;color:var(--primary-text-color);padding:8px 12px;font-size:.88em;width:120px;box-sizing:border-box}
.tinput:focus{outline:none;border-color:var(--primary-color,#03a9f4);box-shadow:0 0 0 3px rgba(3,169,244,.15)}

/* ── Mode grid ── */
.mgrid{display:flex;flex-wrap:wrap;gap:6px}
.mbtn{flex:1 1 auto;padding:7px 10px;border-radius:10px;background:var(--card-background-color,rgba(0,0,0,.2));border:1px solid var(--divider-color,rgba(255,255,255,.1));color:var(--secondary-text-color);font-size:.78em;cursor:pointer;text-align:center;white-space:nowrap;transition:all .2s}
.mbtn:hover{border-color:var(--primary-color,#03a9f4);color:var(--primary-text-color)}
.mbtn.a{background:var(--primary-color,#03a9f4);border-color:transparent;color:#fff;font-weight:700;box-shadow:0 2px 10px rgba(3,169,244,.35)}

/* ── Status / info cards ── */
.info-card{display:flex;align-items:center;gap:8px;padding:9px 13px;border-radius:12px;font-size:.83em;font-weight:600;border:1px solid transparent;transition:all .3s}
.info-card.running{background:rgba(76,175,80,.12);border-color:rgba(76,175,80,.3);color:var(--primary-text-color)}
.info-card.standby{background:var(--secondary-background-color,rgba(255,255,255,.05));border-color:var(--divider-color,rgba(255,255,255,.08));color:var(--secondary-text-color)}
.ic-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.info-card.running .ic-dot{background:#4caf50;box-shadow:0 0 6px #4caf50;animation:pulse 1.5s infinite}
.info-card.standby .ic-dot{background:var(--disabled-text-color,#555)}
.warn-tag{background:rgba(244,67,54,.2);color:#f44336;border-radius:6px;padding:1px 6px;font-size:.85em;margin-left:4px;font-weight:700}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

/* ── Activate button ── */
.abtn-row{display:flex;gap:8px;width:100%}
.abtn{flex:1;padding:12px;border-radius:14px;background:transparent;border:1.5px solid var(--divider-color,rgba(255,255,255,.12));color:var(--secondary-text-color);font-size:.88em;font-weight:700;cursor:pointer;letter-spacing:.5px;transition:all .2s}
.abtn:hover{border-color:var(--primary-color,#03a9f4);color:var(--primary-color,#03a9f4)}
.abtn.a{background:rgba(3,169,244,.12);border-color:var(--primary-color,#03a9f4);color:var(--primary-color,#03a9f4);box-shadow:0 0 0 3px rgba(3,169,244,.1)}
.off-btn{flex:0 0 auto;border-color:rgba(244,67,54,.3);color:#f44336}
.off-btn:hover{border-color:#f44336;background:rgba(244,67,54,.1);color:#f44336}

/* ── Divider ── */
.divider{height:1px;background:var(--divider-color,rgba(255,255,255,.08));margin:18px 0}

/* ── Humidifier section ── */
.hum-section{display:flex;flex-direction:column;align-items:center;gap:0}
.hum-section .toprow{width:100%;margin-bottom:8px}
.hum-chips{display:flex;gap:8px;margin-bottom:2px;width:100%}
.hum-chips .chip{justify-content:center}
.hum-section .dial-wrap{margin:0}
.hum-arc{stroke:var(--primary-color,#03a9f4)}
.hum-thumb{fill:#fff;stroke:var(--primary-color,#03a9f4);stroke-width:3;filter:drop-shadow(0 2px 8px rgba(0,0,0,.7))}
.hum-lbl-title{font-size:13px;font-weight:600;fill:var(--primary-color,#03a9f4);text-anchor:middle;dominant-baseline:middle}
.hum-btn-row{display:flex;justify-content:center;gap:16px;margin:0 0 4px}
.hum-step-btn{width:40px;height:40px;border-radius:50%;border:1.5px solid var(--divider-color,rgba(255,255,255,.15));background:transparent;color:var(--primary-text-color);font-size:1.3em;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s}
.hum-step-btn:hover{border-color:var(--primary-color,#03a9f4);color:var(--primary-color,#03a9f4)}
.hum-step-btn:active{background:rgba(3,169,244,.1)}

/* ── Light section ── */
.light-section{display:flex;flex-direction:column;gap:0}
.light-section .toprow{width:100%;margin-bottom:8px}
.light-tabbar{margin-bottom:14px}
.light-arc{stroke:#ffb300}
.light-thumb{fill:#fff;stroke:#ffb300;stroke-width:3;filter:drop-shadow(0 2px 8px rgba(0,0,0,.7))}

/* ── Circ section ── */
.circ-section{display:flex;flex-direction:column;gap:0}
.circ-section .toprow{width:100%;margin-bottom:8px}
.circ-tabbar{margin-bottom:14px}
.circ-arc{stroke:#4caf50}
.circ-thumb{fill:#fff;stroke:#4caf50;stroke-width:3;filter:drop-shadow(0 2px 8px rgba(0,0,0,.7))}
`; }
}

customElements.define(TAG, BlowerControlCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: TAG, name: 'Blower Control Card', description: 'Grow tent fan controller', preview: false });
