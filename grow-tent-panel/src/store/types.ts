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
