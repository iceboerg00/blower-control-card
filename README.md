# Blower Control Card

A Home Assistant Lovelace custom card for controlling a grow tent environment: main blower fan, humidifier, grow light, and circulation fan — all from a single card with schedule, cycle, and environment-based automation modes.

## Installation via HACS

1. Open HACS in your Home Assistant instance
2. Click the three-dot menu → **Custom repositories**
3. Add `iceboerg00/blower-control-card` as type **Lovelace**
4. Click **Install**
5. Add the resource in Lovelace: **Settings → Dashboards → Resources** → add `/hacsfiles/blower-control-card/blower-control-card.js` as **JavaScript module**
6. Reload the browser

## Manual Installation

1. Download `blower-control-card.js` from the [latest release](https://github.com/iceboerg00/blower-control-card/releases/latest)
2. Copy it to `<config>/www/blower-control-card.js`
3. Add the resource in Lovelace: `/local/blower-control-card.js` as **JavaScript module**
4. Reload the browser

## Configuration

Add to your Lovelace dashboard:

```yaml
type: custom:blower-control-card
```

All entity IDs can be set via the ⚙ settings panel inside the card and are saved in the browser. Alternatively, set them in YAML:

```yaml
type: custom:blower-control-card
entity: fan.my_blower
temp: sensor.my_temperature
humidity: sensor.my_humidity
vpd: sensor.my_vpd
humidifier: humidifier.my_humidifier
light: light.my_grow_light
circ_fan: fan.my_circulation_fan
module_order:
  - blower
  - humidifier
  - light
  - circ
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `entity` | string | `fan.schedule_4_real_cb_blower` | Main blower fan entity |
| `temp` | string | `sensor.schedule_4_real_cb_temperature` | Temperature sensor |
| `humidity` | string | `sensor.schedule_4_real_cb_humidity` | Humidity sensor |
| `vpd` | string | `sensor.schedule_4_real_cb_vpd` | VPD sensor |
| `humidifier` | string | `humidifier.ihc_200_wifi` | Humidifier entity |
| `light` | string | `light.schedule_4_real_cb_light_1` | Grow light entity |
| `circ_fan` | string | `fan.schedule_4_real_cb_fan` | Circulation fan entity |
| `module_order` | list | `[blower, humidifier, light, circ]` | Order of sections in the card |

## Control Modes

Each fan supports four modes:

- **Manuell** — direct on/off with speed control
- **Zeitfenster** — full speed within a time window, standby speed outside
- **Zyklus** — runs for N minutes, pauses for N minutes, repeats
- **Umwelt** — activates when temperature or humidity exceeds a threshold

The light supports **Manuell** (fixed brightness) and **Zeitplan** (scheduled with ramp-up/ramp-down).
