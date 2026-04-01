import { useEffect, useRef, useState, useCallback } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useHassStore } from '../../ha/hassStore';
import { useEntity } from '../../ha/useEntity';
import { Dial } from '../../components/Dial';
import { InfoCard } from '../../components/InfoCard';
import { evalRamp } from '../../engines/rampEngine';
import { nowMin, nowSec, toMin } from '../../utils/time';
import { isInWindow } from '../../engines/scheduleEngine';
import { TimeInput, SliderRow } from '../blower/Blower';
import type { LightMode } from '../../store/types';

const LIGHT_MIN = 11, LIGHT_MAX = 100;
const COLOR = '#ffb300';
const GUARD_MS = 2000;
const THROTTLE_MS = 100;

const MODES = [
  { id: 'off',      label: 'Aus' },
  { id: 'manual',   label: 'Manuell' },
  { id: 'schedule', label: 'Zeitplan' },
];

export function Light() {
  const settings    = useSettingsStore((s) => s.settings);
  const updateLight = useSettingsStore((s) => s.updateLight);
  const light       = settings.light;
  const entities    = settings.entities;

  const lightEntity = useEntity(entities.light);

  const [rampOk, setRampOk] = useState(true);
  const [dialDrag, setDialDrag] = useState<number | null>(null);
  const cmdGuardUntil = useRef(0);
  const lastCmdMs     = useRef(0);
  const lastSentBri   = useRef<number | null>(null);

  const sendLight = useCallback((pct: number, force = false) => {
    if (!force && Date.now() < cmdGuardUntil.current) return;
    if (!force && Date.now() - lastCmdMs.current < THROTTLE_MS) return;
    if (!force && lastSentBri.current === pct) return;
    lastCmdMs.current = Date.now();
    lastSentBri.current = pct;
    const hass = useHassStore.getState().hass;
    if (!hass) return;
    const eid = useSettingsStore.getState().settings.entities.light;
    if (pct <= 0) {
      hass.callService('light', 'turn_off', { entity_id: eid }).catch(console.error);
    } else {
      const bri = Math.round(Math.min(Math.max(pct, 1), 100) * 2.55);
      hass.callService('light', 'turn_on', { entity_id: eid, brightness: bri }).catch(console.error);
    }
  }, []);

  const evaluate = useCallback(() => {
    const { settings: s } = useSettingsStore.getState();
    const ls = s.light;
    if (ls.mode !== 'schedule') return;
    const isOn = useHassStore.getState().hass?.states[s.entities.light]?.state === 'on';
    const nm = nowMin(), ns = nowSec();
    setRampOk((currentRampOk) => {
      const result = evalRamp(ls.schedule, ls.brightness, ns, nm, !!isOn, currentRampOk);
      sendLight(result.brightness);
      return result.rampOk;
    });
  }, [sendLight]);

  useEffect(() => {
    if (light.mode !== 'schedule') return;
    evaluate();
    const id = setInterval(evaluate, 5_000);
    return () => clearInterval(id);
  }, [evaluate, light.mode]);

  function handleModeChange(mode: string) {
    updateLight({ mode: mode as LightMode });
    if (mode === 'off') { cmdGuardUntil.current = 0; sendLight(0, true); }
    if (mode === 'schedule') { lastSentBri.current = null; }
  }

  function handleToggle() {
    const isOn = lightEntity?.state === 'on';
    cmdGuardUntil.current = Date.now() + GUARD_MS;
    if (isOn) { sendLight(0, true); }
    else { sendLight(Math.max(LIGHT_MIN, light.brightness), true); }
  }

  function handleDrag(v: number) {
    setDialDrag(Math.max(LIGHT_MIN, Math.min(LIGHT_MAX, v)));
    cmdGuardUntil.current = Date.now() + GUARD_MS;
  }

  function handleDragEnd(v: number) {
    const c = Math.max(LIGHT_MIN, Math.min(LIGHT_MAX, v));
    setDialDrag(null);
    if (light.mode !== 'schedule') updateLight({ brightness: c });
    lastSentBri.current = null;
    cmdGuardUntil.current = 0;
    sendLight(c, true);
  }

  const isOn   = lightEntity?.state === 'on';
  const haBri  = Number(lightEntity?.attributes?.brightness ?? 0);
  const hasPct = Math.round(haBri / 2.55);
  const dialVal = dialDrag ?? light.brightness;

  function statusText(): { running: boolean; text: string } {
    if (light.mode === 'off') return { running: false, text: 'Licht aus' };
    if (light.mode === 'manual') return { running: !!isOn, text: isOn ? `AN · ${hasPct}%` : 'AUS' };
    if (!rampOk) return { running: false, text: 'Rampe unterbrochen — bitte zurücksetzen' };
    const nm = nowMin();
    const inW = isInWindow(nm, toMin(light.schedule.start), toMin(light.schedule.end));
    return inW
      ? { running: true, text: `Licht an · ${hasPct}%` }
      : { running: false, text: 'Licht aus (außerhalb Zeitplan)' };
  }

  const status = statusText();

  return (
    <section style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: COLOR }}>Licht</span>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: isOn ? '#4caf50' : '#666', display: 'inline-block' }} />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{isOn ? `AN · ${hasPct}%` : 'AUS'}</span>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {MODES.map((m) => (
          <button key={m.id} onClick={() => handleModeChange(m.id)} style={{
            flex: 1, padding: '8px 4px', border: 'none', borderRadius: 8, fontSize: 13,
            fontWeight: light.mode === m.id ? 700 : 400, cursor: 'pointer',
            background: light.mode === m.id ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
            color: light.mode === m.id ? '#f5f5f5' : 'rgba(255,255,255,0.5)',
          }}>{m.label}</button>
        ))}
      </div>

      <InfoCard running={status.running} text={status.text} />

      {light.mode === 'schedule' && !rampOk && (
        <button onClick={() => { setRampOk(true); lastSentBri.current = null; evaluate(); }}
          style={{ marginTop: 8, padding: '6px 14px', borderRadius: 8, border: `1px solid ${COLOR}`, background: 'transparent', color: COLOR, cursor: 'pointer', fontSize: 13 }}>
          Rampe zurücksetzen
        </button>
      )}

      {light.mode === 'manual' && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Dial value={dialVal} min={LIGHT_MIN} max={LIGHT_MAX} color={COLOR} onChange={handleDrag} onChangeEnd={handleDragEnd} />
          <button onClick={handleToggle} style={{
            width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
            background: isOn ? COLOR : 'rgba(255,255,255,0.1)',
            color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}>
            {isOn ? '⏻  Ausschalten' : '⏻  Einschalten'}
          </button>
        </div>
      )}

      {light.mode === 'schedule' && (
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          <TimeInput label="Einschalten" value={light.schedule.start} onChange={(v) => updateLight({ schedule: { ...light.schedule, start: v } })} />
          <TimeInput label="Ausschalten" value={light.schedule.end} onChange={(v) => updateLight({ schedule: { ...light.schedule, end: v } })} />
          <SliderRow label="Sonnenaufgang" unit=" min" value={light.schedule.rampUp} min={0} max={120} color={COLOR} onChange={(v) => updateLight({ schedule: { ...light.schedule, rampUp: v } })} />
          <SliderRow label="Sonnenuntergang" unit=" min" value={light.schedule.rampDown} min={0} max={120} color={COLOR} onChange={(v) => updateLight({ schedule: { ...light.schedule, rampDown: v } })} />
          <SliderRow label="Helligkeit" unit="%" value={light.brightness} min={LIGHT_MIN} max={LIGHT_MAX} color={COLOR} onChange={(v) => updateLight({ brightness: v })} />
        </div>
      )}
    </section>
  );
}
