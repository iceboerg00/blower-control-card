import { useEffect, useRef, useState, useCallback } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useHassStore } from '../../ha/hassStore';
import { useEntity } from '../../ha/useEntity';
import { Dial } from '../../components/Dial';
import { ModeTab } from '../../components/ModeTab';
import { InfoCard } from '../../components/InfoCard';
import { isInWindow } from '../../engines/scheduleEngine';
import { evalCycle } from '../../engines/cycleEngine';
import { evalEnv } from '../../engines/envEngine';
import { nowMin, toMin, fmtMs } from '../../utils/time';
import type { FanActiveMode } from '../../store/types';

const MIN_SPEED = 25, MAX_SPEED = 100;
const CMD_GUARD_MS = 3000;
const THROTTLE_MS = 300;
const COLOR = '#03a9f4';

const MODES = [
  { id: 'off',         label: 'Aus' },
  { id: 'manual',      label: 'Manuell' },
  { id: 'zeitfenster', label: 'Zeitfenster' },
  { id: 'zyklus',      label: 'Zyklus' },
  { id: 'umwelt',      label: 'Umwelt' },
];

export function Blower() {
  const settings     = useSettingsStore((s) => s.settings);
  const updateBlower = useSettingsStore((s) => s.updateBlower);
  const blower       = settings.blower;
  const entities     = settings.entities;

  const fanEntity  = useEntity(entities.blower);
  const tempEntity = useEntity(entities.temp);
  const humEntity  = useEntity(entities.humidity);

  const [umweltActive, setUmweltActive] = useState(false);
  const [dialDrag, setDialDrag] = useState<number | null>(null);
  const cmdGuardUntil = useRef(0);
  const lastCmdMs     = useRef(0);

  const sendFan = useCallback((pct: number) => {
    if (Date.now() < cmdGuardUntil.current) return;
    if (Date.now() - lastCmdMs.current < THROTTLE_MS) return;
    lastCmdMs.current = Date.now();
    cmdGuardUntil.current = Date.now() + CMD_GUARD_MS;
    const hass = useHassStore.getState().hass;
    if (!hass) return;
    const eid = useSettingsStore.getState().settings.entities.blower;
    if (pct <= 0) {
      hass.callService('fan', 'turn_off', { entity_id: eid }).catch(console.error);
    } else {
      hass.callService('fan', 'turn_on', { entity_id: eid, percentage: Math.round(pct) }).catch(console.error);
    }
  }, []);

  const evaluate = useCallback(() => {
    const { settings: s } = useSettingsStore.getState();
    const b = s.blower;
    if (s.cardDisabled) return;

    if (b.autoOffUntil && Date.now() >= b.autoOffUntil) {
      updateBlower({ activeMode: 'off', autoOffUntil: null, manual: { ...b.manual, on: false } });
      sendFan(0);
      return;
    }
    if (b.activeMode === 'off') return;

    const nm = nowMin();
    switch (b.activeMode) {
      case 'manual':
        if (b.manual.on) sendFan(b.manual.speed);
        break;
      case 'zeitfenster': {
        const { start, end, speed, standby } = b.zeitfenster;
        sendFan(isInWindow(nm, toMin(start), toMin(end)) ? speed : standby);
        break;
      }
      case 'zyklus': {
        const result = evalCycle(b.zyklus, Date.now(), nm);
        if (result.nextState) {
          updateBlower({ zyklus: { ...b.zyklus, _state: result.nextState } });
        }
        sendFan(result.speed);
        break;
      }
      case 'umwelt': {
        const hass = useHassStore.getState().hass;
        const t = parseFloat(hass?.states[s.entities.temp]?.state ?? 'NaN');
        const h = parseFloat(hass?.states[s.entities.humidity]?.state ?? 'NaN');
        const v = s.entities.vpd ? parseFloat(hass?.states[s.entities.vpd]?.state ?? 'NaN') : null;
        setUmweltActive((prev) => {
          const active = evalEnv(b.umwelt, { temp: t, humidity: h, vpd: v }, prev);
          sendFan(active ? b.umwelt.speed : b.umwelt.standby);
          return active;
        });
        break;
      }
    }
  }, [sendFan, updateBlower]);

  useEffect(() => {
    evaluate();
    const id = setInterval(evaluate, 10_000);
    return () => clearInterval(id);
  }, [evaluate]);

  // Re-assertion: manual ON but fan is off → fight back (max 10x, 3s cooldown)
  const assertAttempts = useRef(0);
  const lastAssertMs   = useRef(0);
  useEffect(() => {
    if (blower.activeMode !== 'manual' || !blower.manual.on) { assertAttempts.current = 0; return; }
    if (fanEntity?.state !== 'off') { assertAttempts.current = 0; return; }
    if (assertAttempts.current >= 10) return;
    if (Date.now() - lastAssertMs.current < 3000) return;
    assertAttempts.current++;
    lastAssertMs.current = Date.now();
    cmdGuardUntil.current = 0;
    sendFan(blower.manual.speed);
  }, [fanEntity?.state, blower.activeMode, blower.manual.on, blower.manual.speed, sendFan]);

  function handleModeChange(mode: string) {
    updateBlower({ activeMode: mode as FanActiveMode });
    if (mode === 'off') { cmdGuardUntil.current = 0; sendFan(0); }
  }

  function handleToggle() {
    const newOn = !blower.manual.on;
    updateBlower({ manual: { ...blower.manual, on: newOn } });
    cmdGuardUntil.current = 0;
    if (newOn) { sendFan(blower.manual.speed); }
    else { sendFan(0); updateBlower({ autoOffUntil: null }); }
  }

  function handleDrag(v: number) { setDialDrag(Math.max(MIN_SPEED, Math.min(MAX_SPEED, v))); }
  function handleDragEnd(v: number) {
    const c = Math.max(MIN_SPEED, Math.min(MAX_SPEED, v));
    setDialDrag(null);
    updateBlower({ manual: { ...blower.manual, speed: c } });
    cmdGuardUntil.current = 0;
    sendFan(c);
  }

  const isOn  = fanEntity?.state === 'on';
  const haPct = Number(fanEntity?.attributes?.percentage ?? 0);
  const dialVal = dialDrag ?? blower.manual.speed;

  function statusText(): { running: boolean; text: string } {
    const nm = nowMin();
    switch (blower.activeMode) {
      case 'off': return { running: false, text: 'Abluft aus' };
      case 'manual': {
        const base = blower.manual.on ? `AN · ${haPct}%` : 'AUS';
        if (blower.autoOffUntil) {
          const rem = blower.autoOffUntil - Date.now();
          if (rem > 0) return { running: blower.manual.on, text: `${base} · Aus in ${fmtMs(rem)}` };
        }
        return { running: blower.manual.on, text: base };
      }
      case 'zeitfenster': {
        const { start, end, speed, standby } = blower.zeitfenster;
        const inW = isInWindow(nm, toMin(start), toMin(end));
        return { running: inW, text: inW ? `Im Zeitfenster · ${speed}%` : `Standby · ${standby}%` };
      }
      case 'zyklus': {
        const st = blower.zyklus._state;
        const max = blower.zyklus.repetitions === 0 ? '∞' : blower.zyklus.repetitions;
        if (st.phase === 'run') {
          const left = Math.max(0, blower.zyklus.runtime * 60_000 - (Date.now() - (st.since ?? 0)));
          return { running: true, text: `Läuft · ${st.count + 1}/${max} · ${fmtMs(left)} übrig` };
        }
        if (st.phase === 'pause') {
          const left = Math.max(0, blower.zyklus.pause * 60_000 - (Date.now() - (st.since ?? 0)));
          return { running: false, text: `Pause · ${st.count}/${max} · weiter in ${fmtMs(left)}` };
        }
        return { running: false, text: `Wartet auf ${blower.zyklus.start}` };
      }
      case 'umwelt': {
        const t = parseFloat(tempEntity?.state ?? 'NaN');
        const h = parseFloat(humEntity?.state ?? 'NaN');
        const parts: string[] = [];
        if (!isNaN(t)) parts.push(`${t.toFixed(1)}°C`);
        if (!isNaN(h)) parts.push(`${Math.round(h)}%`);
        const env = parts.join(' · ');
        return { running: umweltActive, text: umweltActive ? `Aktiv · ${blower.umwelt.speed}% · ${env}` : `Standby · ${blower.umwelt.standby}% · ${env}` };
      }
    }
  }

  const status = statusText();

  return (
    <section style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: COLOR }}>Abluft</span>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: isOn ? '#4caf50' : '#666', display: 'inline-block' }} />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{isOn ? `AN · ${haPct}%` : 'AUS'}</span>
      </div>

      <ModeTab tabs={MODES} active={blower.activeMode} onChange={handleModeChange} />
      <InfoCard running={status.running} text={status.text} />

      {blower.activeMode === 'manual' && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Dial value={dialVal} min={MIN_SPEED} max={MAX_SPEED} color={COLOR} onChange={handleDrag} onChangeEnd={handleDragEnd} />
          <button onClick={handleToggle} style={{
            width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
            background: blower.manual.on ? COLOR : 'rgba(255,255,255,0.1)',
            color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}>
            {blower.manual.on ? '⏻  Ausschalten' : '⏻  Einschalten'}
          </button>
        </div>
      )}

      {blower.activeMode === 'zeitfenster' && (
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          <TimeInput label="Start" value={blower.zeitfenster.start} onChange={(v) => updateBlower({ zeitfenster: { ...blower.zeitfenster, start: v } })} />
          <TimeInput label="Ende" value={blower.zeitfenster.end} onChange={(v) => updateBlower({ zeitfenster: { ...blower.zeitfenster, end: v } })} />
          <SliderRow label="Geschwindigkeit" unit="%" value={blower.zeitfenster.speed} min={MIN_SPEED} max={MAX_SPEED} color={COLOR} onChange={(v) => updateBlower({ zeitfenster: { ...blower.zeitfenster, speed: v } })} />
          <SliderRow label="Standby" unit="%" value={blower.zeitfenster.standby} min={0} max={MIN_SPEED} color={COLOR} onChange={(v) => updateBlower({ zeitfenster: { ...blower.zeitfenster, standby: v } })} />
        </div>
      )}

      {blower.activeMode === 'zyklus' && (
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          <TimeInput label="Erster Start" value={blower.zyklus.start} onChange={(v) => updateBlower({ zyklus: { ...blower.zyklus, start: v } })} />
          <SliderRow label="Laufzeit" unit=" min" value={blower.zyklus.runtime} min={1} max={120} color={COLOR} onChange={(v) => updateBlower({ zyklus: { ...blower.zyklus, runtime: v } })} />
          <SliderRow label="Pause" unit=" min" value={blower.zyklus.pause} min={1} max={120} color={COLOR} onChange={(v) => updateBlower({ zyklus: { ...blower.zyklus, pause: v } })} />
          <SliderRow label="Wiederholungen (0=∞)" unit="" value={blower.zyklus.repetitions} min={0} max={20} color={COLOR} onChange={(v) => updateBlower({ zyklus: { ...blower.zyklus, repetitions: v } })} />
          <SliderRow label="Geschwindigkeit" unit="%" value={blower.zyklus.speed} min={MIN_SPEED} max={MAX_SPEED} color={COLOR} onChange={(v) => updateBlower({ zyklus: { ...blower.zyklus, speed: v } })} />
          <SliderRow label="Standby" unit="%" value={blower.zyklus.standby} min={0} max={MIN_SPEED} color={COLOR} onChange={(v) => updateBlower({ zyklus: { ...blower.zyklus, standby: v } })} />
        </div>
      )}

      {blower.activeMode === 'umwelt' && (
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          <CheckRow label="Temperatur" checked={blower.umwelt.useTemp} onChange={(v) => updateBlower({ umwelt: { ...blower.umwelt, useTemp: v } })} />
          {blower.umwelt.useTemp && (
            <SliderRow label={`Max. Temp · ${blower.umwelt.maxTemp}°C`} unit="°C" value={blower.umwelt.maxTemp} min={18} max={40} step={0.5} color={COLOR} onChange={(v) => updateBlower({ umwelt: { ...blower.umwelt, maxTemp: v } })} />
          )}
          <CheckRow label="Luftfeuchtigkeit" checked={blower.umwelt.useHum} onChange={(v) => updateBlower({ umwelt: { ...blower.umwelt, useHum: v } })} />
          {blower.umwelt.useHum && (
            <SliderRow label={`Max. LF · ${blower.umwelt.maxHum}%`} unit="%" value={blower.umwelt.maxHum} min={30} max={95} color={COLOR} onChange={(v) => updateBlower({ umwelt: { ...blower.umwelt, maxHum: v } })} />
          )}
          <SliderRow label={`Hysterese · ${blower.umwelt.hysteresis}`} unit="" value={blower.umwelt.hysteresis} min={0} max={5} step={0.1} color={COLOR} onChange={(v) => updateBlower({ umwelt: { ...blower.umwelt, hysteresis: v } })} />
          <SliderRow label="Geschwindigkeit" unit="%" value={blower.umwelt.speed} min={MIN_SPEED} max={MAX_SPEED} color={COLOR} onChange={(v) => updateBlower({ umwelt: { ...blower.umwelt, speed: v } })} />
          <SliderRow label="Standby" unit="%" value={blower.umwelt.standby} min={0} max={MIN_SPEED} color={COLOR} onChange={(v) => updateBlower({ umwelt: { ...blower.umwelt, standby: v } })} />
        </div>
      )}
    </section>
  );
}

// ── Shared input helpers ───────────────────────────────────────────────────

export function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
      {label}
      <input type="time" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, color: '#f5f5f5', padding: '4px 8px', fontSize: 14 }} />
    </label>
  );
}

interface SliderRowProps {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  color: string;
  onChange: (v: number) => void;
}

export function SliderRow({ label, unit, value, min, max, step = 1, color, onChange }: SliderRowProps) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span style={{ color: '#f5f5f5', fontWeight: 600 }}>{value}{unit}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: color }} />
    </label>
  );
}

export function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
