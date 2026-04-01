import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { GrowTentSettings, FanModuleSettings, LightSettings } from './types';
import { defaultSettings } from './defaults';
import { createHAStorage } from './haStorage';

interface SettingsStore {
  settings: GrowTentSettings;
  updateBlower: (patch: Partial<FanModuleSettings>) => void;
  updateCirc: (patch: Partial<FanModuleSettings>) => void;
  updateLight: (patch: Partial<LightSettings>) => void;
  updateHumidifier: (patch: Partial<GrowTentSettings['humidifier']>) => void;
  updateEntities: (patch: Partial<GrowTentSettings['entities']>) => void;
  setCardDisabled: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: defaultSettings(),

      updateBlower: (patch) =>
        set((s) => ({ settings: { ...s.settings, blower: { ...s.settings.blower, ...patch } } })),

      updateCirc: (patch) =>
        set((s) => ({ settings: { ...s.settings, circ: { ...s.settings.circ, ...patch } } })),

      updateLight: (patch) =>
        set((s) => ({ settings: { ...s.settings, light: { ...s.settings.light, ...patch } } })),

      updateHumidifier: (patch) =>
        set((s) => ({ settings: { ...s.settings, humidifier: { ...s.settings.humidifier, ...patch } } })),

      updateEntities: (patch) =>
        set((s) => ({ settings: { ...s.settings, entities: { ...s.settings.entities, ...patch } } })),

      setCardDisabled: (v) =>
        set((s) => ({ settings: { ...s.settings, cardDisabled: v } })),
    }),
    {
      name: 'grow_tent',
      storage: createJSONStorage(createHAStorage),
      merge: (persisted, current) => deepMerge(current as SettingsStore, persisted as Partial<SettingsStore>),
    },
  ),
);

function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as (keyof T)[]) {
    const b = base[key];
    const o = override[key];
    if (
      o !== undefined &&
      b !== null &&
      typeof b === 'object' &&
      !Array.isArray(b) &&
      typeof o === 'object' &&
      !Array.isArray(o)
    ) {
      result[key] = deepMerge(b as object, o as object) as T[typeof key];
    } else if (o !== undefined) {
      result[key] = o as T[typeof key];
    }
  }
  return result;
}
