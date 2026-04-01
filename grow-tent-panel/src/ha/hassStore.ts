import { create } from 'zustand';
import type { HassObject } from '../store/types';

interface HassStore {
  hass: HassObject | null;
  setHass: (hass: HassObject) => void;
}

export const useHassStore = create<HassStore>((set) => ({
  hass: null,
  setHass: (hass) => set({ hass }),
}));

/** Call from custom element's `set hass(h)`. */
export const setHass = (hass: HassObject): void =>
  useHassStore.getState().setHass(hass);

/** Read current hass synchronously — safe inside callbacks and timers. */
export const getHass = (): HassObject | null =>
  useHassStore.getState().hass;
