import { useHassStore } from './hassStore';
import type { HassEntityState } from '../store/types';

/** Reactively returns one entity's state. Re-renders when hass updates. */
export function useEntity(entityId: string): HassEntityState | null {
  return useHassStore((s) => (entityId ? s.hass?.states[entityId] ?? null : null));
}
