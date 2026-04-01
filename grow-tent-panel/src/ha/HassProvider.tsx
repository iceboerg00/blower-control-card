import { createContext, useContext } from 'react';
import type { HassObject } from '../store/types';
import { useHassStore } from './hassStore';

const HassContext = createContext<HassObject | null>(null);

export function HassProvider({ children }: { children: React.ReactNode }) {
  const hass = useHassStore((s) => s.hass);
  return <HassContext.Provider value={hass}>{children}</HassContext.Provider>;
}

export function useHassContext(): HassObject | null {
  return useContext(HassContext);
}
