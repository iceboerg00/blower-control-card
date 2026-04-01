# Grow Tent Panel — Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to execute this plan. Mark each checkbox as you complete it. Every task builds on the previous — do them in order.

**Goal:** Build `grow-tent-panel` — a React 18 + TypeScript + Vite Home Assistant Custom Panel (sidebar entry) that replaces `blower-control-card.js`. Controls 4 grow-tent modules (Blower, Light, Humidifier, Circ fan) via HA WebSocket. Settings persist cross-device via `frontend/set_user_data`.

**Root directory:** `C:\Users\Mike\projekte\grow-tent-panel\`

**Stack:** React 18 · TypeScript 5 · Vite 5 · Zustand 4 · Vitest 2

---

## File Map

| File | Role |
|------|------|
| `src/store/types.ts` | All TS types: CycleState, FanModuleSettings, LightSettings, GrowTentSettings |
| `src/store/defaults.ts` | `defaultSettings()` — canonical factory for fresh settings |
| `src/store/haStorage.ts` | Zustand-compatible storage adapter using `frontend/set_user_data` |
| `src/store/settingsStore.ts` | Zustand store with persist middleware; exposes updater actions |
| `src/ha/hassStore.ts` | Zustand store holding live `hass` object; `setHass()` called by custom element |
| `src/ha/HassProvider.tsx` | React context provider — wraps App; reads from hassStore |
| `src/ha/useHass.ts` | Hook: `callService` / `callWS` from any component |
| `src/ha/useEntity.ts` | Hook: reactively read one entity state |
| `src/ha/mockHass.ts` | Mock hass for `npm run dev` (no real HA needed) |
| `src/utils/time.ts` | `nowMin()`, `toMin()`, `nowSec()`, `toSec()` — pure time helpers |
| `src/engines/scheduleEngine.ts` | `isInWindow()` — midnight-safe time-window check |
| `src/engines/cycleEngine.ts` | `evalCycle()` — cycle state machine (waiting/run/pause) |
| `src/engines/envEngine.ts` | `evalEnv()` — hysteresis trigger for temp/humidity/VPD |
| `src/engines/rampEngine.ts` | `evalRamp()` — light sunrise/sunset ramp calculation |
| `src/components/Dial.tsx` | SVG rotary dial (CX=110, CY=110, R=85, S_ANG=135°, T_ANG=270°) |
| `src/components/ModeTab.tsx` | Tab bar for mode switching |
| `src/components/InfoCard.tsx` | Status card (running / standby) |
| `src/modules/blower/Blower.tsx` | Blower module — 4 modes, re-assertion, auto-off timer |
| `src/modules/light/Light.tsx` | Light module — manual + schedule + ramp |
| `src/modules/humidifier/Humidifier.tsx` | Humidifier — single target humidity dial |
| `src/modules/circ/Circ.tsx` | Circ fan — 4 modes, reuses engines |
| `src/App.tsx` | Root layout; 4 modules in column; global CSS variables |
| `src/main.tsx` | `HTMLElement` custom element; HA injects `hass` here |
| `vite.config.ts` | Single-file build output |
| `index.html` | Dev entry point |

**Test files:**

| File | Coverage |
|------|----------|
| `src/utils/time.test.ts` | nowMin, toMin, nowSec, toSec |
| `src/engines/scheduleEngine.test.ts` | isInWindow: normal, midnight-wrap, boundary edges |
| `src/engines/cycleEngine.test.ts` | all phase transitions + safety reset |
| `src/engines/envEngine.test.ts` | activate, deactivate, hysteresis hold |
| `src/engines/rampEngine.test.ts` | sunrise, sunset, normal, interrupted |

---

## Task 1 — Project Scaffolding

- [ ] Create directory `C:\Users\Mike\projekte\grow-tent-panel\`
- [ ] Create `package.json`:

```json
{
  "name": "grow-tent-panel",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.4"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.3",
    "vite": "^5.3.4",
    "vite-plugin-singlefile": "^2.0.2",
    "vitest": "^2.0.4"
  }
}
```

- [ ] Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] Create `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'grow-tent-panel.js',
      },
    },
  },
  test: {
    environment: 'node',
  },
});
```

- [ ] Create `index.html`:

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Grow Tent Panel — Dev</title>
  </head>
  <body style="margin:0;background:#111">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] Run `npm install` to install dependencies.
- [ ] Verify: `npm run test` produces "No test files found" (passes without error).

---

## Task 2 — TypeScript Types

- [ ] Create `src/store/types.ts`:

```ts
// ── Cycle engine ──────────────────────────────────────────────────────────
export interface CycleState {
  phase: 'waiting' | 'run' | 'pause';
  count: number;
  since: number | null; // Date.now() ms timestamp when phase started
}

// ── Fan module sub-settings ───────────────────────────────────────────────
export interface ZeitfensterSettings {
  start: string;   // "HH:MM"
  end: string;     // "HH:MM"
  speed: number;   // % when inside window
  standby: number; // % outside window (0 = off)
}

export interface ZyklusSettings {
  start: string;        // "HH:MM" — daily trigger time
  runtime: number;      // minutes per run segment
  pause: number;        // minutes per pause segment
  repetitions: number;  // 0 = infinite
  speed: number;        // % while running
  standby: number;      // % while pausing / waiting (0 = off)
  _state: CycleState;
}

export interface UmweltSettings {
  useTemp: boolean;
  useHum: boolean;
  useVpd: boolean;
  maxTemp: number;    // °C threshold
  maxHum: number;     // % threshold
  maxVpd: number;     // kPa threshold
  hysteresis: number; // deactivate when value < threshold - hysteresis
  speed: number;      // % when active
  standby: number;    // % when inactive (0 = off)
}

export type FanActiveMode = 'off' | 'manual' | 'zeitfenster' | 'zyklus' | 'umwelt';

export interface FanModuleSettings {
  activeMode: FanActiveMode;
  autoOffUntil: number | null; // Date.now() timestamp; null = no auto-off
  manual: { on: boolean; speed: number };
  zeitfenster: ZeitfensterSettings;
  zyklus: ZyklusSettings;
  umwelt: UmweltSettings;
}

// ── Light ─────────────────────────────────────────────────────────────────
export interface LightSchedule {
  start: string;    // "HH:MM"
  end: string;      // "HH:MM"
  rampUp: number;   // minutes (0 = instant)
  rampDown: number; // minutes (0 = instant)
}

export type LightMode = 'off' | 'manual' | 'schedule';

export interface LightSettings {
  mode: LightMode;
  brightness: number; // 11–100 %
  schedule: LightSchedule;
}

// ── Entity config ─────────────────────────────────────────────────────────
export interface EntityConfig {
  blower: string;
  temp: string;
  humidity: string;
  vpd: string;
  humidifier: string;
  light: string;
  circ: string;
}

// ── Root settings ─────────────────────────────────────────────────────────
export interface GrowTentSettings {
  cardDisabled: boolean;
  entities: EntityConfig;
  blower: FanModuleSettings;
  circ: FanModuleSettings;
  light: LightSettings;
  humidifier: { targetHumidity: number }; // 30–90 %
}

// ── HA types (minimal surface) ────────────────────────────────────────────
export interface HassEntityState {
  state: string;
  attributes: Record<string, unknown>;
  last_updated: string;
}

export interface HassObject {
  states: Record<string, HassEntityState>;
  callService: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
  ) => Promise<void>;
  callWS: (message: Record<string, unknown>) => Promise<unknown>;
}
```

- [ ] Verify TypeScript accepts the file: `npx tsc --noEmit` (no errors).

---

## Task 3 — Defaults

- [ ] Create `src/store/defaults.ts`:

```ts
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
```

---

## Task 4 — Time Utilities + Tests

- [ ] Create `src/utils/time.ts`:

```ts
/** Minutes since midnight (0–1439). */
export function nowMin(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** Seconds since midnight (0–86399). */
export function nowSec(): number {
  const d = new Date();
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

/** Parse "HH:MM" → minutes since midnight. */
export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Parse "HH:MM" → seconds since midnight. */
export function toSec(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 3600 + m * 60;
}

/** Format milliseconds as "Xh Ymin" or "Y min". */
export function fmtMs(ms: number): string {
  const totMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totMin / 60);
  const m = totMin % 60;
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}
```

- [ ] Create `src/utils/time.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toMin, toSec } from './time';

describe('toMin', () => {
  it('parses midnight', () => expect(toMin('00:00')).toBe(0));
  it('parses noon', () => expect(toMin('12:00')).toBe(720));
  it('parses 23:59', () => expect(toMin('23:59')).toBe(1439));
  it('parses 08:30', () => expect(toMin('08:30')).toBe(510));
});

describe('toSec', () => {
  it('parses midnight', () => expect(toSec('00:00')).toBe(0));
  it('parses 01:00', () => expect(toSec('01:00')).toBe(3600));
  it('parses 00:01', () => expect(toSec('00:01')).toBe(60));
  it('parses 06:30', () => expect(toSec('06:30')).toBe(23400));
});
```

- [ ] Run `npm test` — all tests pass.

---

## Task 5 — HA Layer

- [ ] Create `src/ha/hassStore.ts`:

```ts
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
```

- [ ] Create `src/ha/HassProvider.tsx`:

```tsx
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
```

- [ ] Create `src/ha/useHass.ts`:

```ts
import { useHassContext } from './HassProvider';

export function useHass() {
  const hass = useHassContext();

  function callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
  ): void {
    hass?.callService(domain, service, data).catch(console.error);
  }

  async function callWS(message: Record<string, unknown>): Promise<unknown> {
    if (!hass) return null;
    return hass.callWS(message);
  }

  return { hass, callService, callWS };
}
```

- [ ] Create `src/ha/useEntity.ts`:

```ts
import { useHassStore } from './hassStore';
import type { HassEntityState } from '../store/types';

/** Reactively returns one entity's state. Re-renders when hass updates. */
export function useEntity(entityId: string): HassEntityState | null {
  return useHassStore((s) => (entityId ? s.hass?.states[entityId] ?? null : null));
}
```

- [ ] Create `src/ha/mockHass.ts`:

```ts
import { HassObject, HassEntityState } from '../store/types';

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

let mockStorage: Record<string, unknown> = {};

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
    if (msg.type === 'frontend/get_user_data') {
      const key = msg.key as string;
      return { value: mockStorage[key] ?? null };
    }
    if (msg.type === 'frontend/set_user_data') {
      const key = msg.key as string;
      mockStorage[key] = msg.value;
      return {};
    }
    return null;
  },
};
```

---

## Task 6 — Settings Store

- [ ] Create `src/store/haStorage.ts`:

```ts
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
```

- [ ] Create `src/store/settingsStore.ts`:

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { GrowTentSettings, FanModuleSettings, LightSettings } from './types';
import { defaultSettings } from './defaults';
import { createHAStorage } from './haStorage';

interface SettingsStore {
  settings: GrowTentSettings;
  // Granular updaters to avoid accidental full-object replacement
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
      // Deep-merge saved state over defaults so new fields survive upgrades
      merge: (persisted, current) => deepMerge(current, persisted as SettingsStore),
    },
  ),
);

function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as (keyof T)[]) {
    const b = base[key];
    const o = override[key];
    if (o !== undefined && b !== null && typeof b === 'object' && !Array.isArray(b) &&
        typeof o === 'object' && !Array.isArray(o)) {
      result[key] = deepMerge(b as object, o as object) as T[typeof key];
    } else if (o !== undefined) {
      result[key] = o as T[typeof key];
    }
  }
  return result;
}
```

---

## Task 7 — Schedule Engine + Tests

- [ ] Create `src/engines/scheduleEngine.ts`:

```ts
/**
 * Returns true if `nowMinutes` falls inside the window [startMin, endMin).
 * Handles midnight-wrap (e.g. 22:00–06:00).
 */
export function isInWindow(nowMinutes: number, startMin: number, endMin: number): boolean {
  if (startMin <= endMin) {
    return nowMinutes >= startMin && nowMinutes < endMin;
  }
  // Midnight-wrapping window: active from start until midnight AND from midnight until end
  return nowMinutes >= startMin || nowMinutes < endMin;
}
```

- [ ] Create `src/engines/scheduleEngine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isInWindow } from './scheduleEngine';

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

describe('isInWindow — normal (no midnight wrap)', () => {
  it('inside window', () => expect(isInWindow(toMin('12:00'), toMin('08:00'), toMin('20:00'))).toBe(true));
  it('at start', () => expect(isInWindow(toMin('08:00'), toMin('08:00'), toMin('20:00'))).toBe(true));
  it('just before end', () => expect(isInWindow(toMin('19:59'), toMin('08:00'), toMin('20:00'))).toBe(true));
  it('at end (exclusive)', () => expect(isInWindow(toMin('20:00'), toMin('08:00'), toMin('20:00'))).toBe(false));
  it('before start', () => expect(isInWindow(toMin('07:59'), toMin('08:00'), toMin('20:00'))).toBe(false));
  it('after end', () => expect(isInWindow(toMin('21:00'), toMin('08:00'), toMin('20:00'))).toBe(false));
});

describe('isInWindow — midnight-wrap (e.g. 22:00–06:00)', () => {
  it('late evening inside', () => expect(isInWindow(toMin('23:00'), toMin('22:00'), toMin('06:00'))).toBe(true));
  it('early morning inside', () => expect(isInWindow(toMin('05:00'), toMin('22:00'), toMin('06:00'))).toBe(true));
  it('at start', () => expect(isInWindow(toMin('22:00'), toMin('22:00'), toMin('06:00'))).toBe(true));
  it('just before end', () => expect(isInWindow(toMin('05:59'), toMin('22:00'), toMin('06:00'))).toBe(true));
  it('at end (exclusive)', () => expect(isInWindow(toMin('06:00'), toMin('22:00'), toMin('06:00'))).toBe(false));
  it('midday outside', () => expect(isInWindow(toMin('12:00'), toMin('22:00'), toMin('06:00'))).toBe(false));
});
```

- [ ] Run `npm test` — all tests pass.

---

## Task 8 — Cycle Engine + Tests

- [ ] Create `src/engines/cycleEngine.ts`:

```ts
import type { ZyklusSettings, CycleState } from '../store/types';
import { toMin } from '../utils/time';

export interface CycleResult {
  speed: number;
  nextState?: CycleState; // defined when a phase transition occurred
}

const SAFETY_RESET_MS = 172_800_000; // 48 hours

/**
 * Pure cycle evaluation. Returns desired fan speed and optional state transition.
 * Caller must persist nextState to the settings store if defined.
 */
export function evalCycle(
  settings: ZyklusSettings,
  nowMs: number,
  nowMinutes: number,
): CycleResult {
  const st = settings._state;
  const startMin = toMin(settings.start);
  const max = settings.repetitions === 0 ? Infinity : settings.repetitions;

  // Safety reset: if stuck in a phase for more than 48h, return to waiting
  if (st.since != null && nowMs - st.since > SAFETY_RESET_MS) {
    return {
      speed: settings.standby,
      nextState: { phase: 'waiting', count: 0, since: null },
    };
  }

  // ── Waiting: check 2-minute start window (midnight-safe mod) ─────────
  if (st.phase === 'waiting') {
    const minutesFromStart = (nowMinutes - startMin + 1440) % 1440;
    if (minutesFromStart < 2) {
      return {
        speed: settings.speed,
        nextState: { phase: 'run', count: 0, since: nowMs },
      };
    }
    return { speed: settings.standby };
  }

  const elapsedMin = st.since != null ? (nowMs - st.since) / 60_000 : 0;

  // ── Running ───────────────────────────────────────────────────────────
  if (st.phase === 'run') {
    if (elapsedMin >= settings.runtime) {
      const newCount = st.count + 1;
      if (newCount >= max) {
        // All repetitions done — go back to waiting
        return {
          speed: settings.standby,
          nextState: { phase: 'waiting', count: 0, since: null },
        };
      }
      return {
        speed: settings.standby,
        nextState: { phase: 'pause', count: newCount, since: nowMs },
      };
    }
    return { speed: settings.speed };
  }

  // ── Pausing ───────────────────────────────────────────────────────────
  if (st.phase === 'pause') {
    if (elapsedMin >= settings.pause) {
      return {
        speed: settings.speed,
        nextState: { phase: 'run', count: st.count, since: nowMs },
      };
    }
    return { speed: settings.standby };
  }

  return { speed: settings.standby };
}
```

- [ ] Create `src/engines/cycleEngine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { evalCycle } from './cycleEngine';
import type { ZyklusSettings } from '../store/types';

function makeSettings(overrides: Partial<ZyklusSettings> = {}): ZyklusSettings {
  return {
    start: '08:00',
    runtime: 15,
    pause: 45,
    repetitions: 2,
    speed: 80,
    standby: 25,
    _state: { phase: 'waiting', count: 0, since: null },
    ...overrides,
  };
}

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

describe('waiting phase', () => {
  it('outside start window → standby speed', () => {
    const s = makeSettings();
    const result = evalCycle(s, Date.now(), toMin('10:00')); // 10:00, start is 08:00
    expect(result.speed).toBe(25);
    expect(result.nextState).toBeUndefined();
  });

  it('within 2-min start window → transitions to run', () => {
    const s = makeSettings();
    const nowMs = Date.now();
    const result = evalCycle(s, nowMs, toMin('08:01')); // 1 min after start
    expect(result.speed).toBe(80);
    expect(result.nextState?.phase).toBe('run');
    expect(result.nextState?.count).toBe(0);
    expect(result.nextState?.since).toBe(nowMs);
  });

  it('midnight-safe: start 23:59, now 00:00 → triggers', () => {
    const s = makeSettings({ start: '23:59' });
    const result = evalCycle(s, Date.now(), toMin('00:00'));
    expect(result.nextState?.phase).toBe('run');
  });
});

describe('run phase', () => {
  it('within runtime → run speed', () => {
    const since = Date.now() - 5 * 60_000; // 5 min ago
    const s = makeSettings({ _state: { phase: 'run', count: 0, since } });
    const result = evalCycle(s, Date.now(), toMin('10:00'));
    expect(result.speed).toBe(80);
    expect(result.nextState).toBeUndefined();
  });

  it('runtime expired, more reps remaining → transitions to pause', () => {
    const since = Date.now() - 20 * 60_000; // 20 min ago, runtime=15
    const s = makeSettings({ _state: { phase: 'run', count: 0, since } });
    const result = evalCycle(s, Date.now(), toMin('10:00'));
    expect(result.speed).toBe(25);
    expect(result.nextState?.phase).toBe('pause');
    expect(result.nextState?.count).toBe(1);
  });

  it('runtime expired, all reps done → back to waiting', () => {
    const since = Date.now() - 20 * 60_000;
    const s = makeSettings({ repetitions: 1, _state: { phase: 'run', count: 0, since } });
    const result = evalCycle(s, Date.now(), toMin('10:00'));
    expect(result.nextState?.phase).toBe('waiting');
    expect(result.nextState?.count).toBe(0);
    expect(result.nextState?.since).toBeNull();
  });

  it('repetitions=0 (infinite) → never returns to waiting from run', () => {
    const since = Date.now() - 20 * 60_000;
    const s = makeSettings({ repetitions: 0, _state: { phase: 'run', count: 999, since } });
    const result = evalCycle(s, Date.now(), toMin('10:00'));
    expect(result.nextState?.phase).toBe('pause');
  });
});

describe('pause phase', () => {
  it('within pause → standby speed', () => {
    const since = Date.now() - 10 * 60_000; // 10 min, pause=45
    const s = makeSettings({ _state: { phase: 'pause', count: 1, since } });
    const result = evalCycle(s, Date.now(), toMin('10:00'));
    expect(result.speed).toBe(25);
    expect(result.nextState).toBeUndefined();
  });

  it('pause expired → transitions to run', () => {
    const since = Date.now() - 50 * 60_000; // 50 min, pause=45
    const s = makeSettings({ _state: { phase: 'pause', count: 1, since } });
    const result = evalCycle(s, Date.now(), toMin('10:00'));
    expect(result.nextState?.phase).toBe('run');
    expect(result.nextState?.count).toBe(1);
  });
});

describe('safety reset', () => {
  it('stuck > 48h → resets to waiting', () => {
    const since = Date.now() - 200 * 60 * 60_000; // 200h ago
    const s = makeSettings({ _state: { phase: 'run', count: 0, since } });
    const result = evalCycle(s, Date.now(), toMin('10:00'));
    expect(result.nextState?.phase).toBe('waiting');
    expect(result.speed).toBe(25);
  });
});
```

- [ ] Run `npm test` — all tests pass.

---

## Task 9 — Environment Engine + Tests

- [ ] Create `src/engines/envEngine.ts`:

```ts
import type { UmweltSettings } from '../store/types';

export interface EnvReadings {
  temp: number | null;
  humidity: number | null;
  vpd: number | null;
}

/**
 * Hysteresis-based environment trigger.
 * - Activates when any enabled sensor exceeds its threshold.
 * - Deactivates only when ALL enabled sensors fall below (threshold - hysteresis).
 * - If currently active and no sensor is over threshold but not all are under: stays active.
 */
export function evalEnv(
  settings: UmweltSettings,
  readings: EnvReadings,
  currentlyActive: boolean,
): boolean {
  const { temp, humidity, vpd } = readings;
  const u = settings;

  const tValid = temp !== null && !isNaN(temp);
  const hValid = humidity !== null && !isNaN(humidity);
  const vValid = vpd !== null && !isNaN(vpd);

  const tOver = u.useTemp && tValid && temp! > u.maxTemp;
  const hOver = u.useHum  && hValid && humidity! > u.maxHum;
  const vOver = u.useVpd  && vValid && vpd! > u.maxVpd;

  const tUnder = !u.useTemp || !tValid || temp! < u.maxTemp - u.hysteresis;
  const hUnder = !u.useHum  || !hValid || humidity! < u.maxHum - u.hysteresis;
  const vUnder = !u.useVpd  || !vValid || vpd! < u.maxVpd - u.hysteresis;

  if (tOver || hOver || vOver) return true;       // Any over threshold → activate
  if (tUnder && hUnder && vUnder) return false;   // All under hysteresis band → deactivate
  return currentlyActive;                          // In hysteresis band → hold current state
}
```

- [ ] Create `src/engines/envEngine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { evalEnv } from './envEngine';
import type { UmweltSettings } from '../store/types';

function settings(overrides: Partial<UmweltSettings> = {}): UmweltSettings {
  return {
    useTemp: true, useHum: false, useVpd: false,
    maxTemp: 28, maxHum: 70, maxVpd: 1.2,
    hysteresis: 1.0, speed: 100, standby: 25,
    ...overrides,
  };
}

describe('evalEnv — temperature only', () => {
  it('below threshold → inactive', () => {
    expect(evalEnv(settings(), { temp: 25, humidity: null, vpd: null }, false)).toBe(false);
  });

  it('above threshold → active', () => {
    expect(evalEnv(settings(), { temp: 29, humidity: null, vpd: null }, false)).toBe(true);
  });

  it('in hysteresis band (was active) → stays active', () => {
    // temp=27.5 is below 28 but above 28-1=27
    expect(evalEnv(settings(), { temp: 27.5, humidity: null, vpd: null }, true)).toBe(true);
  });

  it('in hysteresis band (was inactive) → stays inactive', () => {
    expect(evalEnv(settings(), { temp: 27.5, humidity: null, vpd: null }, false)).toBe(false);
  });

  it('below hysteresis band → deactivates', () => {
    // temp=26.9 is below 28-1=27
    expect(evalEnv(settings(), { temp: 26.9, humidity: null, vpd: null }, true)).toBe(false);
  });
});

describe('evalEnv — temp + humidity', () => {
  const s = settings({ useHum: true });

  it('only hum over → active', () => {
    expect(evalEnv(s, { temp: 25, humidity: 75, vpd: null }, false)).toBe(true);
  });

  it('neither over, both under → inactive', () => {
    expect(evalEnv(s, { temp: 25, humidity: 65, vpd: null }, true)).toBe(false);
  });

  it('temp over, hum under → active', () => {
    expect(evalEnv(s, { temp: 29, humidity: 65, vpd: null }, false)).toBe(true);
  });
});

describe('evalEnv — invalid readings', () => {
  it('null readings with useTemp=true → inactive', () => {
    expect(evalEnv(settings(), { temp: null, humidity: null, vpd: null }, false)).toBe(false);
  });

  it('null readings (was active) → deactivates (no sensor = no trigger)', () => {
    expect(evalEnv(settings(), { temp: null, humidity: null, vpd: null }, true)).toBe(false);
  });
});
```

- [ ] Run `npm test` — all tests pass.

---

## Task 10 — Ramp Engine + Tests

- [ ] Create `src/engines/rampEngine.ts`:

```ts
import type { LightSchedule } from '../store/types';
import { toMin, toSec } from '../utils/time';
import { isInWindow } from './scheduleEngine';

export type LightPhase = 'off' | 'sunrise' | 'on' | 'sunset';

export interface RampResult {
  phase: LightPhase;
  brightness: number; // 0–100 %; what to send to HA
  rampOk: boolean;    // false = ramp was interrupted; caller shows "Rampe unterbrochen"
}

/**
 * Pure ramp evaluation. Call every 5s.
 * @param schedule   light schedule settings
 * @param brightness target brightness (11–100 %)
 * @param nowSec     seconds since midnight
 * @param nowMin     minutes since midnight
 * @param lightIsOn  whether the HA light entity is currently on
 * @param rampOk     current rampOk state (false = interrupted by user or external off)
 */
export function evalRamp(
  schedule: LightSchedule,
  brightness: number,
  nowSec: number,
  nowMin: number,
  lightIsOn: boolean,
  rampOk: boolean,
): RampResult {
  const sm = toMin(schedule.start);
  const em = toMin(schedule.end);
  const inW = isInWindow(nowMin, sm, em);

  if (!inW) {
    return { phase: 'off', brightness: 0, rampOk };
  }

  const ss = toSec(schedule.start);
  const es = toSec(schedule.end);
  const elapsed  = ((nowSec - ss) + 86400) % 86400;
  const total    = ((es - ss) + 86400) % 86400;
  const toEnd    = total - elapsed;
  const rampUpSec   = schedule.rampUp * 60;
  const rampDownSec = schedule.rampDown * 60;

  // Detect ramp interruption: light entity turned off after sunrise completed
  let nextRampOk = rampOk;
  if (rampOk && !lightIsOn && elapsed >= rampUpSec) {
    nextRampOk = false;
  }

  // Sunset: last rampDownSec seconds of the window
  if (nextRampOk && rampDownSec > 0 && toEnd <= rampDownSec) {
    const pct = Math.max(0, Math.round(brightness * (toEnd / rampDownSec)));
    return { phase: 'sunset', brightness: pct, rampOk: nextRampOk };
  }

  // Sunrise: first rampUpSec seconds of the window
  if (nextRampOk && rampUpSec > 0 && elapsed < rampUpSec) {
    const pct = Math.max(0, Math.round(brightness * (elapsed / rampUpSec)));
    return { phase: 'sunrise', brightness: pct, rampOk: nextRampOk };
  }

  return { phase: 'on', brightness, rampOk: nextRampOk };
}
```

- [ ] Create `src/engines/rampEngine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { evalRamp } from './rampEngine';
import { toSec, toMin } from '../utils/time';
import type { LightSchedule } from '../store/types';

function sched(overrides: Partial<LightSchedule> = {}): LightSchedule {
  return { start: '06:00', end: '22:00', rampUp: 30, rampDown: 30, ...overrides };
}

const ns = (hhmm: string) => toSec(hhmm);
const nm = (hhmm: string) => toMin(hhmm);

describe('outside window → off', () => {
  it('before start', () => {
    const r = evalRamp(sched(), 100, ns('03:00'), nm('03:00'), false, true);
    expect(r.phase).toBe('off');
    expect(r.brightness).toBe(0);
  });

  it('after end', () => {
    const r = evalRamp(sched(), 100, ns('23:00'), nm('23:00'), false, true);
    expect(r.phase).toBe('off');
  });
});

describe('sunrise phase', () => {
  it('start of window → 0% brightness', () => {
    const r = evalRamp(sched(), 100, ns('06:00'), nm('06:00'), false, true);
    expect(r.phase).toBe('sunrise');
    expect(r.brightness).toBe(0);
  });

  it('halfway through sunrise (15 of 30 min) → 50%', () => {
    const r = evalRamp(sched(), 100, ns('06:15'), nm('06:15'), true, true);
    expect(r.phase).toBe('sunrise');
    expect(r.brightness).toBe(50);
  });

  it('end of sunrise → full brightness', () => {
    const r = evalRamp(sched(), 100, ns('06:29'), nm('06:29'), true, true);
    expect(r.phase).toBe('sunrise');
    expect(r.brightness).toBe(97); // 29/30 * 100
  });
});

describe('normal on phase', () => {
  it('midday → full brightness', () => {
    const r = evalRamp(sched(), 80, ns('12:00'), nm('12:00'), true, true);
    expect(r.phase).toBe('on');
    expect(r.brightness).toBe(80);
  });
});

describe('sunset phase', () => {
  it('30 min before end → starts sunset', () => {
    // rampDown=30min, end=22:00, so sunset starts at 21:30
    const r = evalRamp(sched(), 100, ns('21:30'), nm('21:30'), true, true);
    expect(r.phase).toBe('sunset');
    expect(r.brightness).toBe(100); // 30/30 * 100
  });

  it('halfway through sunset (15 of 30 min) → 50%', () => {
    const r = evalRamp(sched(), 100, ns('21:45'), nm('21:45'), true, true);
    expect(r.phase).toBe('sunset');
    expect(r.brightness).toBe(50);
  });
});

describe('ramp interruption', () => {
  it('light off during active window → rampOk becomes false', () => {
    // 12:00, well past sunrise, light is off → interrupted
    const r = evalRamp(sched(), 100, ns('12:00'), nm('12:00'), false, true);
    expect(r.rampOk).toBe(false);
    expect(r.phase).toBe('on'); // still sends full brightness
  });

  it('when rampOk=false → no sunrise/sunset, always full brightness', () => {
    const r = evalRamp(sched(), 100, ns('06:10'), nm('06:10'), true, false);
    expect(r.phase).toBe('on');
    expect(r.brightness).toBe(100);
  });
});
```

- [ ] Run `npm test` — all tests pass.

---

## Task 11 — Dial Component

- [ ] Create `src/components/Dial.tsx`:

```tsx
import { useRef, useCallback } from 'react';

const CX = 110, CY = 110, R = 85;
const S_ANG = 135;  // degrees — start angle of the arc
const T_ANG = 270;  // degrees — total sweep of the arc

function xy(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number): string {
  const s = xy(cx, cy, r, startDeg);
  const e = xy(cx, cy, r, startDeg + sweepDeg);
  const large = sweepDeg > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

function valToSweep(val: number, min: number, max: number): number {
  return ((val - min) / (max - min)) * T_ANG;
}

function degToVal(angleDeg: number, min: number, max: number): number {
  const a = ((angleDeg % 360) + 360) % 360;
  const rel = ((a - S_ANG) + 360) % 360;
  if (rel > T_ANG) return rel > T_ANG + (360 - T_ANG) / 2 ? min : max;
  return Math.round(min + (rel / T_ANG) * (max - min));
}

interface DialProps {
  value: number;
  min: number;
  max: number;
  color: string;
  label?: string;           // big center text (defaults to value + '%')
  onChange?: (v: number) => void;
  onChangeEnd?: (v: number) => void;
  disabled?: boolean;
}

export function Dial({ value, min, max, color, label, onChange, onChangeEnd, disabled }: DialProps) {
  const sw = valToSweep(Math.min(Math.max(value, min), max), min, max);
  const trackPath = arcPath(CX, CY, R, S_ANG, T_ANG);
  const valuePath = sw > 0 ? arcPath(CX, CY, R, S_ANG, Math.max(1, sw)) : '';
  const thumb = xy(CX, CY, R, S_ANG + sw);
  const isDragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    isDragging.current = true;
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }, [disabled]);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging.current) return;
    const rc = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const deg = Math.atan2(e.clientY - (rc.top + rc.height / 2), e.clientX - (rc.left + rc.width / 2)) * 180 / Math.PI;
    const v = degToVal(deg, min, max);
    onChange?.(v);
  }, [min, max, onChange]);

  const onPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const rc = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const deg = Math.atan2(e.clientY - (rc.top + rc.height / 2), e.clientX - (rc.left + rc.width / 2)) * 180 / Math.PI;
    const v = degToVal(deg, min, max);
    onChangeEnd?.(v);
  }, [min, max, onChangeEnd]);

  const strokeWidth = 14;
  const trackColor = 'rgba(255,255,255,0.08)';

  return (
    <svg
      viewBox={`0 0 ${CX * 2} ${CY * 2}`}
      style={{ width: 220, height: 220, touchAction: 'none', cursor: disabled ? 'default' : 'pointer', display: 'block' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Track */}
      <path d={trackPath} fill="none" stroke={trackColor} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* Value arc */}
      {valuePath && (
        <path d={valuePath} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      )}
      {/* Thumb */}
      <circle cx={thumb.x} cy={thumb.y} r={10} fill={color} />
      {/* Center label */}
      <text x={CX} y={CY - 8} textAnchor="middle" fill="#f5f5f5" fontSize={36} fontWeight="bold" fontFamily="sans-serif">
        {label ?? value}
      </text>
      <text x={CX} y={CY + 22} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={16} fontFamily="sans-serif">
        %
      </text>
    </svg>
  );
}
```

---

## Task 12 — ModeTab + InfoCard

- [ ] Create `src/components/ModeTab.tsx`:

```tsx
interface Tab {
  id: string;
  label: string;
}

interface ModeTabProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

export function ModeTab({ tabs, active, onChange }: ModeTabProps) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            flex: 1,
            padding: '8px 4px',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: active === t.id ? 700 : 400,
            cursor: 'pointer',
            background: active === t.id ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
            color: active === t.id ? '#f5f5f5' : 'rgba(255,255,255,0.5)',
            transition: 'all 0.15s',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] Create `src/components/InfoCard.tsx`:

```tsx
interface InfoCardProps {
  running: boolean;
  text: string;
}

export function InfoCard({ running, text }: InfoCardProps) {
  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: 10,
      background: running ? 'rgba(76,175,80,0.15)' : 'rgba(255,255,255,0.05)',
      border: `1px solid ${running ? 'rgba(76,175,80,0.4)' : 'rgba(255,255,255,0.08)'}`,
      color: running ? '#a5d6a7' : 'rgba(255,255,255,0.5)',
      fontSize: 14,
      lineHeight: '1.4',
    }}>
      {text}
    </div>
  );
}
```

---

## Task 13 — Blower Module

- [ ] Create `src/modules/blower/Blower.tsx`:

```tsx
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
import type { FanActiveMode, FanModuleSettings } from '../../store/types';

const MIN_SPEED = 25, MAX_SPEED = 100;
const CMD_GUARD_MS = 3000;
const THROTTLE_MS = 300;
const COLOR = '#03a9f4';

const MODES = [
  { id: 'off',         label: 'Aus' },
  { id: 'manual',      label: 'Manuell' },
  { id: 'zeitfenster', label: 'Zeitfenster' },
  { id: 'zyklus',      label: 'Zyklus' },
  { id: 'umwelt',      label: 'Umwelt' },
];

export function Blower() {
  const settings     = useSettingsStore((s) => s.settings);
  const updateBlower = useSettingsStore((s) => s.updateBlower);
  const blower       = settings.blower;
  const entities     = settings.entities;

  const fanEntity  = useEntity(entities.blower);
  const tempEntity = useEntity(entities.temp);
  const humEntity  = useEntity(entities.humidity);
  const vpdEntity  = useEntity(entities.vpd);

  const [umweltActive, setUmweltActive] = useState(false);
  const [dialDrag, setDialDrag] = useState<number | null>(null);
  const cmdGuardUntil = useRef(0);
  const lastCmdMs     = useRef(0);

  // ── Fan command dispatch ──────────────────────────────────────────────
  const sendFan = useCallback((pct: number) => {
    if (Date.now() < cmdGuardUntil.current) return;
    if (Date.now() - lastCmdMs.current < THROTTLE_MS) return;
    lastCmdMs.current = Date.now();
    cmdGuardUntil.current = Date.now() + CMD_GUARD_MS;

    const hass = useHassStore.getState().hass;
    if (!hass) return;
    const entityId = useSettingsStore.getState().settings.entities.blower;
    if (pct <= 0) {
      hass.callService('fan', 'turn_off', { entity_id: entityId }).catch(console.error);
    } else {
      hass.callService('fan', 'turn_on', { entity_id: entityId, percentage: Math.round(pct) }).catch(console.error);
    }
  }, []);

  // ── Evaluation (called every 10s) ────────────────────────────────────
  const evaluate = useCallback(() => {
    const { settings } = useSettingsStore.getState();
    const b = settings.blower;

    if (b.cardDisabled) return;

    // Auto-off timer
    if (b.autoOffUntil && Date.now() >= b.autoOffUntil) {
      updateBlower({ activeMode: 'off', autoOffUntil: null, manual: { ...b.manual, on: false } });
      sendFan(0);
      return;
    }

    if (b.activeMode === 'off') return;

    const nm = nowMin();
    switch (b.activeMode) {
      case 'manual':
        if (b.manual.on) sendFan(b.manual.speed);
        break;

      case 'zeitfenster': {
        const { start, end, speed, standby } = b.zeitfenster;
        sendFan(isInWindow(nm, toMin(start), toMin(end)) ? speed : standby);
        break;
      }

      case 'zyklus': {
        const result = evalCycle(b.zyklus, Date.now(), nm);
        if (result.nextState) {
          updateBlower({ zyklus: { ...b.zyklus, _state: result.nextState } });
        }
        sendFan(result.speed);
        break;
      }

      case 'umwelt': {
        const hass = useHassStore.getState().hass;
        const t = parseFloat(hass?.states[settings.entities.temp]?.state ?? 'NaN');
        const h = parseFloat(hass?.states[settings.entities.humidity]?.state ?? 'NaN');
        const v = settings.entities.vpd ? parseFloat(hass?.states[settings.entities.vpd]?.state ?? 'NaN') : null;
        const active = evalEnv(b.umwelt, { temp: t, humidity: h, vpd: v }, umweltActive);
        setUmweltActive(active);
        sendFan(active ? b.umwelt.speed : b.umwelt.standby);
        break;
      }
    }
  }, [sendFan, updateBlower, umweltActive]);

  useEffect(() => {
    evaluate();
    const id = setInterval(evaluate, 10_000);
    return () => clearInterval(id);
  }, [evaluate]);

  // ── Re-assertion: manual ON but fan is off ───────────────────────────
  const assertAttempts = useRef(0);
  const lastAssertMs   = useRef(0);
  useEffect(() => {
    if (blower.activeMode !== 'manual' || !blower.manual.on) { assertAttempts.current = 0; return; }
    if (fanEntity?.state !== 'off') { assertAttempts.current = 0; return; }
    if (assertAttempts.current >= 10) return;
    if (Date.now() - lastAssertMs.current < 3000) return;
    assertAttempts.current++;
    lastAssertMs.current = Date.now();
    sendFan(blower.manual.speed);
  }, [fanEntity?.state, blower.activeMode, blower.manual.on, blower.manual.speed, sendFan]);

  // ── Mode switch ───────────────────────────────────────────────────────
  function handleModeChange(mode: string) {
    const newMode = mode as FanActiveMode;
    updateBlower({ activeMode: newMode });
    if (newMode === 'off') {
      sendFan(0);
    }
  }

  // ── Manual toggle ────────────────────────────────────────────────────
  function handleToggle() {
    const newOn = !blower.manual.on;
    updateBlower({ manual: { ...blower.manual, on: newOn } });
    cmdGuardUntil.current = 0;
    if (newOn) {
      sendFan(blower.manual.speed);
    } else {
      sendFan(0);
      updateBlower({ autoOffUntil: null });
    }
  }

  // ── Dial drag ─────────────────────────────────────────────────────────
  function handleDrag(v: number) {
    const clamped = Math.max(MIN_SPEED, Math.min(MAX_SPEED, v));
    setDialDrag(clamped);
  }

  function handleDragEnd(v: number) {
    const clamped = Math.max(MIN_SPEED, Math.min(MAX_SPEED, v));
    setDialDrag(null);
    updateBlower({ manual: { ...blower.manual, speed: clamped } });
    cmdGuardUntil.current = 0;
    sendFan(clamped);
  }

  const isOn    = fanEntity?.state === 'on';
  const haPct   = Number(fanEntity?.attributes?.percentage ?? 0);
  const dialVal = dialDrag ?? blower.manual.speed;

  // ── Status info for current mode ──────────────────────────────────────
  function statusText(): { running: boolean; text: string } {
    const nm = nowMin();
    switch (blower.activeMode) {
      case 'off': return { running: false, text: 'Abluft aus' };
      case 'manual': {
        const base = blower.manual.on ? `AN · ${haPct}%` : 'AUS';
        if (blower.autoOffUntil) {
          const rem = blower.autoOffUntil - Date.now();
          if (rem > 0) return { running: blower.manual.on, text: `${base} · Aus in ${fmtMs(rem)}` };
        }
        return { running: blower.manual.on, text: base };
      }
      case 'zeitfenster': {
        const { start, end, speed, standby } = blower.zeitfenster;
        const inW = isInWindow(nm, toMin(start), toMin(end));
        return { running: inW, text: inW ? `Im Zeitfenster · ${speed}%` : `Standby · ${standby}%` };
      }
      case 'zyklus': {
        const st = blower.zyklus._state;
        const max = blower.zyklus.repetitions === 0 ? '∞' : blower.zyklus.repetitions;
        if (st.phase === 'run') {
          const left = Math.max(0, blower.zyklus.runtime * 60_000 - (Date.now() - (st.since ?? 0)));
          return { running: true, text: `Läuft · ${st.count + 1}/${max} · ${fmtMs(left)} übrig` };
        }
        if (st.phase === 'pause') {
          const left = Math.max(0, blower.zyklus.pause * 60_000 - (Date.now() - (st.since ?? 0)));
          return { running: false, text: `Pause · ${st.count}/${max} · weiter in ${fmtMs(left)}` };
        }
        return { running: false, text: `Wartet auf ${blower.zyklus.start}` };
      }
      case 'umwelt': {
        const t = parseFloat(tempEntity?.state ?? 'NaN');
        const h = parseFloat(humEntity?.state ?? 'NaN');
        const parts: string[] = [];
        if (!isNaN(t)) parts.push(`${t.toFixed(1)}°C`);
        if (!isNaN(h)) parts.push(`${Math.round(h)}%`);
        const base = parts.join(' · ');
        return { running: umweltActive, text: umweltActive ? `Aktiv · ${blower.umwelt.speed}% · ${base}` : `Standby · ${blower.umwelt.standby}% · ${base}` };
      }
    }
  }

  const status = statusText();

  return (
    <section style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: COLOR }}>Abluft</span>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: isOn ? '#4caf50' : '#666',
          display: 'inline-block',
        }} />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
          {isOn ? `AN · ${haPct}%` : 'AUS'}
        </span>
      </div>

      <ModeTab tabs={MODES} active={blower.activeMode} onChange={handleModeChange} />

      <InfoCard running={status.running} text={status.text} />

      {/* Manual mode controls */}
      {blower.activeMode === 'manual' && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Dial
            value={dialVal}
            min={MIN_SPEED}
            max={MAX_SPEED}
            color={COLOR}
            onChange={handleDrag}
            onChangeEnd={handleDragEnd}
          />
          <button
            onClick={handleToggle}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
              background: blower.manual.on ? COLOR : 'rgba(255,255,255,0.1)',
              color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {blower.manual.on ? '⏻  Ausschalten' : '⏻  Einschalten'}
          </button>
        </div>
      )}

      {/* Zeitfenster settings */}
      {blower.activeMode === 'zeitfenster' && (
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          <TimeInput label="Start" value={blower.zeitfenster.start}
            onChange={(v) => updateBlower({ zeitfenster: { ...blower.zeitfenster, start: v } })} />
          <TimeInput label="Ende" value={blower.zeitfenster.end}
            onChange={(v) => updateBlower({ zeitfenster: { ...blower.zeitfenster, end: v } })} />
          <SliderRow label="Geschwindigkeit" value={blower.zeitfenster.speed} min={MIN_SPEED} max={MAX_SPEED}
            onChange={(v) => updateBlower({ zeitfenster: { ...blower.zeitfenster, speed: v } })} />
          <SliderRow label="Standby" value={blower.zeitfenster.standby} min={0} max={MIN_SPEED}
            onChange={(v) => updateBlower({ zeitfenster: { ...blower.zeitfenster, standby: v } })} />
        </div>
      )}

      {/* Zyklus settings */}
      {blower.activeMode === 'zyklus' && (
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          <TimeInput label="Erster Start" value={blower.zyklus.start}
            onChange={(v) => updateBlower({ zyklus: { ...blower.zyklus, start: v } })} />
          <SliderRow label="Laufzeit (min)" value={blower.zyklus.runtime} min={1} max={120}
            onChange={(v) => updateBlower({ zyklus: { ...blower.zyklus, runtime: v } })} />
          <SliderRow label="Pause (min)" value={blower.zyklus.pause} min={1} max={120}
            onChange={(v) => updateBlower({ zyklus: { ...blower.zyklus, pause: v } })} />
          <SliderRow label="Wiederholungen (0=∞)" value={blower.zyklus.repetitions} min={0} max={20}
            onChange={(v) => updateBlower({ zyklus: { ...blower.zyklus, repetitions: v } })} />
          <SliderRow label="Geschwindigkeit" value={blower.zyklus.speed} min={MIN_SPEED} max={MAX_SPEED}
            onChange={(v) => updateBlower({ zyklus: { ...blower.zyklus, speed: v } })} />
          <SliderRow label="Standby" value={blower.zyklus.standby} min={0} max={MIN_SPEED}
            onChange={(v) => updateBlower({ zyklus: { ...blower.zyklus, standby: v } })} />
        </div>
      )}

      {/* Umwelt settings */}
      {blower.activeMode === 'umwelt' && (
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={blower.umwelt.useTemp}
              onChange={(e) => updateBlower({ umwelt: { ...blower.umwelt, useTemp: e.target.checked } })} />
            Temperatur verwenden
          </label>
          {blower.umwelt.useTemp && (
            <SliderRow label={`Max. Temp (${blower.umwelt.maxTemp}°C)`} value={blower.umwelt.maxTemp} min={18} max={40} step={0.5}
              onChange={(v) => updateBlower({ umwelt: { ...blower.umwelt, maxTemp: v } })} />
          )}
          <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={blower.umwelt.useHum}
              onChange={(e) => updateBlower({ umwelt: { ...blower.umwelt, useHum: e.target.checked } })} />
            Luftfeuchtigkeit verwenden
          </label>
          {blower.umwelt.useHum && (
            <SliderRow label={`Max. LF (${blower.umwelt.maxHum}%)`} value={blower.umwelt.maxHum} min={30} max={95}
              onChange={(v) => updateBlower({ umwelt: { ...blower.umwelt, maxHum: v } })} />
          )}
          <SliderRow label={`Hysterese (${blower.umwelt.hysteresis})`} value={blower.umwelt.hysteresis} min={0} max={5} step={0.1}
            onChange={(v) => updateBlower({ umwelt: { ...blower.umwelt, hysteresis: v } })} />
          <SliderRow label="Geschwindigkeit" value={blower.umwelt.speed} min={MIN_SPEED} max={MAX_SPEED}
            onChange={(v) => updateBlower({ umwelt: { ...blower.umwelt, speed: v } })} />
          <SliderRow label="Standby" value={blower.umwelt.standby} min={0} max={MIN_SPEED}
            onChange={(v) => updateBlower({ umwelt: { ...blower.umwelt, standby: v } })} />
        </div>
      )}
    </section>
  );
}

// ── Local helpers ──────────────────────────────────────────────────────────

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
      {label}
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, color: '#f5f5f5', padding: '4px 8px', fontSize: 14 }}
      />
    </label>
  );
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}

function SliderRow({ label, value, min, max, step = 1, onChange }: SliderRowProps) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span style={{ color: '#f5f5f5', fontWeight: 600 }}>{value}{typeof value === 'number' && max <= 100 && label.includes('%') || label.includes('Geschwindigkeit') || label.includes('Standby') ? '%' : ''}</span>
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: '#03a9f4' }}
      />
    </label>
  );
}
```

---

## Task 14 — Light Module

- [ ] Create `src/modules/light/Light.tsx`:

```tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useHassStore } from '../../ha/hassStore';
import { useEntity } from '../../ha/useEntity';
import { Dial } from '../../components/Dial';
import { InfoCard } from '../../components/InfoCard';
import { evalRamp } from '../../engines/rampEngine';
import { nowMin, nowSec, toMin } from '../../utils/time';
import { isInWindow } from '../../engines/scheduleEngine';
import type { LightMode, LightPhase } from '../../engines/rampEngine';

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
  const [wasInSched, setWasInSched] = useState(false);
  const [dialDrag, setDialDrag] = useState<number | null>(null);
  const cmdGuardUntil = useRef(0);
  const lastCmdMs     = useRef(0);
  const lastSentBri   = useRef<number | null>(null);

  // ── Send light command ────────────────────────────────────────────────
  const sendLight = useCallback((pct: number, force = false) => {
    if (!force && Date.now() < cmdGuardUntil.current) return;
    if (!force && Date.now() - lastCmdMs.current < THROTTLE_MS) return;
    if (!force && lastSentBri.current === pct) return; // de-dup
    lastCmdMs.current = Date.now();
    lastSentBri.current = pct;

    const hass = useHassStore.getState().hass;
    if (!hass) return;
    const entityId = useSettingsStore.getState().settings.entities.light;
    if (pct <= 0) {
      hass.callService('light', 'turn_off', { entity_id: entityId }).catch(console.error);
    } else {
      const brightness = Math.round(Math.min(Math.max(pct, 1), 100) * 2.55);
      hass.callService('light', 'turn_on', { entity_id: entityId, brightness }).catch(console.error);
    }
  }, []);

  // ── Schedule / ramp evaluation ────────────────────────────────────────
  const evaluate = useCallback(() => {
    const { settings } = useSettingsStore.getState();
    const ls = settings.light;
    if (ls.mode !== 'schedule') return;

    const nm = nowMin();
    const sm = toMin(ls.schedule.start), em = toMin(ls.schedule.end);
    const inW = isInWindow(nm, sm, em);

    // Fresh cycle: entering window resets rampOk
    setWasInSched((prev) => {
      if (inW && !prev) setRampOk(true);
      return inW;
    });

    const isOn = useHassStore.getState().hass?.states[settings.entities.light]?.state === 'on';

    setRampOk((currentRampOk) => {
      const result = evalRamp(
        ls.schedule, ls.brightness,
        nowSec(), nm,
        isOn ?? false,
        currentRampOk,
      );
      if (result.rampOk !== currentRampOk) return result.rampOk;
      sendLight(result.brightness);
      return currentRampOk;
    });
  }, [sendLight]);

  useEffect(() => {
    if (light.mode === 'schedule') {
      evaluate();
      const id = setInterval(evaluate, 5_000);
      return () => clearInterval(id);
    }
  }, [evaluate, light.mode]);

  // ── Mode switch ───────────────────────────────────────────────────────
  function handleModeChange(mode: string) {
    updateLight({ mode: mode as LightMode });
    if (mode === 'off') {
      cmdGuardUntil.current = 0;
      sendLight(0, true);
    }
  }

  // ── Manual toggle ────────────────────────────────────────────────────
  function handleToggle() {
    const isOn = lightEntity?.state === 'on';
    cmdGuardUntil.current = Date.now() + GUARD_MS;
    if (isOn) {
      sendLight(0, true);
    } else {
      const pct = Math.max(LIGHT_MIN, light.brightness);
      sendLight(pct, true);
    }
  }

  // ── Dial ──────────────────────────────────────────────────────────────
  function handleDrag(v: number) {
    setDialDrag(Math.max(LIGHT_MIN, Math.min(LIGHT_MAX, v)));
    cmdGuardUntil.current = Date.now() + GUARD_MS;
  }

  function handleDragEnd(v: number) {
    const clamped = Math.max(LIGHT_MIN, Math.min(LIGHT_MAX, v));
    setDialDrag(null);
    if (light.mode !== 'schedule') updateLight({ brightness: clamped });
    lastSentBri.current = null;
    cmdGuardUntil.current = 0;
    sendLight(clamped, true);
  }

  const isOn   = lightEntity?.state === 'on';
  const haBri  = Number(lightEntity?.attributes?.brightness ?? 0);
  const hasPct = Math.round(haBri / 2.55);
  const dialVal = dialDrag ?? light.brightness;

  function statusText(): { running: boolean; text: string } {
    if (light.mode === 'off') return { running: false, text: 'Licht aus' };
    if (light.mode === 'manual') return { running: !!isOn, text: isOn ? `AN · ${hasPct}%` : 'AUS' };
    // schedule
    if (!rampOk) return { running: false, text: 'Rampe unterbrochen — Zurücksetzen erforderlich' };
    const nm = nowMin();
    const sm = toMin(light.schedule.start), em = toMin(light.schedule.end);
    const inW = isInWindow(nm, sm, em);
    if (!inW) return { running: false, text: 'Licht aus (außerhalb Zeitplan)' };
    return { running: true, text: `Licht an · ${hasPct}%` };
  }

  const status = statusText();

  return (
    <section style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: COLOR }}>Licht</span>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: isOn ? '#4caf50' : '#666', display: 'inline-block' }} />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{isOn ? `AN · ${hasPct}%` : 'AUS'}</span>
      </div>

      {/* Mode tabs (Aus / Manuell / Zeitplan) */}
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

      {/* Ramp reset button */}
      {light.mode === 'schedule' && !rampOk && (
        <button onClick={() => { setRampOk(true); lastSentBri.current = null; evaluate(); }}
          style={{ marginTop: 8, padding: '6px 14px', borderRadius: 8, border: `1px solid ${COLOR}`, background: 'transparent', color: COLOR, cursor: 'pointer', fontSize: 13 }}>
          Rampe zurücksetzen
        </button>
      )}

      {/* Dial — manual mode only */}
      {light.mode === 'manual' && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Dial value={dialVal} min={LIGHT_MIN} max={LIGHT_MAX} color={COLOR}
            onChange={handleDrag} onChangeEnd={handleDragEnd} />
          <button onClick={handleToggle} style={{
            width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
            background: isOn ? COLOR : 'rgba(255,255,255,0.1)',
            color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}>
            {isOn ? '⏻  Ausschalten' : '⏻  Einschalten'}
          </button>
        </div>
      )}

      {/* Schedule settings */}
      {light.mode === 'schedule' && (
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          <TimeInput label="Einschalten" value={light.schedule.start}
            onChange={(v) => updateLight({ schedule: { ...light.schedule, start: v } })} />
          <TimeInput label="Ausschalten" value={light.schedule.end}
            onChange={(v) => updateLight({ schedule: { ...light.schedule, end: v } })} />
          <SliderRow label={`Sonnenaufgang (${light.schedule.rampUp} min)`} value={light.schedule.rampUp} min={0} max={120}
            onChange={(v) => updateLight({ schedule: { ...light.schedule, rampUp: v } })} />
          <SliderRow label={`Sonnenuntergang (${light.schedule.rampDown} min)`} value={light.schedule.rampDown} min={0} max={120}
            onChange={(v) => updateLight({ schedule: { ...light.schedule, rampDown: v } })} />
          <SliderRow label="Helligkeit" value={light.brightness} min={LIGHT_MIN} max={LIGHT_MAX}
            onChange={(v) => updateLight({ brightness: v })} />
        </div>
      )}
    </section>
  );
}

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
      {label}
      <input type="time" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, color: '#f5f5f5', padding: '4px 8px', fontSize: 14 }} />
    </label>
  );
}

function SliderRow({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
      <span>{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: COLOR }} />
    </label>
  );
}
```

---

## Task 15 — Humidifier Module

- [ ] Create `src/modules/humidifier/Humidifier.tsx`:

```tsx
import { useCallback, useRef } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useHassStore } from '../../ha/hassStore';
import { useEntity } from '../../ha/useEntity';
import { Dial } from '../../components/Dial';

const COLOR = '#03a9f4';
const GUARD_MS = 1000;
const THROTTLE_MS = 500;

export function Humidifier() {
  const settings          = useSettingsStore((s) => s.settings);
  const updateHumidifier  = useSettingsStore((s) => s.updateHumidifier);
  const target            = settings.humidifier.targetHumidity;
  const entities          = settings.entities;

  const humEntity  = useEntity(entities.humidifier);
  const humSensor  = useEntity(entities.humidity);

  const cmdGuardUntil = useRef(0);
  const lastCmdMs     = useRef(0);

  const sendTarget = useCallback((pct: number) => {
    if (Date.now() < cmdGuardUntil.current) return;
    if (Date.now() - lastCmdMs.current < THROTTLE_MS) return;
    lastCmdMs.current = Date.now();
    cmdGuardUntil.current = Date.now() + GUARD_MS;

    const hass = useHassStore.getState().hass;
    const entityId = useSettingsStore.getState().settings.entities.humidifier;
    hass?.callService('humidifier', 'set_humidity', { entity_id: entityId, humidity: Math.round(pct) })
      .catch(console.error);
  }, []);

  function handleDragEnd(v: number) {
    const clamped = Math.max(30, Math.min(90, v));
    updateHumidifier({ targetHumidity: clamped });
    cmdGuardUntil.current = 0;
    sendTarget(clamped);
  }

  function handleToggle() {
    const isOn = humEntity?.state === 'on';
    const hass = useHassStore.getState().hass;
    const entityId = settings.entities.humidifier;
    if (isOn) {
      hass?.callService('humidifier', 'turn_off', { entity_id: entityId }).catch(console.error);
    } else {
      hass?.callService('humidifier', 'turn_on', { entity_id: entityId }).catch(console.error);
    }
  }

  const isOn      = humEntity?.state === 'on';
  const currentHum = parseFloat(humSensor?.state ?? 'NaN');
  const haTarget  = Number(humEntity?.attributes?.humidity ?? target);

  return (
    <section style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: COLOR }}>Befeuchter</span>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: isOn ? '#4caf50' : '#666', display: 'inline-block' }} />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
          {isOn ? `AN · Ziel ${haTarget}%` : 'AUS'}
          {!isNaN(currentHum) ? ` · Aktuell ${Math.round(currentHum)}%` : ''}
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
```

---

## Task 16 — Circ Fan Module

The `Circ` module is identical in structure to `Blower` (same 4 modes, same engines). Re-use all engines; only change: entity key, color, MIN_SPEED=0 (circ can go to 0%).

- [ ] Create `src/modules/circ/Circ.tsx`:

Copy the full `Blower.tsx` implementation and make the following changes:
1. Replace all `updateBlower` with `updateCirc`, `settings.blower` with `settings.circ`, `blower` with `circ`.
2. Replace `entities.blower` with `entities.circ` in all service calls.
3. Change `const COLOR = '#4caf50';` (green).
4. Change `const MIN_SPEED = 0, MAX_SPEED = 100;` (circ can fully stop).
5. Change section header label to `'Umluft'`.
6. Remove the re-assertion logic (circ doesn't need it — only main blower does).

The result is a 1:1 parallel of Blower but for the circ fan. The shared engines (`evalCycle`, `evalEnv`, `isInWindow`) already accept `ZyklusSettings | UmweltSettings` generically, so no changes needed there.

---

## Task 17 — App Layout + Panel Entry

- [ ] Create `src/App.tsx`:

```tsx
import { Blower } from './modules/blower/Blower';
import { Light } from './modules/light/Light';
import { Humidifier } from './modules/humidifier/Humidifier';
import { Circ } from './modules/circ/Circ';
import { HassProvider } from './ha/HassProvider';

const CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; }
  input[type=range] { -webkit-appearance: none; appearance: none; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.15); outline: none; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; cursor: pointer; }
  input[type=time] { color-scheme: dark; }
`;

export function App() {
  return (
    <HassProvider>
      <style>{CSS}</style>
      <div style={{
        minHeight: '100vh',
        background: '#1c1c1e',
        color: '#f5f5f5',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: '16px',
        maxWidth: 600,
        margin: '0 auto',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, color: '#f5f5f5' }}>
          🌿 Growzelt
        </h1>
        <Blower />
        <Humidifier />
        <Light />
        <Circ />
      </div>
    </HassProvider>
  );
}
```

- [ ] Create `src/main.tsx`:

```tsx
import { createRoot, Root } from 'react-dom/client';
import { App } from './App';
import { setHass } from './ha/hassStore';
import type { HassObject } from './store/types';

// ── HA Custom Panel entry point ───────────────────────────────────────────
// HA injects `hass` via `set hass(h)` and calls `setConfig(c)` once.
class GrowTentPanel extends HTMLElement {
  private _root: Root | null = null;

  connectedCallback() {
    this.style.cssText = 'display:block;height:100%;overflow:auto';
    this._root = createRoot(this);
    this._root.render(<App />);
  }

  disconnectedCallback() {
    this._root?.unmount();
    this._root = null;
  }

  set hass(h: HassObject) {
    setHass(h);
  }

  // Required by HA panel interface
  setConfig(_config: unknown) {}
}

if (!customElements.get('grow-tent-panel')) {
  customElements.define('grow-tent-panel', GrowTentPanel);
}

// ── Dev mode: inject mock hass ────────────────────────────────────────────
if (import.meta.env.DEV) {
  import('./ha/mockHass').then(({ mockHass }) => {
    setHass(mockHass);
    // Simulate HA calling set hass every 3 seconds
    setInterval(() => setHass({ ...mockHass }), 3000);
  });

  // Mount directly to #root for dev
  const root = document.getElementById('root');
  if (root) {
    const panel = document.createElement('grow-tent-panel') as GrowTentPanel;
    root.appendChild(panel);
  }
}
```

---

## Task 18 — Build Config Verification + Dev Test

- [ ] Run `npm run dev` — browser opens at `http://localhost:5173`, panel renders with mock data, all 4 modules visible.
- [ ] Verify dial drag works (blower, humidifier, light, circ).
- [ ] Verify mode tab switching works for Blower (Aus → Manuell → Zeitfenster → Zyklus → Umwelt).
- [ ] Run `npm run build` — produces `dist/grow-tent-panel.js` as a single file (no separate chunk files).
- [ ] Verify file size is reasonable (< 500 KB unminified).

---

## Task 19 — Deployment

- [ ] Copy `dist/grow-tent-panel.js` to the HA `www/` directory on the HA host:
  ```
  /config/www/grow-tent-panel.js
  ```

- [ ] Add the following to `configuration.yaml` (HA must be restarted after):
  ```yaml
  panel_custom:
    - name: grow-tent-panel
      sidebar_title: Growzelt
      sidebar_icon: mdi:cannabis
      url_path: grow-tent-panel
      js_url: /local/grow-tent-panel.js
      module_url: /local/grow-tent-panel.js
      embed_iframe: false
      require_admin: false
  ```

- [ ] Restart Home Assistant.
- [ ] Navigate to the "Growzelt" sidebar entry — panel loads.
- [ ] Verify settings persist across page reload (HA user data storage).
- [ ] Verify settings sync between phone and PC (both show the same state within 5 seconds).

---

## Definition of Done

- [ ] All Vitest tests pass (`npm test`)
- [ ] `npm run build` produces a single `dist/grow-tent-panel.js`
- [ ] Panel loads in HA sidebar without errors
- [ ] All 4 modules (Blower, Humidifier, Light, Circ) render and respond to HA entity states
- [ ] Settings persist cross-device via `frontend/set_user_data`
- [ ] Entity IDs are configurable via the settings store (no hardcoded IDs in components)
