# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`blower-control-card.js` is a single-file Home Assistant custom Lovelace card (`custom:blower-control-card`) for controlling a grow tent environment. No build tools, no dependencies, no package.json — pure vanilla JavaScript with Web Components.

## Deployment

Copy the file to the Home Assistant `www/` directory (accessible at `/local/blower-control-card.js`), then add it as a Lovelace resource. There is no build step. Changes take effect after a browser hard-refresh.

To use in a Lovelace dashboard:
```yaml
type: custom:blower-control-card
entity: fan.your_blower       # optional — defaults to hardcoded entity IDs
temp: sensor.your_temp
humidity: sensor.your_humidity
vpd: sensor.your_vpd
humidifier: humidifier.your_humidifier
light: light.your_light
circ_fan: fan.your_circ_fan
module_order: [blower, humidifier, light, circ]  # optional, controls section order
```

Entity IDs can also be overridden at runtime via the ⚙ settings panel; they are persisted in `localStorage` under key `bcc3_entities__<entity>`.

## Architecture

Single `BlowerControlCard extends HTMLElement` class registered as `custom:blower-control-card`.

**HA Lifecycle hooks:**
- `setConfig(c)` — called once at card load; reads saved entities from `localStorage`, merges config, calls `_render()`
- `set hass(h)` — called by HA on every state update (~1–5 s); drives all sync, evaluation, and UI updates
- `connectedCallback / disconnectedCallback` — manage the 10-second `setInterval` for `_evaluate()`

**Render strategy:** `_render()` runs exactly once (scaffold). All subsequent updates mutate DOM elements by ID/class — never re-render the whole card. Tab switching replaces `#body` innerHTML via `_renderTab()`.

**State persistence:** `localStorage` key `bcc__<fan_entity_id>` holds the full settings object. The `_def()` method defines defaults; `_merge()` deep-merges saved state over defaults (safe for forward/backward schema changes).

## Control Modules

Four modules rendered in configurable order (`this._moduleOrder`):

| Module | Key | Color |
|--------|-----|-------|
| Blower (main fan) | `blower` | blue `#03a9f4` |
| Humidifier | `humidifier` | blue |
| Light | `light` | amber `#ffb300` |
| Circulation fan (Umluft) | `circ` | green `#4caf50` |

## Blower & Circ Fan Modes

Both fans share the same four modes (stored under `settings.activeMode` / `settings.circ.activeMode`):

- **`manual`** — direct on/off + speed control; re-assertion logic fights external overrides (up to 10 retries, 3 s cooldown)
- **`zeitfenster`** — time-window: full speed inside `start`–`end`, standby speed outside
- **`zyklus`** — cycle: runs for `runtime` minutes, pauses for `pause` minutes, repeats `repetitions` times starting at `start`
- **`umwelt`** — environment: activates when temp > `maxTemp` OR humidity > `maxHum` (mode `both`); uses `speed` when triggered, `standby` otherwise

## Light Modes

- **`off`** — always off
- **`manual`** — fixed brightness
- **`schedule`** — on between `start`–`end` with configurable ramp-up/ramp-down (minutes)

## SVG Dial

All four dials share the same geometry constants: `CX=110, CY=110, R=85`, start angle `S_ANG=135°`, total sweep `T_ANG=270°`. The blower dial range is `MIN=25`–`MAX=100` %; humidifier, light, and circ use 0–100 %.

## Key Design Decisions

- **Command guard (`_cmdGuardUntil`):** After sending a HA service call, dial sync from HA state is blocked for a guard period to prevent the UI bouncing back before HA confirms the change.
- **Throttling:** Fan commands ≤ 300 ms, humidifier ≤ 500 ms, light ≤ 100 ms via the `throttle()` utility.
- **`_syncHAMode()`** keeps the HA `fan` entity's preset/mode attribute aligned with the card's active mode.
- **Version string:** `BCC_VERSION` constant (top of file, e.g. `'v40'`) — bump this on every release; it appears in the card header and the console log.

## Publishing a New Release

The repo is published at `iceboerg00/blower-control-card` and installable via HACS. GitHub Actions automatically creates a release when a version tag is pushed.

```bash
# 1. Bump BCC_VERSION in blower-control-card.js (e.g. 'v41')
git add blower-control-card.js
git commit -m "chore: release v41.0.0"
git tag v41.0.0
git push && git push --tags
# GitHub Actions creates the release with the JS file attached (~30s)
```

HACS users will see the update appear automatically in HACS → Updates.

## UI Language

All user-visible labels are in **German** (e.g. "Manuell", "Zeitfenster", "Zyklus", "Umwelt", "AN/AUS"). Internal variable names and comments are a mix of German and English.
