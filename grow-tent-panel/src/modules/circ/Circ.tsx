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
import { TimeInput, SliderRow, CheckRow } from '../blower/Blower';
import type { FanActiveMode } from '../../store/types';

// Circ can run at 0% (full stop), unlike blower which has 25% min
const MIN_SPEED = 0, MAX_SPEED = 100;
const CMD_GUARD_MS = 3000;
const THROTTLE_MS = 300;
const COLOR = '#4caf50';

const MODES = [
  { id: 'off',         label: 'Aus' },
  { id: 'manual',      label: 'Manuell' },
  { id: 'zeitfenster', label: 'Zeitfenster' },
  { id: 'zyklus',      label: 'Zyklus' },
  { id: 'umwelt',      label: 'Umwelt' },
];

export function Circ() {
  const settings   = useSettingsStore((s) => s.settings);
  const updateCirc = useSettingsStore((s) => s.updateCirc);
  const circ       = settings.circ;
  const entities   = settings.entities;

  const fanEntity  = useEntity(entities.circ);
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
    const eid = useSettingsStore.getState().settings.entities.circ;
    if (pct <= 0) {
      hass.callService('fan', 'turn_off', { entity_id: eid }).catch(console.error);
    } else {
      hass.callService('fan', 'turn_on', { entity_id: eid, percentage: Math.round(pct) }).catch(console.error);
    }
  }, []);

  const evaluate = useCallback(() => {
    const { settings: s } = useSettingsStore.getState();
    const c = s.circ;
    if (s.cardDisabled) return;

    if (c.autoOffUntil && Date.now() >= c.autoOffUntil) {
      updateCirc({ activeMode: 'off', autoOffUntil: null, manual: { ...c.manual, on: false } });
      sendFan(0);
      return;
    }
    if (c.activeMode === 'off') return;

    const nm = nowMin();
    switch (c.activeMode) {
      case 'manual':
        if (c.manual.on) sendFan(c.manual.speed);
        break;
      case 'zeitfenster': {
        const { start, end, speed, standby } = c.zeitfenster;
        sendFan(isInWindow(nm, toMin(start), toMin(end)) ? speed : standby);
        break;
      }
      case 'zyklus': {
        const result = evalCycle(c.zyklus, Date.now(), nm);
        if (result.nextState) {
          updateCirc({ zyklus: { ...c.zyklus, _state: result.nextState } });
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
          const active = evalEnv(c.umwelt, { temp: t, humidity: h, vpd: v }, prev);
          sendFan(active ? c.umwelt.speed : c.umwelt.standby);
          return active;
        });
        break;
      }
    }
  }, [sendFan, updateCirc]);

  useEffect(() => {
    evaluate();
    const id = setInterval(evaluate, 10_000);
    return () => clearInterval(id);
  }, [evaluate]);

  function handleModeChange(mode: string) {
    updateCirc({ activeMode: mode as FanActiveMode });
    if (mode === 'off') { cmdGuardUntil.current = 0; sendFan(0); }
  }

  function handleToggle() {
    const newOn = !circ.manual.on;
    updateCirc({ manual: { ...circ.manual, on: newOn } });
    cmdGuardUntil.current = 0;
    if (newOn) { sendFan(circ.manual.speed); }
    else { sendFan(0); updateCirc({ autoOffUntil: null }); }
  }

  function handleDrag(v: number) { setDialDrag(Math.max(MIN_SPEED, Math.min(MAX_SPEED, v))); }
  function handleDragEnd(v: number) {
    const c = Math.max(MIN_SPEED, Math.min(MAX_SPEED, v));
    setDialDrag(null);
    updateCirc({ manual: { ...circ.manual, speed: c } });
    cmdGuardUntil.current = 0;
    sendFan(c);
  }

  const isOn  = fanEntity?.state === 'on';
  const haPct = Number(fanEntity?.attributes?.percentage ?? 0);
  const dialVal = dialDrag ?? circ.manual.speed;

  function statusText(): { running: boolean; text: string } {
    const nm = nowMin();
    switch (circ.activeMode) {
      case 'off': return { running: false, text: 'Umluft aus' };
      case 'manual': {
        const base = circ.manual.on ? `AN · ${haPct}%` : 'AUS';
        if (circ.autoOffUntil) {
          const rem = circ.autoOffUntil - Date.now();
          if (rem > 0) return { running: circ.manual.on, text: `${base} · Aus in ${fmtMs(rem)}` };
        }
        return { running: circ.manual.on, text: base };
      }
      case 'zeitfenster': {
        const { start, end, speed, standby } = circ.zeitfenster;
        const inW = isInWindow(nm, toMin(start), toMin(end));
        return { running: inW, text: inW ? `Im Zeitfenster · ${speed}%` : `Standby · ${standby}%` };
      }
      case 'zyklus': {
        const st = circ.zyklus._state;
        const max = circ.zyklus.repetitions === 0 ? '∞' : circ.zyklus.repetitions;
        if (st.phase === 'run') {
          const left = Math.max(0, circ.zyklus.runtime * 60_000 - (Date.now() - (st.since ?? 0)));
          return { running: true, text: `Läuft · ${st.count + 1}/${max} · ${fmtMs(left)} übrig` };
        }
        if (st.phase === 'pause') {
          const left = Math.max(0, circ.zyklus.pause * 60_000 - (Date.now() - (st.since ?? 0)));
          return { running: false, text: `Pause · ${st.count}/${max} · weiter in ${fmtMs(left)}` };
        }
        return { running: false, text: `Wartet auf ${circ.zyklus.start}` };
      }
      case 'umwelt': {
        const t = parseFloat(tempEntity?.state ?? 'NaN');
        const h = parseFloat(humEntity?.state ?? 'NaN');
        const parts: string[] = [];
        if (!isNaN(t)) parts.push(`${t.toFixed(1)}°C`);
        if (!isNaN(h)) parts.push(`${Math.round(h)}%`);
        const env = parts.join(' · ');
        return { running: umweltActive, text: umweltActive ? `Aktiv · ${circ.umwelt.speed}% · ${env}` : `Standby · ${circ.umwelt.standby}% · ${env}` };
      }
    }
  }

  const status = statusText();

  return (
    <section style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: COLOR }}>Umluft</span>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: isOn ? '#4caf50' : '#666', display: 'inline-block' }} />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{isOn ? `AN · ${haPct}%` : 'AUS'}</span>
      </div>

      <ModeTab tabs={MODES} active={circ.activeMode} onChange={handleModeChange} />
      <InfoCard running={status.running} text={status.text} />

      {circ.activeMode === 'manual' && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Dial value={dialVal} min={MIN_SPEED} max={MAX_SPEED} color={COLOR} onChange={handleDrag} onChangeEnd={handleDragEnd} />
          <button onClick={handleToggle} style={{
            width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
            background: circ.manual.on ? COLOR : 'rgba(255,255,255,0.1)',
            color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}>
            {circ.manual.on ? '⏻  Ausschalten' : '⏻  Einschalten'}
          </button>
        </div>
      )}

      {circ.activeMode === 'zeitfenster' && (
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          <TimeInput label="Start" value={circ.zeitfenster.start} onChange={(v) => updateCirc({ zeitfenster: { ...circ.zeitfenster, start: v } })} />
          <TimeInput label="Ende" value={circ.zeitfenster.end} onChange={(v) => updateCirc({ zeitfenster: { ...circ.zeitfenster, end: v } })} />
          <SliderRow label="Geschwindigkeit" unit="%" value={circ.zeitfenster.speed} min={MIN_SPEED} max={MAX_SPEED} color={COLOR} onChange={(v) => updateCirc({ zeitfenster: { ...circ.zeitfenster, speed: v } })} />
          <SliderRow label="Standby" unit="%" value={circ.zeitfenster.standby} min={0} max={MAX_SPEED} color={COLOR} onChange={(v) => updateCirc({ zeitfenster: { ...circ.zeitfenster, standby: v } })} />
        </div>
      )}

      {circ.activeMode === 'zyklus' && (
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          <TimeInput label="Erster Start" value={circ.zyklus.start} onChange={(v) => updateCirc({ zyklus: { ...circ.zyklus, start: v } })} />
          <SliderRow label="Laufzeit" unit=" min" value={circ.zyklus.runtime} min={1} max={120} color={COLOR} onChange={(v) => updateCirc({ zyklus: { ...circ.zyklus, runtime: v } })} />
          <SliderRow label="Pause" unit=" min" value={circ.zyklus.pause} min={1} max={120} color={COLOR} onChange={(v) => updateCirc({ zyklus: { ...circ.zyklus, pause: v } })} />
          <SliderRow label="Wiederholungen (0=∞)" unit="" value={circ.zyklus.repetitions} min={0} max={20} color={COLOR} onChange={(v) => updateCirc({ zyklus: { ...circ.zyklus, repetitions: v } })} />
          <SliderRow label="Geschwindigkeit" unit="%" value={circ.zyklus.speed} min={MIN_SPEED} max={MAX_SPEED} color={COLOR} onChange={(v) => updateCirc({ zyklus: { ...circ.zyklus, speed: v } })} />
          <SliderRow label="Standby" unit="%" value={circ.zyklus.standby} min={0} max={MAX_SPEED} color={COLOR} onChange={(v) => updateCirc({ zyklus: { ...circ.zyklus, standby: v } })} />
        </div>
      )}

      {circ.activeMode === 'umwelt' && (
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          <CheckRow label="Temperatur" checked={circ.umwelt.useTemp} onChange={(v) => updateCirc({ umwelt: { ...circ.umwelt, useTemp: v } })} />
          {circ.umwelt.useTemp && (
            <SliderRow label={`Max. Temp · ${circ.umwelt.maxTemp}°C`} unit="°C" value={circ.umwelt.maxTemp} min={18} max={40} step={0.5} color={COLOR} onChange={(v) => updateCirc({ umwelt: { ...circ.umwelt, maxTemp: v } })} />
          )}
          <CheckRow label="Luftfeuchtigkeit" checked={circ.umwelt.useHum} onChange={(v) => updateCirc({ umwelt: { ...circ.umwelt, useHum: v } })} />
          {circ.umwelt.useHum && (
            <SliderRow label={`Max. LF · ${circ.umwelt.maxHum}%`} unit="%" value={circ.umwelt.maxHum} min={30} max={95} color={COLOR} onChange={(v) => updateCirc({ umwelt: { ...circ.umwelt, maxHum: v } })} />
          )}
          <SliderRow label={`Hysterese · ${circ.umwelt.hysteresis}`} unit="" value={circ.umwelt.hysteresis} min={0} max={5} step={0.1} color={COLOR} onChange={(v) => updateCirc({ umwelt: { ...circ.umwelt, hysteresis: v } })} />
          <SliderRow label="Geschwindigkeit" unit="%" value={circ.umwelt.speed} min={MIN_SPEED} max={MAX_SPEED} color={COLOR} onChange={(v) => updateCirc({ umwelt: { ...circ.umwelt, speed: v } })} />
          <SliderRow label="Standby" unit="%" value={circ.umwelt.standby} min={0} max={MAX_SPEED} color={COLOR} onChange={(v) => updateCirc({ umwelt: { ...circ.umwelt, standby: v } })} />
        </div>
      )}
    </section>
  );
}
