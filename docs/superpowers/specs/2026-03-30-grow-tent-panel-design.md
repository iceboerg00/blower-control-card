# Grow Tent Panel — Design Spec

**Date:** 2026-03-30
**Status:** Approved

---

## Context

`blower-control-card.js` ist als Home Assistant Lovelace Custom Card an ihre Grenzen gestoßen: Single-file-Architektur, manuelles DOM-Patching, localStorage-Chaos, 255-Zeichen-Limits für Sync, keine Typsicherheit. Die gesamte Steuerungslogik ist solide und wird migriert — nur das Frontend wird neu aufgebaut.

**Ziel:** Dieselbe Funktionalität (4 Module, alle Modi, SpiderFarmer via HA-MQTT) als vollwertige Web-App, die als HA Panel (Sidebar-Eintrag) läuft. Keine Lovelace-Card-Beschränkungen mehr, korrekte Cross-Device-Sync, wartbarer Code.

---

## Stack

| Schicht | Technologie |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite |
| State | Zustand (mit custom HA-Storage) |
| HA-Verbindung | Custom Panel API (`hass`-Objekt) + `hass.callWS` |
| Deployment | `config/www/grow-panel/` + `panel_custom` in `configuration.yaml` |

---

## Architektur

```
HA Sidebar → "Grow Tent" Panel
│
├── GrowTentPanel (HTMLElement — HA Panel Entry)
│   └── React Root
│       ├── HassProvider        — hass-Objekt via Context
│       ├── SettingsProvider    — Zustand store
│       └── App
│           ├── Blower          — 4 Modi
│           ├── Humidifier
│           ├── Light           — Manual + Zeitplan + Rampe
│           └── Circ            — 4 Modi (identisch zu Blower)
│
└── HA WebSocket
    ├── Entity states (subscribeEntities via hass.connection)
    ├── Service calls (hass.callService)
    └── Settings sync (hass.callWS frontend/set_user_data)
```

**HA-Kommunikation:** Das Panel bekommt das `hass`-Objekt direkt von HA — kein manueller WebSocket-Connect, kein Auth-Token nötig. SpiderFarmer-Geräte werden via HA MQTT-Integration eingebunden und erscheinen als normale HA-Entities.

---

## Projektstruktur

```
grow-tent-panel/
├── src/
│   ├── ha/
│   │   ├── HassProvider.tsx       — hass-Objekt via React Context
│   │   ├── useEntity.ts           — Hook: einzelne Entity reaktiv beobachten
│   │   └── useHass.ts             — Hook: callService, callWS zugreifen
│   ├── store/
│   │   ├── settingsStore.ts       — Zustand store mit HA-Storage
│   │   ├── haStorage.ts           — frontend/set_user_data als Zustand-Storage
│   │   └── types.ts               — BlowerSettings, CircSettings, LightSettings…
│   ├── modules/
│   │   ├── blower/
│   │   │   ├── Blower.tsx
│   │   │   ├── cycleEngine.ts     — Zyklus-Logik (migriert aus _evC)
│   │   │   ├── scheduleEngine.ts  — Zeitfenster-Logik (migriert aus _evZ)
│   │   │   └── envEngine.ts       — Umwelt + Hysterese (migriert aus _evU)
│   │   ├── humidifier/
│   │   │   └── Humidifier.tsx
│   │   ├── light/
│   │   │   ├── Light.tsx
│   │   │   └── rampEngine.ts      — Rampe auf/ab (migriert aus _evalLight)
│   │   └── circ/
│   │       └── Circ.tsx           — nutzt dieselben Engines wie Blower
│   ├── components/
│   │   ├── Dial.tsx               — SVG-Regler (CX=110, CY=110, R=85, S_ANG=135°)
│   │   ├── ModeTab.tsx            — Tab-Leiste (Manual/Zeitfenster/Zyklus/Umwelt)
│   │   └── InfoCard.tsx           — Status-Anzeige (läuft/standby/pause)
│   ├── App.tsx                    — Layout, Modul-Reihenfolge konfigurierbar
│   └── main.tsx                   — Custom Element Entry für HA Panel
├── vite.config.ts                 — Output: einzelne grow-tent-panel.js
└── package.json
```

---

## Settings & Sync

**Zustand-Store** mit custom Storage-Adapter:

```ts
// haStorage.ts — Zustand-kompatibler Storage
getItem:  () => hass.callWS({ type: 'frontend/get_user_data', key: 'grow_tent' })
setItem:  (v) => hass.callWS({ type: 'frontend/set_user_data', key: 'grow_tent', value: v })
removeItem: () => hass.callWS({ type: 'frontend/set_user_data', key: 'grow_tent', value: null })
```

- Kein Size-Limit (HA-Datenbank)
- Per-User, funktioniert auf allen Geräten mit gleichem HA-Login
- Fallback: localStorage wenn HA nicht erreichbar
- Keine Helper-Entities, keine `configuration.yaml`-Einträge für Settings

---

## Module & Modi

### Blower + Circ (identische Modi)
| Modus | Beschreibung |
|---|---|
| Manual | An/Aus + Geschwindigkeit; Command Guard verhindert UI-Bounce |
| Zeitfenster | Vollgas zwischen start–end, Standby außerhalb |
| Zyklus | runtime min an, pause min aus, repetitions Wiederholungen ab start |
| Umwelt | Trigger: Temp/Feuchte/VPD (Checkboxen); Hysterese konfigurierbar |

### Light
| Modus | Beschreibung |
|---|---|
| Manual | Feste Helligkeit, An/Aus |
| Zeitplan | start–end mit Rampe auf (rampUp min) und Rampe ab (rampDown min) |

### Humidifier
Kein Modi-System — direktes Ziel-Feuchte-Dial (30–90%).

---

## Deployment

```bash
# Entwicklung (kein HA nötig — Mock-Entities)
npm run dev

# Produktion
npm run build
# → dist/grow-tent-panel.js nach config/www/grow-panel/ kopieren
```

```yaml
# configuration.yaml
panel_custom:
  - name: grow-tent-panel
    url_path: grow
    sidebar_title: Grow Tent
    sidebar_icon: mdi:sprout
    module_url: /local/grow-panel/grow-tent-panel.js
```

HA neu starten → Panel erscheint in der Sidebar.

---

## Migration

`blower-control-card.js` bleibt im Repo und wird nicht gelöscht. Das Panel ersetzt es schrittweise. Phasen:

1. **Setup** — Vite + React + TS + Zustand, Panel registrieren, HA-Verbindung testen
2. **HA-Layer** — `HassProvider`, `useEntity`, `useHass`, Settings-Store mit HA-Storage
3. **Dial-Komponente** — SVG-Regler (Geometrie aus bestehendem Card übernehmen)
4. **Blower-Modul** — alle 4 Modi + Engines (Referenzimplementierung)
5. **Light-Modul** — Zeitplan + Rampe
6. **Humidifier + Circ** — parallel umsetzbar nach Blower
7. **Produktiv schalten** — Panel aktivieren, alte Card optional deaktivieren

---

## Entities (Standard-Konfiguration)

| Gerät | Entity ID |
|---|---|
| Blower | `fan.schedule_4_real_cb_blower` |
| Temperatur | `sensor.schedule_4_real_cb_temperature` |
| Feuchte | `sensor.schedule_4_real_cb_humidity` |
| VPD | `sensor.schedule_4_real_cb_vpd` |
| Befeuchter | `humidifier.ihc_200_wifi` |
| Licht | `light.schedule_4_real_cb_light_1` |
| Umluft | `fan.schedule_4_real_cb_fan` |

Entity IDs bleiben konfigurierbar (Panel-Config oder Settings-UI).

---

## Verifikation

1. `npm run dev` → Panel lädt in Browser ohne HA (Mock-Entities)
2. Panel in HA öffnen → Entities zeigen echte Werte
3. Einstellung ändern → in HA Developer Tools prüfen: `frontend/get_user_data` gibt `key: grow_tent` zurück
4. Zweites Gerät öffnen → Settings werden automatisch geladen
5. Offline testen → localStorage-Fallback, kein Fehler
