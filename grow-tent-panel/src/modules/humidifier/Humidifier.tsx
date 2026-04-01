import { useCallback, useRef } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useHassStore } from '../../ha/hassStore';
import { useEntity } from '../../ha/useEntity';
import { Dial } from '../../components/Dial';

const COLOR = '#03a9f4';
const GUARD_MS = 1000;
const THROTTLE_MS = 500;

export function Humidifier() {
  const settings         = useSettingsStore((s) => s.settings);
  const updateHumidifier = useSettingsStore((s) => s.updateHumidifier);
  const target           = settings.humidifier.targetHumidity;
  const entities         = settings.entities;

  const humEntity = useEntity(entities.humidifier);
  const humSensor = useEntity(entities.humidity);

  const cmdGuardUntil = useRef(0);
  const lastCmdMs     = useRef(0);

  const sendTarget = useCallback((pct: number) => {
    if (Date.now() < cmdGuardUntil.current) return;
    if (Date.now() - lastCmdMs.current < THROTTLE_MS) return;
    lastCmdMs.current = Date.now();
    cmdGuardUntil.current = Date.now() + GUARD_MS;
    const hass = useHassStore.getState().hass;
    const eid = useSettingsStore.getState().settings.entities.humidifier;
    hass?.callService('humidifier', 'set_humidity', { entity_id: eid, humidity: Math.round(pct) }).catch(console.error);
  }, []);

  function handleDragEnd(v: number) {
    const c = Math.max(30, Math.min(90, v));
    updateHumidifier({ targetHumidity: c });
    cmdGuardUntil.current = 0;
    sendTarget(c);
  }

  function handleToggle() {
    const isOn = humEntity?.state === 'on';
    const hass = useHassStore.getState().hass;
    const eid = settings.entities.humidifier;
    if (isOn) {
      hass?.callService('humidifier', 'turn_off', { entity_id: eid }).catch(console.error);
    } else {
      hass?.callService('humidifier', 'turn_on', { entity_id: eid }).catch(console.error);
    }
  }

  const isOn      = humEntity?.state === 'on';
  const haTarget  = Number(humEntity?.attributes?.humidity ?? target);
  const currentHum = parseFloat(humSensor?.state ?? 'NaN');

  return (
    <section style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: COLOR }}>Befeuchter</span>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: isOn ? '#4caf50' : '#666', display: 'inline-block' }} />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
          {isOn ? `AN · Ziel ${haTarget}%` : 'AUS'}
          {!isNaN(currentHum) ? `  ·  Aktuell ${Math.round(currentHum)}%` : ''}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Dial value={target} min={30} max={90} color={COLOR} label={`${target}`}
          onChange={(v) => updateHumidifier({ targetHumidity: Math.max(30, Math.min(90, v)) })}
          onChangeEnd={handleDragEnd} />
        <button onClick={handleToggle} style={{
          width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
          background: isOn ? COLOR : 'rgba(255,255,255,0.1)',
          color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
        }}>
          {isOn ? '⏻  Ausschalten' : '⏻  Einschalten'}
        </button>
      </div>
    </section>
  );
}
