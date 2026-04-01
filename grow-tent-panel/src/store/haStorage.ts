import type { StateStorage } from 'zustand/middleware';
import { getHass } from '../ha/hassStore';

const HA_KEY = 'grow_tent';
const LS_KEY = 'gtp_settings';

export function createHAStorage(): StateStorage {
  return {
    async getItem(_key: string): Promise<string | null> {
      // Try HA user data first (cross-device)
      const hass = getHass();
      if (hass) {
        try {
          const res = await hass.callWS({ type: 'frontend/get_user_data', key: HA_KEY }) as { value: unknown };
          if (res?.value != null) {
            const json = JSON.stringify(res.value);
            try { localStorage.setItem(LS_KEY, json); } catch {}
            return json;
          }
        } catch (e) {
          console.warn('[gtp] HA storage read failed, falling back to localStorage', e);
        }
      }
      // Fallback: localStorage (works in dev without HA)
      return localStorage.getItem(LS_KEY);
    },

    async setItem(_key: string, value: string): Promise<void> {
      // Always write to localStorage as backup
      try { localStorage.setItem(LS_KEY, value); } catch {}
      // Write to HA (cross-device sync)
      const hass = getHass();
      if (hass) {
        try {
          await hass.callWS({ type: 'frontend/set_user_data', key: HA_KEY, value: JSON.parse(value) });
        } catch (e) {
          console.warn('[gtp] HA storage write failed', e);
        }
      }
    },

    async removeItem(_key: string): Promise<void> {
      localStorage.removeItem(LS_KEY);
      const hass = getHass();
      if (hass) {
        try {
          await hass.callWS({ type: 'frontend/set_user_data', key: HA_KEY, value: null });
        } catch {}
      }
    },
  };
}
