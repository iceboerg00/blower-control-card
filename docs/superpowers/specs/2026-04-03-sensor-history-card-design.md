# Sensor History Card — Design Spec

**Date:** 2026-04-03  
**Status:** Approved

---

## Overview

A single-file Home Assistant Lovelace custom card (`custom:sensor-history-card`) that displays historical time-series data for three grow tent sensors — Temperature, Humidity, and VPD — using three stacked, synchronized Chart.js line charts.

Inspired by the chart components in [schedule-4-real](https://github.com/EddiePiazza/schedule-4-real), which uses Chart.js 4 + vue-chartjs. This card ports the core visualization pattern to vanilla JS / Web Components, matching the existing `blower-control-card.js` architecture.

---

## Architecture

**File:** `sensor-history-card.js`  
**Registration:** `customElements.define('sensor-history-card', SensorHistoryCard)`  
**Pattern:** Single `HTMLElement` subclass, Shadow DOM, no build tools, no dependencies bundled.

### Chart.js Loading

Chart.js 4 and the `chartjs-adapter-date-fns` are loaded dynamically at first render via `<script>` tags injected into the document head (not shadow DOM — Chart.js must be global). The card waits for both scripts to load before initializing charts.

```js
// Load order (sequential, not parallel — adapter depends on Chart.js)
1. https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js
2. https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3/dist/chartjs-adapter-date-fns.bundle.min.js
```

Both scripts are cached after first load; a module-level `_chartsLoaded` promise prevents double-loading across multiple card instances on the same dashboard.

### Data Source

HA History API, called via `this.hass.callApi()`:

```
GET /api/history/period/{startISO}
  ?filter_entity_id={temp},{humidity},{vpd}
  &minimal_response=true
  &no_attributes=true
```

- Called on card load and on every time-range button click.
- Not polled — historical data doesn't need live updates (current values come from `set hass()`).
- Response is an array of arrays (one per entity), each entry is `{ state, last_changed }`.
- States that are `"unavailable"` or `"unknown"` are filtered out before plotting.

### HA Lifecycle

| Hook | Responsibility |
|------|---------------|
| `setConfig(config)` | Store entity IDs and options; call `_render()` once |
| `set hass(h)` | Store hass reference; update current-value badges |
| `connectedCallback` | Restore saved range from localStorage; fetch history |
| `disconnectedCallback` | Destroy Chart.js instances to prevent memory leaks |

---

## UI Structure

```
┌─────────────────────────────────────────────┐
│ Grow Tent — History        [1h][6h][24h][7d] │
├─────────────────────────────────────────────┤
│ TEMPERATUR                        22.4 °C   │
│ ┌─────────────────────────────────────────┐ │
│ │  Chart.js Line (time x-axis, °C y-axis) │ │
│ └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│ LUFTFEUCHTIGKEIT                    58 %    │
│ ┌─────────────────────────────────────────┐ │
│ │  Chart.js Line (time x-axis, % y-axis)  │ │
│ └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│ VPD                               0.92 kPa  │
│ ┌─────────────────────────────────────────┐ │
│ │  Chart.js Line (time x-axis, kPa y-axis)│ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Time Range Selector

Four buttons in the card header: `1h`, `6h`, `24h`, `7d`.  
Active button highlighted. Selection persisted in `localStorage` under key `shc__range__{entityKey}` where `entityKey` is a short hash of the three configured entity IDs (ensures multiple card instances on different dashboards don't share range state).  
Default if nothing saved: `24h` (configurable via `default_range` in YAML).

### Crosshair Sync

A shared Chart.js plugin registers `onHover` on all three charts. When the pointer moves over any chart, a vertical line is drawn at the same x-position on the other two charts, and all three tooltips are shown simultaneously.

### Current Value Badges

Each chart section shows the latest sensor value (from `this.hass.states[entityId].state`) in the top-right corner. Updated on every `set hass()` call without redrawing the chart.

### Styling

- Dark background matching HA dark theme (`var(--card-background-color)`)
- Colors: Temp `#03a9f4`, Humidity `#4caf50`, VPD `#ffb300`
- Gradient fill under each line (matching schedule-4-real aesthetic)
- Chart grid lines: `rgba(255,255,255,0.07)`
- Font: inherits HA card font

---

## Lovelace Configuration

```yaml
type: custom:sensor-history-card
temp: sensor.grow_tent_temperature
humidity: sensor.grow_tent_humidity
vpd: sensor.grow_tent_vpd
title: Grow Tent        # optional, default "History"
default_range: 24h      # optional, one of: 1h, 6h, 24h, 7d
```

All three entity IDs are required. The card throws a clear error if any are missing.

---

## Deployment

Same as `blower-control-card.js`:

1. Copy `sensor-history-card.js` to HA `www/` directory
2. Add as Lovelace resource: `/local/sensor-history-card.js`
3. Hard-refresh browser

No build step. No package.json.

---

## Release Process

Same convention as `blower-control-card.js`:

1. Bump `SHC_VERSION` constant at top of file
2. `git add sensor-history-card.js && git commit -m "chore: release vX.0.0" && git tag vX.0.0 && git push && git push --tags`

---

## Explicit Non-Goals

- No day/night shading (requires `sun.sun` entity, extra complexity)
- No zoom or pan interaction
- No radar/phenotype charts
- No WebSocket live streaming (history is fetched on demand)
- No dependency on grow-tent-panel or blower-control-card
