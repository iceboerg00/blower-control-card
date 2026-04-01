import type { HassObject, HassEntityState } from '../store/types';

function sensor(value: string | number, unit = ''): HassEntityState {
  return { state: String(value), attributes: { unit_of_measurement: unit }, last_updated: new Date().toISOString() };
}

function fan(on: boolean, pct = 0): HassEntityState {
  return { state: on ? 'on' : 'off', attributes: { percentage: pct }, last_updated: new Date().toISOString() };
}

function light(on: boolean, bri = 255): HassEntityState {
  return { state: on ? 'on' : 'off', attributes: { brightness: bri }, last_updated: new Date().toISOString() };
}

function humidifier(on: boolean, humidity = 60): HassEntityState {
  return { state: on ? 'on' : 'off', attributes: { humidity }, last_updated: new Date().toISOString() };
}

const mockStorage: Record<string, unknown> = {};

export const mockHass: HassObject = {
  states: {
    'fan.blower': fan(true, 50),
    'fan.circ_fan': fan(false, 0),
    'sensor.temperature': sensor(26.3, '°C'),
    'sensor.humidity': sensor(62, '%'),
    'sensor.vpd': sensor(1.05, 'kPa'),
    'humidifier.humidifier': humidifier(true, 60),
    'light.grow_light': light(true, 200),
  },
  callService: async (domain, service, data) => {
    console.log('[mock] callService', domain, service, data);
  },
  callWS: async (msg) => {
    if (msg['type'] === 'frontend/get_user_data') {
      const key = msg['key'] as string;
      return { value: mockStorage[key] ?? null };
    }
    if (msg['type'] === 'frontend/set_user_data') {
      const key = msg['key'] as string;
      mockStorage[key] = msg['value'];
      return {};
    }
    return null;
  },
};
