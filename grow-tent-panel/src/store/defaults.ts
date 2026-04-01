import type { FanModuleSettings, GrowTentSettings } from './types';

function defaultFan(manualSpeed: number, zeitSpeed: number, umweltSpeed: number): FanModuleSettings {
  return {
    activeMode: 'off',
    autoOffUntil: null,
    manual: { on: false, speed: manualSpeed },
    zeitfenster: { start: '08:00', end: '20:00', speed: zeitSpeed, standby: 25 },
    zyklus: {
      start: '08:00',
      runtime: 15,
      pause: 45,
      repetitions: 4,
      speed: 80,
      standby: 25,
      _state: { phase: 'waiting', count: 0, since: null },
    },
    umwelt: {
      useTemp: true,
      useHum: false,
      useVpd: false,
      maxTemp: 28,
      maxHum: 70,
      maxVpd: 1.2,
      speed: umweltSpeed,
      standby: 25,
      hysteresis: 1.0,
    },
  };
}

export function defaultSettings(): GrowTentSettings {
  return {
    cardDisabled: false,
    entities: {
      blower: 'fan.blower',
      temp: 'sensor.temperature',
      humidity: 'sensor.humidity',
      vpd: '',
      humidifier: 'humidifier.humidifier',
      light: 'light.grow_light',
      circ: 'fan.circ_fan',
    },
    blower: defaultFan(50, 75, 100),
    circ: defaultFan(50, 80, 80),
    light: {
      mode: 'off',
      brightness: 100,
      schedule: { start: '06:00', end: '00:00', rampUp: 30, rampDown: 30 },
    },
    humidifier: { targetHumidity: 60 },
  };
}
