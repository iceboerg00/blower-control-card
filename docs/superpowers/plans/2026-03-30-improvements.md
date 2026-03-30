# blower-control-card Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 10 improvements (4 bug fixes, 3 UX enhancements, 3 new features) to `blower-control-card.js`.

**Architecture:** Single-file vanilla JS Web Component. All changes are in `blower-control-card.js`. No build step — copy to HA `www/` and hard-refresh to test.

**Tech Stack:** Vanilla JS, Web Components, SVG, localStorage, Home Assistant Lovelace API

---

## File Map

| File | Changes |
|------|---------|
| `blower-control-card.js` | All changes — see tasks below |

No new files. No test suite — each task includes manual verification steps.

---

## Task 1: BUG-1 — Fix Zyklus start-time midnight edge case

**Files:**
- Modify: `blower-control-card.js` (lines 2110, 1853)

The check `n >= sm && n < sm + 2` fails when `sm = 1439` (23:59) because `sm + 2 = 1441` exceeds 1440 minutes/day. Fix both `_evC()` and `_evCircC()`.

- [ ] **Step 1: Fix `_evC()` (line 2110)**

Replace:
```js
if (n >= sm && n < sm + 2) {
```
With:
```js
if ((n - sm + 1440) % 1440 < 2) {
```

- [ ] **Step 2: Fix `_evCircC()` (line 1853)**

Replace:
```js
if (n >= sm && n < sm + 2) {
```
With:
```js
if ((n - sm + 1440) % 1440 < 2) {
```

- [ ] **Step 3: Also snap circ.manual.speed on load (BUG-2 mitigation)**

In `_loadSettings()`, after the migration block (line ~322), add:
```js
// Ensure circ speed is always snapped to 10
if (this._settings.circ?.manual?.speed != null) {
  this._settings.circ.manual.speed = snap10(clamp(Math.round(this._settings.circ.manual.speed), 10, 100));
}
```

- [ ] **Step 4: Verify**

In HA Developer Tools → States, set a virtual sensor to trigger a cycle run. Check console for `[BCC] cycle → run` at the configured start time. Confirm it fires. Also set `zyklus.start` to `23:59` in settings and verify no 23:59 edge bug in console.

- [ ] **Step 5: Commit**
```bash
git add blower-control-card.js
git commit -m "fix: zyklus midnight edge case, snap circ speed on load"
```

---

## Task 2: BUG-3 — Fix humidifier dial showing 60% before HA sync

**Files:**
- Modify: `blower-control-card.js` (lines ~89, ~144)

`_humTarget` is initialized to `60` in the constructor. The real value comes from HA via `_syncHumidifier()`. Fix: sync `_humTarget` from HA before the first render when `hass` is already available.

- [ ] **Step 1: Add early humidifier sync in `set hass(h)` before first render**

In `set hass(h)` (around line 145), the existing code is:
```js
if (!this._rendered) { this._loadSettings(); this._render(); }
```

Replace with:
```js
if (!this._rendered) {
  this._loadSettings();
  // Pre-sync humidifier target so first render shows correct value
  const humSt = h.states[this._humidifier];
  const target = humSt?.attributes?.humidity;
  if (target != null) this._humTarget = Math.round(target);
  this._render();
}
```

- [ ] **Step 2: Verify**

Reload HA dashboard. Humidifier dial should immediately show the HA target value (e.g. 65%) instead of 60%.

- [ ] **Step 3: Commit**
```bash
git add blower-control-card.js
git commit -m "fix: humidifier dial init from HA state before first render"
```

---

## Task 3: BUG-4 + FEAT-1 — Hysteresis: data model, logic, UI

**Files:**
- Modify: `blower-control-card.js` (lines ~285–323, ~636–643, ~2155–2163, ~1891–1904, ~607–634, ~1538–1566, ~703–713, ~1637–1646, ~909–920, ~1946–1970)

Add hysteresis support to Umwelt mode for both blower and circ fan.

- [ ] **Step 1: Add `hysteresis` to `_def()` defaults**

In `_def()` (line ~295), change:
```js
umwelt: { mode: 'both', maxTemp: 28, maxHum: 70, speed: 100, standby: 25 },
```
To:
```js
umwelt: { mode: 'both', maxTemp: 28, maxHum: 70, speed: 100, standby: 25, hysteresis: 1.0 },
```

And in the circ section (line ~309), change:
```js
umwelt: { mode: 'both', maxTemp: 28, maxHum: 70, speed: 100, standby: 0 }
```
To:
```js
umwelt: { mode: 'both', maxTemp: 28, maxHum: 70, speed: 100, standby: 0, hysteresis: 1.0 }
```

- [ ] **Step 2: Add instance variable for hysteresis state**

In the constructor (after line ~108, in the circ section), add:
```js
this._umweltActive = false;   // hysteresis state for blower umwelt
this._circUmweltActive = false; // hysteresis state for circ umwelt
```

- [ ] **Step 3: Add hysteresis row to `_tUmwelt()` HTML**

In `_tUmwelt()`, make the Grenzwerte section:
```js
<div class="sec"><div class="seclbl">Grenzwerte</div>
  ${this._row('um-temp', 'Max Temperatur', 15, 40, .5, u.maxTemp, v => v + '°C')}
  ${this._row('um-hum', 'Max Luftfeuchte', 30, 100, 1, u.maxHum, v => v + '%')}
  ${this._row('um-hyst', 'Hysterese', 0.5, 5, 0.5, u.hysteresis, v => v + '°C/%')}
</div>
```

- [ ] **Step 4: Add hysteresis row to `_tCircUmwelt()` HTML**

In `_tCircUmwelt()`, in the Umwelt-Schwellen section after `cf-hum`:
```js
${this._row('cf-hyst', 'Hysterese', 0.5, 5, 0.5, u.hysteresis, v => v + '°C/%')}
```

- [ ] **Step 5: Bind hysteresis slider in `_bindTab()` umwelt section**

After `this._orange(r, '#um-hum', v => s.umwelt.maxHum = v, v => v + '%', sig);`, add:
```js
this._orange(r, '#um-hyst', v => s.umwelt.hysteresis = v, v => v + '°C/%', sig);
```

- [ ] **Step 6: Bind hysteresis slider in `_bindCircTab()` umwelt section**

After `this._orange(r, '#cf-hum', v => cs.umwelt.maxHum = v, v => v + '%', sig);`, add:
```js
this._orange(r, '#cf-hyst', v => cs.umwelt.hysteresis = v, v => v + '°C/%', sig);
```

- [ ] **Step 7: Verify**

Open Umwelt tab. Confirm hysteresis slider shows with value 1.0°C/%. Drag to 2.0 — value saves and persists after tab switch. (Behavioral hysteresis test is in Task 4.)

- [ ] **Step 8: Commit**
```bash
git add blower-control-card.js
git commit -m "feat: hysteresis UI slider for umwelt mode (logic in next task)"
```

---

## Task 4: FEAT-2 — VPD as Umwelt trigger

**Files:**
- Modify: `blower-control-card.js`

Add VPD as a third optional trigger condition in Umwelt mode, replacing the 3-button mode selector with 3 independent checkboxes.

- [ ] **Step 1: Update `_def()` — add VPD fields, keep `mode` for migration**

In `_def()`, change the umwelt object for blower:
```js
umwelt: { mode: 'both', useTemp: true, useHum: false, useVpd: false, maxTemp: 28, maxHum: 70, maxVpd: 1.2, speed: 100, standby: 25, hysteresis: 1.0 },
```

And for circ:
```js
umwelt: { mode: 'both', useTemp: true, useHum: false, useVpd: false, maxTemp: 28, maxHum: 70, maxVpd: 1.2, speed: 100, standby: 0, hysteresis: 1.0 }
```

- [ ] **Step 2: Add migration in `_loadSettings()` for `mode` → `useTemp`/`useHum`**

In `_loadSettings()`, after the existing migration block (line ~319–322), add:
```js
// Migrate old umwelt.mode → useTemp/useHum
const migrateUmwelt = (u) => {
  if (u && u.mode !== undefined && u.useTemp === undefined) {
    u.useTemp = u.mode !== 'only_hum';
    u.useHum  = u.mode !== 'only_temp';
    delete u.mode;
  }
};
migrateUmwelt(this._settings.umwelt);
migrateUmwelt(this._settings.circ?.umwelt);
```

- [ ] **Step 3: Update `_shouldRun()` to use new flags**

Replace `_shouldRun()` entirely (lines ~636–643):
```js
_shouldRun(u, tO, hO, vO = false) {
  return (u.useTemp && tO) || (u.useHum && hO) || (u.useVpd && vO);
}
```

- [ ] **Step 4: Update `_evU()` to include VPD**

Replace the `_evU()` method written in Task 3 with:
```js
_evU() {
  const u = this._settings.umwelt;
  const ts = this._hass.states[this._tempE];
  const hs = this._hass.states[this._humE];
  const vs = this._vpdE ? this._hass.states[this._vpdE] : null;
  const t = ts ? parseFloat(ts.state) : null;
  const h = hs ? parseFloat(hs.state) : null;
  const v = vs ? parseFloat(vs.state) : null;
  const tOver = u.useTemp && t !== null && !isNaN(t) && t > u.maxTemp;
  const hOver = u.useHum  && h !== null && !isNaN(h) && h > u.maxHum;
  const vOver = u.useVpd  && v !== null && !isNaN(v) && v > u.maxVpd;
  const tUnder = !u.useTemp || t === null || isNaN(t) || t < u.maxTemp - u.hysteresis;
  const hUnder = !u.useHum  || h === null || isNaN(h) || h < u.maxHum - u.hysteresis;
  const vUnder = !u.useVpd  || v === null || isNaN(v) || v < u.maxVpd - u.hysteresis;
  if (tOver || hOver || vOver) this._umweltActive = true;
  if (tUnder && hUnder && vUnder) this._umweltActive = false;
  this._setFan(this._umweltActive ? u.speed : u.standby, 'evU');
}
```

- [ ] **Step 5: Update `_evCircU()` to include VPD**

Replace `_evCircU()` (from Task 3) with:
```js
_evCircU() {
  const u = this._settings.circ.umwelt;
  const ts = this._hass.states[this._tempE];
  const hs = this._hass.states[this._humE];
  const vs = this._vpdE ? this._hass.states[this._vpdE] : null;
  const t = ts ? parseFloat(ts.state) : null;
  const h = hs ? parseFloat(hs.state) : null;
  const v = vs ? parseFloat(vs.state) : null;
  const tOver = u.useTemp && t !== null && !isNaN(t) && t > u.maxTemp;
  const hOver = u.useHum  && h !== null && !isNaN(h) && h > u.maxHum;
  const vOver = u.useVpd  && v !== null && !isNaN(v) && v > u.maxVpd;
  const tUnder = !u.useTemp || t === null || isNaN(t) || t < u.maxTemp - u.hysteresis;
  const hUnder = !u.useHum  || h === null || isNaN(h) || h < u.maxHum - u.hysteresis;
  const vUnder = !u.useVpd  || v === null || isNaN(v) || v < u.maxVpd - u.hysteresis;
  if (tOver || hOver || vOver) this._circUmweltActive = true;
  if (tUnder && hUnder && vUnder) this._circUmweltActive = false;
  this._setCircFan(this._circUmweltActive ? u.speed : u.standby, 'evCircU');
}
```

- [ ] **Step 6: Replace mode buttons with checkboxes in `_tUmwelt()`**

In `_tUmwelt()`, replace the `Betriebsmodus` section:

Old:
```js
<div class="sec"><div class="seclbl">Betriebsmodus</div>
  <div class="mgrid">${M.map(([v, l]) => `<button class="mbtn${u.mode === v ? ' a' : ''}" data-mode="${v}">${l}</button>`).join('')}</div>
</div>
```

New (add after statusHtml, before Grenzwerte section):
```js
<div class="sec"><div class="seclbl">Auslöser</div>
  <label class="chk-row"><input type="checkbox" id="um-useTemp" ${u.useTemp ? 'checked' : ''}> Temperatur</label>
  <label class="chk-row"><input type="checkbox" id="um-useHum" ${u.useHum ? 'checked' : ''}> Luftfeuchte</label>
  <label class="chk-row"><input type="checkbox" id="um-useVpd" ${u.useVpd ? 'checked' : ''}> VPD</label>
</div>
```

Also remove the `const M = [...]` line from the top of `_tUmwelt()` as it's no longer needed.

- [ ] **Step 7: Replace mode buttons with checkboxes in `_tCircUmwelt()`**

In `_tCircUmwelt()`, remove the `Modus` section entirely and replace with:
```js
<div class="sec"><div class="seclbl">Auslöser</div>
  <label class="chk-row"><input type="checkbox" id="cf-useTemp" ${u.useTemp ? 'checked' : ''}> Temperatur</label>
  <label class="chk-row"><input type="checkbox" id="cf-useHum" ${u.useHum ? 'checked' : ''}> Luftfeuchte</label>
  <label class="chk-row"><input type="checkbox" id="cf-useVpd" ${u.useVpd ? 'checked' : ''}> VPD</label>
</div>
```

- [ ] **Step 8: Add VPD threshold row to `_tUmwelt()` and `_tCircUmwelt()`**

In `_tUmwelt()`, in the Grenzwerte section after `um-hum`:
```js
${u.useVpd ? this._row('um-vpd', 'Max VPD', 0.5, 2.5, 0.1, u.maxVpd, v => v.toFixed(1) + ' kPa') : ''}
```

In `_tCircUmwelt()`, in the Umwelt-Schwellen section after `cf-hum`:
```js
${u.useVpd ? this._row('cf-vpd', 'Max VPD', 0.5, 2.5, 0.1, u.maxVpd, v => v.toFixed(1) + ' kPa') : ''}
```

- [ ] **Step 9: Bind checkboxes and VPD input in `_bindTab()` umwelt section**

In `_bindTab()`, replace the existing `[data-mode]` listener block with:
```js
const cb = (id, key) => {
  const el = r.querySelector(`#${id}`);
  if (el) el.addEventListener('change', () => {
    s.umwelt[key] = el.checked;
    this._save();
    // Re-render tab to show/hide VPD threshold row
    this.shadowRoot.querySelector('#body').innerHTML = this._renderTab('umwelt');
    this._bindTab();
  }, sig);
};
cb('um-useTemp', 'useTemp');
cb('um-useHum', 'useHum');
cb('um-useVpd', 'useVpd');
this._orange(r, '#um-vpd', v => s.umwelt.maxVpd = v, v => v.toFixed(1) + ' kPa', sig);
```

Also remove the old `r.querySelectorAll('[data-mode]')` listener.

- [ ] **Step 10: Bind checkboxes in `_bindCircTab()` umwelt section**

In `_bindCircTab()`, replace the `[data-cenv]` listener block with:
```js
const cb = (id, key) => {
  const el = r.querySelector(`#${id}`);
  if (el) el.addEventListener('change', () => {
    cs.umwelt[key] = el.checked;
    this._save();
    r.querySelector('#circ-body').innerHTML = this._renderCircTab('umwelt');
    this._bindCircTab();
  }, sig);
};
cb('cf-useTemp', 'useTemp');
cb('cf-useHum', 'useHum');
cb('cf-useVpd', 'useVpd');
this._orange(r, '#cf-vpd', v => cs.umwelt.maxVpd = v, v => v.toFixed(1) + ' kPa', sig);
```

- [ ] **Step 11: Update `_updateUmweltStatus()` to show VPD warning**

In `_updateUmweltStatus()` (line ~909), update the triggered/warning display:
```js
_updateUmweltStatus() {
  const r = this.shadowRoot;
  const ui = r.querySelector('#umwelt-info');
  if (!ui || !this._hass) return;
  const u = this._settings.umwelt;
  const ts = this._hass.states[this._tempE], hs = this._hass.states[this._humE];
  const vs = this._vpdE ? this._hass.states[this._vpdE] : null;
  const temp = parseFloat(ts?.state), hum = parseFloat(hs?.state);
  const vpd = vs ? parseFloat(vs.state) : NaN;
  const tO = u.useTemp && !isNaN(temp) && temp > u.maxTemp;
  const hO = u.useHum  && !isNaN(hum)  && hum  > u.maxHum;
  const vO = u.useVpd  && !isNaN(vpd)  && vpd  > u.maxVpd;
  const triggered = this._umweltActive;
  ui.className = `info-card ${triggered ? 'running' : 'standby'}`;
  r.querySelector('#umwelt-text').innerHTML =
    `${triggered ? `Lüfter aktiv · ${u.speed}%` : `Standby · ${this._fs(u.standby)}`}` +
    `${tO ? ' <span class="warn-tag">⬆ Temp</span>' : ''}` +
    `${hO ? ' <span class="warn-tag">⬆ Feuchte</span>' : ''}` +
    `${vO ? ' <span class="warn-tag">⬆ VPD</span>' : ''}`;
}
```

- [ ] **Step 12: Update `_updateCircUmweltStatus()` to show VPD warning**

In `_updateCircUmweltStatus()` (line ~1946), update similarly:
```js
_updateCircUmweltStatus() {
  const r = this.shadowRoot;
  const ui = r.querySelector('#circ-umwelt-info');
  if (!ui) return;
  const u = this._settings.circ.umwelt;
  const tempSt = this._hass?.states[this._tempE];
  const humSt  = this._hass?.states[this._humE];
  const vpdSt  = this._vpdE ? this._hass?.states[this._vpdE] : null;
  const temp = tempSt ? parseFloat(tempSt.state) : null;
  const hum  = humSt  ? parseFloat(humSt.state)  : null;
  const vpd  = vpdSt  ? parseFloat(vpdSt.state)  : null;
  const tO = u.useTemp && temp !== null && !isNaN(temp) && temp > u.maxTemp;
  const hO = u.useHum  && hum  !== null && !isNaN(hum)  && hum  > u.maxHum;
  const vO = u.useVpd  && vpd  !== null && !isNaN(vpd)  && vpd  > u.maxVpd;
  const run = this._circUmweltActive;
  ui.className = `info-card ${run ? 'running' : 'standby'}`;
  const parts = [];
  if (temp !== null) parts.push(`${temp.toFixed(1)}°C${tO ? ' ⚠' : ''}`);
  if (hum  !== null) parts.push(`${Math.round(hum)}%${hO ? ' ⚠' : ''}`);
  if (vpd  !== null && u.useVpd) parts.push(`${vpd.toFixed(2)} kPa${vO ? ' ⚠' : ''}`);
  r.querySelector('#circ-umwelt-text').textContent = run
    ? `Aktiv · ${u.speed}% · ${parts.join(' · ')}`
    : `Standby · ${this._cfs(u.standby)} · ${parts.join(' · ')}`;
}
```

- [ ] **Step 13: Add CSS for checkbox rows**

In `_css()`, add:
```css
.chk-row{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:.9em;cursor:pointer}
.chk-row input{width:16px;height:16px;cursor:pointer}
```

- [ ] **Step 14: Verify**

Open Umwelt tab. Confirm three checkboxes (Temperatur, Luftfeuchte, VPD). Enable VPD → VPD threshold row appears. Set VPD above threshold → fan triggers. Check `warn-tag` labels appear.

- [ ] **Step 15: Commit**
```bash
git add blower-control-card.js
git commit -m "feat: VPD as umwelt trigger, replace mode buttons with checkboxes"
```

---

## Task 5: UX-2 — Fix Zyklus status display during pause

**Files:**
- Modify: `blower-control-card.js` (lines ~889–907, ~1927–1943)

During pause phase, show "Pause · X/Y" with the completed cycle count (not `st.count` which is 0-based and resets).

- [ ] **Step 1: Fix `_updateCycleStatus()` (line ~902–906)**

The pause branch currently shows `Zyklus ${st.count}/${max}` but `st.count` during pause holds the completed-run count (correct). The issue is it says "Zyklus" instead of "Pause". Change:
```js
} else {
  const rem = Math.max(0, z.pause * 60000 - (Date.now() - st.since));
  ci.className = 'info-card standby';
  r.querySelector('#cycle-text').innerHTML = `Pause · ${st.count}/${max} · weiter in ${fmtMin(rem)}`;
}
```

- [ ] **Step 2: Fix `_updateCircCycleStatus()` (line ~1936–1943)**

In the pause branch, also include count:
```js
} else if (st.phase === 'pause') {
  ci.className = 'info-card standby';
  const left = Math.max(0, z.pause * 60000 - (Date.now() - st.since));
  r.querySelector('#circ-cycle-text').textContent = `Pause · ${st.count}/${z.repetitions === 0 ? '∞' : z.repetitions} · ${fmtMin(left)} übrig`;
}
```

- [ ] **Step 3: Verify**

Set a cycle mode with 3 repetitions and short times. After first run completes, confirm status shows "Pause · 1/3 · X min übrig".

- [ ] **Step 4: Commit**
```bash
git add blower-control-card.js
git commit -m "fix: zyklus pause status shows completed count not zero"
```

---

## Task 6: UX-3 — Light ramp recovery button

**Files:**
- Modify: `blower-control-card.js` (lines ~2056–2074, ~1155–1180)

When `_lightRampOk === false`, show a warning + reset button in the schedule info card.

- [ ] **Step 1: Update `_updateLightSchedInfo()` to show ramp-interrupted state**

In `_updateLightSchedInfo()` (line ~2056), modify the `else` branch (currently just shows 'Licht aus') to also handle the interrupted state. Add a new case before the existing branches:

Replace the entire `_updateLightSchedInfo()` method:
```js
_updateLightSchedInfo(phase, pct) {
  const r = this.shadowRoot;
  const info = r.querySelector('#light-sched-info');
  const text = r.querySelector('#light-sched-text');
  if (!info || !text) return;

  // Show ramp-interrupted warning regardless of phase
  if (!this._lightRampOk) {
    info.className = 'info-card standby';
    text.innerHTML = `Rampe unterbrochen &nbsp;<button id="ramp-reset-btn" style="font-size:.8em;padding:2px 8px;cursor:pointer;border-radius:4px;border:1px solid #ffb300;background:transparent;color:#ffb300">Zurücksetzen</button>`;
    const btn = r.querySelector('#ramp-reset-btn');
    if (btn) btn.addEventListener('click', () => {
      this._lightRampOk = true;
      this._evalLight();
      this._updateLightStatus();
    });
    return;
  }

  if (phase === 'sunrise') {
    info.className = 'info-card running';
    text.textContent = `Sonnenaufgang · ${pct > 0 ? Math.max(11, pct) : 0}%`;
  } else if (phase === 'sunset') {
    info.className = 'info-card running';
    text.textContent = `Sonnenuntergang · ${pct > 0 ? Math.max(11, pct) : 0}%`;
  } else if (phase === 'on') {
    info.className = 'info-card running';
    text.textContent = `Licht an · ${pct}%`;
  } else {
    info.className = 'info-card standby';
    text.textContent = 'Licht aus';
  }
}
```

- [ ] **Step 2: Ensure `_updateLightStatus()` also passes through `_lightRampOk` state**

`_updateLightStatus()` (line ~2033) already calls `_updateLightSchedInfo()` at the end, so the new check will apply automatically. No extra change needed.

- [ ] **Step 3: Verify**

In HA, set the light to schedule mode. During active schedule window, manually turn the light off via HA. Confirm schedule info card shows "Rampe unterbrochen" with a yellow "Zurücksetzen" button. Click button — confirm ramp resumes and button disappears.

- [ ] **Step 4: Commit**
```bash
git add blower-control-card.js
git commit -m "fix: light ramp interrupted shows reset button in schedule info"
```

---

## Task 7: UX-1 — Command guard spinner in dial center

**Files:**
- Modify: `blower-control-card.js`

Show a small spinning arc in the dial center while a command guard is active (after sending a service call).

- [ ] **Step 1: Add CSS animation**

In `_css()`, find the `.pnum` rule and add after it:
```css
@keyframes bcc-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.dial-spinner{transform-origin:110px 110px;animation:bcc-spin 0.8s linear infinite;display:none}
.dial-spinner.visible{display:block}
```

- [ ] **Step 2: Add spinner SVG element to blower dial in `_tManual()`**

Inside the `<svg id="dial">` element, after the `<text class="punit">` line, add:
```js
<circle class="dial-spinner" id="dial-spinner" cx="110" cy="110" r="18" fill="none" stroke="#03a9f4" stroke-width="3" stroke-dasharray="36 77" stroke-linecap="round"/>
```

- [ ] **Step 3: Add spinner SVG element to circ dial in `_tCircManual()`**

Inside `<svg id="circ-dial">`, after `<text class="punit">`, add:
```js
<circle class="dial-spinner" id="circ-dial-spinner" cx="110" cy="110" r="18" fill="none" stroke="#4caf50" stroke-width="3" stroke-dasharray="36 77" stroke-linecap="round"/>
```

- [ ] **Step 4: Add spinner to humidifier dial in `_renderHumidifier()`**

Inside `<svg id="hum-dial">`, after the punit text, add:
```js
<circle class="dial-spinner" id="hum-dial-spinner" cx="110" cy="110" r="18" fill="none" stroke="#03a9f4" stroke-width="3" stroke-dasharray="36 77" stroke-linecap="round"/>
```

- [ ] **Step 5: Add spinner to light dial in `_tLightManual()`**

Inside the light dial SVG, after the punit text, add:
```js
<circle class="dial-spinner" id="light-dial-spinner" cx="110" cy="110" r="18" fill="none" stroke="#ffb300" stroke-width="3" stroke-dasharray="36 77" stroke-linecap="round"/>
```

- [ ] **Step 6: Add `_updateGuardSpinners()` helper method**

Add a new method after `_updateSensors()`:
```js
_updateGuardSpinners() {
  const r = this.shadowRoot;
  const now = Date.now();
  const show = (id, active) => {
    const el = r.querySelector(`#${id}`);
    if (el) el.classList.toggle('visible', active);
  };
  show('dial-spinner',       now < this._cmdGuardUntil);
  show('circ-dial-spinner',  now < this._circCmdGuard);
  show('hum-dial-spinner',   false); // humidifier uses throttle, no discrete guard
  show('light-dial-spinner', now < this._lightCmdGuard);
}
```

- [ ] **Step 7: Call `_updateGuardSpinners()` from `set hass(h)`**

At the bottom of `set hass(h)`, before the closing brace, add:
```js
this._updateGuardSpinners();
```

- [ ] **Step 8: Verify**

Click the toggle button on the blower. A small spinning arc should appear in the dial center for ~2 seconds, then disappear.

- [ ] **Step 9: Commit**
```bash
git add blower-control-card.js
git commit -m "feat: command guard spinner in dial center for all modules"
```

---

## Task 8: FEAT-3 — Auto-off timer for manual mode

**Files:**
- Modify: `blower-control-card.js`

Add a dropdown (Aus / 1h / 2h / 4h / 8h) to blower and circ manual tabs. When a duration is selected and the fan is on, set a timestamp. Check expiry in `_evaluate()`.

- [ ] **Step 1: Add `autoOffUntil` to `_def()`**

In `_def()`, add to the top level:
```js
autoOffUntil: null,
```
And in the `circ` object:
```js
circ: {
  ...
  autoOffUntil: null,
```

- [ ] **Step 2: Add auto-off dropdown to `_tManual()`**

In `_tManual()`, in the `mbtns` div after the activate button, add:
```js
<div class="srow" style="margin-top:8px">
  <div class="slbl"><span>Auto-Aus</span></div>
  <select id="auto-off-sel" class="cfg-input" style="width:auto;padding:4px 8px">
    <option value="0">Aus</option>
    <option value="1">1 Stunde</option>
    <option value="2">2 Stunden</option>
    <option value="4">4 Stunden</option>
    <option value="8">8 Stunden</option>
  </select>
</div>
```

- [ ] **Step 3: Add auto-off dropdown to `_tCircManual()`**

Same dropdown HTML but with id `circ-auto-off-sel`, inside the circ `mbtns` div.

- [ ] **Step 4: Add a helper to get current dropdown value and set it on render**

In `_bindTab()` manual section, after binding the toggle button, add:
```js
const sel = r.querySelector('#auto-off-sel');
if (sel) {
  // Restore current selection: find matching hour from saved timestamp
  const remaining = this._settings.autoOffUntil ? Math.ceil((this._settings.autoOffUntil - Date.now()) / 3600000) : 0;
  sel.value = '0'; // default to Aus (can't reliably restore exact option)
  sel.addEventListener('change', () => {
    const h = parseInt(sel.value);
    if (h === 0) {
      this._settings.autoOffUntil = null;
    } else {
      this._settings.autoOffUntil = Date.now() + h * 3600000;
    }
    this._save();
    this._updateStatus();
  }, sig);
}
```

- [ ] **Step 5: Same binding for circ in `_bindCircTab()`**

```js
const csel = r.querySelector('#circ-auto-off-sel');
if (csel) {
  csel.value = '0';
  csel.addEventListener('change', () => {
    const h = parseInt(csel.value);
    this._settings.circ.autoOffUntil = h === 0 ? null : Date.now() + h * 3600000;
    this._save();
    this._updateCircModeStatus();
  }, sig);
}
```

- [ ] **Step 6: Check auto-off expiry in `_evaluate()`**

At the top of `_evaluate()`, before the switch, add:
```js
// Auto-off timer check
if (this._settings.autoOffUntil && Date.now() >= this._settings.autoOffUntil) {
  this._settings.autoOffUntil = null;
  this._settings.manual.on = false;
  this._settings.activeMode = 'off';
  this._save();
  this._setFan(0, 'auto-off');
  this._updateStatus();
  this._updateModeStatus();
  return;
}
```

- [ ] **Step 7: Check auto-off expiry in `_evaluateCirc()`**

At the top of `_evaluateCirc()`, before the switch, add:
```js
if (this._settings.circ.autoOffUntil && Date.now() >= this._settings.circ.autoOffUntil) {
  this._settings.circ.autoOffUntil = null;
  this._settings.circ.manual.on = false;
  this._settings.circ.activeMode = 'off';
  this._save();
  this._setCircFan(0, 'circ-auto-off');
  this._updateCircModeStatus();
  return;
}
```

- [ ] **Step 8: Show countdown in `_updateStatus()` when auto-off is active**

Find `_updateStatus()` and locate where the manual status text is set. Add countdown display. In `_updateStatus()`, after setting the mode label for manual mode, add:
```js
// Auto-off countdown
if (this._settings.activeMode === 'manual' && this._settings.autoOffUntil) {
  const rem = this._settings.autoOffUntil - Date.now();
  if (rem > 0) {
    const h = Math.floor(rem / 3600000);
    const m = Math.floor((rem % 3600000) / 60000);
    const lblEl = r.querySelector('#slbl');
    if (lblEl) lblEl.textContent = `Aus in ${h > 0 ? h + 'h ' : ''}${m}min`;
  }
}
```

- [ ] **Step 9: Cancel auto-off when fan is manually turned off**

In `_toggleManual()`, after `s.manual.on = !s.manual.on;`, add:
```js
if (!s.manual.on) s.autoOffUntil = null;
```

In `_toggleCircManual()`, after `cs.manual.on = !cs.manual.on;`, add:
```js
if (!cs.manual.on) cs.autoOffUntil = null;
```

- [ ] **Step 10: Verify**

Turn fan on in manual mode. Select "1 Stunde" from dropdown. Status should show countdown "Aus in 0h 59min". Select "Aus" dropdown — countdown disappears. Manually turn off fan — `autoOffUntil` clears (check via Developer Tools → States or console).

- [ ] **Step 11: Commit**
```bash
git add blower-control-card.js
git commit -m "feat: auto-off timer dropdown for manual mode (blower + circ)"
```

---

## Task 9: BCC_VERSION bump and release

**Files:**
- Modify: `blower-control-card.js` (line 3)

- [ ] **Step 1: Bump version**

Change:
```js
const BCC_VERSION = 'v56';
```
To:
```js
const BCC_VERSION = 'v57';
```

- [ ] **Step 2: Final verify**

Copy `blower-control-card.js` to HA `www/`. Hard-refresh browser. Open card. Check:
- [ ] Version shows v57 in header
- [ ] Umwelt tab has checkboxes and hysteresis slider
- [ ] VPD checkbox shows threshold row when enabled
- [ ] Zyklus pause shows "Pause · 1/3" format
- [ ] Manual tab has Auto-Aus dropdown
- [ ] Spinners appear briefly after toggle clicks
- [ ] Light schedule interrupted state shows reset button

- [ ] **Step 3: Tag and release**
```bash
git add blower-control-card.js
git commit -m "chore: release v57.0.0 — hysteresis, VPD trigger, auto-off timer, UX fixes"
git tag v57.0.0
git push && git push --tags
```
