# blower-control-card — Improvements Design
Date: 2026-03-30

## Overview

Ten improvements across three categories: bug fixes, UX enhancements, and new features. All changes are in `blower-control-card.js` (single-file, no build step).

---

## Section 1: Bug Fixes

### BUG-1: Zyklus-Start 23:59 Edge Case
**Problem:** `_cycleInWindow()` checks `n >= sm && n < sm + 2`. When `sm = 1439` (23:59), `sm + 2 = 1441` — never reachable.
**Fix:** Replace with `(n - sm + 1440) % 1440 < 2` — works across midnight boundary.
**Scope:** Applies to both blower and circ fan cycle logic.

### BUG-2: Circ Fan snap10 Without Feedback
**Problem:** Dial shows 35%, but `snap10()` sends 40% — silent mismatch between display and actual command.
**Fix:** Apply `snap10()` immediately on drag end and update dial to show the snapped value before sending the command. User always sees the value that will be sent.

### BUG-3: Humidifier Dial Initialization
**Problem:** `_humTarget` defaults to 60 in constructor, real value loads later → brief flash of wrong value.
**Fix:** Initialize `_humTarget` directly from `_load()` result before first `_render()` call, so the initial paint uses the correct stored value.

### BUG-4: Hysteresis for Umwelt-Modus (was missing entirely)
**Problem:** Fan toggles on/off rapidly when sensor value oscillates around the threshold.
**Fix:** Fan turns ON when `value > threshold`. Fan turns OFF only when `value < threshold - hysteresis`. Same logic for temp, humidity, and VPD. Hysteresis is configurable (see FEAT-1).

---

## Section 2: UX Improvements

### UX-1: Command Guard Spinner
**Problem:** After sending a command, the UI is silently locked for ~2s. Users don't know if their input was received.
**Design:** During the guard period, a small SVG spinner appears in the dial center (rotating arc segment in module color: blue for blower, green for circ, amber for light). Spinner disappears when guard expires or HA confirms the new state. Applies to all four modules.

### UX-2: Zyklus-Anzeige Fix
**Problem:** During pause phase, display shows "Zyklus 0/4" — confusing.
**Fix:**
- During run: `"Zyklus 2/4 · X min übrig"`
- During pause: `"Pause · 2/4 · X min übrig"` (shows last completed cycle count)
- Consistent across blower and circ fan.

### UX-3: Licht-Ramp Recovery
**Problem:** If light is manually turned off mid-ramp, `_lightRampOk = false` permanently until mode switch. No UI feedback.
**Design:** When `_lightRampOk === false`, the light info line shows a yellow warning: *"Rampe unterbrochen"* + a small **"Zurücksetzen"** button inline. Clicking sets `_lightRampOk = true` and immediately re-enables ramp logic. No auto-recovery.

---

## Section 3: New Features

### FEAT-1: Configurable Hysteresis in Umwelt-Modus
**Where:** Umwelt tab of blower and circ fan, below existing threshold inputs.
**UI:** A numeric input field labeled "Hysterese" with default value `1.0`. Unit label adapts to context: `°C` for temp, `%` for humidity, `kPa` for VPD.
**Storage:** `settings.umwelt.hysteresis` (single value, applies to all active conditions).
**Behavior:** See BUG-4 for logic.

### FEAT-2: VPD as Umwelt Trigger
**Where:** Umwelt tab of blower and circ fan.
**UI:** New section "VPD" with a toggle (on/off) and a threshold number input (e.g. `1.2 kPa`). Only shown when a VPD sensor entity is configured.
**Logic:** Fan triggers when `vpd > maxVpd` (with hysteresis). Combined with existing temp/humidity conditions.
**Mode selection change:** The existing "Modus" selector (`temp` / `hum` / `both`) is replaced with three independent checkboxes: `Temperatur ✓`, `Feuchte ✓`, `VPD ✓`. Any checked condition can trigger the fan. All unchecked = fan never triggers.
**Storage:** `settings.umwelt.useVpd` (bool), `settings.umwelt.maxVpd` (number). Existing `settings.umwelt.mode` replaced by `settings.umwelt.useTemp` + `settings.umwelt.useHum` + `settings.umwelt.useVpd`.

### FEAT-3: Auto-off Timer for Manuell-Modus
**Where:** Manuell tab of blower and circ fan, below the speed dial.
**UI:** A dropdown: `Aus / 1h / 2h / 4h / 8h`. Defaults to `Aus`.
**Behavior:**
- When a duration is selected and the fan is running, a countdown appears in the status line: `"Manuell · Aus in 1h 42min"`.
- When the timer expires: fan turns off, dropdown resets to `Aus`.
- If fan is already off when timer is set: timer starts when fan is next turned on.
- If fan is manually turned off before timer expires: timer cancels, dropdown resets to `Aus`.
**Storage:** `settings.autoOffUntil` (Unix timestamp ms, null when inactive). Persisted in localStorage.

---

## Data / Schema Changes

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `settings.umwelt.hysteresis` | number | 1.0 | Shared across all conditions |
| `settings.umwelt.useTemp` | bool | true | Replaces `mode` field |
| `settings.umwelt.useHum` | bool | false | Replaces `mode` field |
| `settings.umwelt.useVpd` | bool | false | New |
| `settings.umwelt.maxVpd` | number | 1.2 | New |
| `settings.autoOffUntil` | number\|null | null | Blower manual auto-off |
| `settings.circ.autoOffUntil` | number\|null | null | Circ manual auto-off |

Migration: `_merge()` handles new keys gracefully (defaults fill in missing keys). However, the `mode` → `useTemp`/`useHum` rename requires an explicit one-time migration in `_load()`: if `saved.umwelt.mode` exists and `saved.umwelt.useTemp` is undefined, convert `mode: 'temp'` → `useTemp: true, useHum: false`; `mode: 'hum'` → `useTemp: false, useHum: true`; `mode: 'both'` → `useTemp: true, useHum: true`. Then delete the old `mode` key.

---

## Implementation Order

1. Bug fixes (BUG-1 through BUG-4) — isolated, low risk
2. UX-1 (spinner) — affects all modules
3. UX-2 (cycle display) — display only
4. UX-3 (ramp recovery button) — light tab only
5. FEAT-1 (hysteresis UI) — extends BUG-4
6. FEAT-2 (VPD trigger) — extends umwelt logic
7. FEAT-3 (auto-off timer) — new state + UI

Bump `BCC_VERSION` once after all changes, release as a single version.
