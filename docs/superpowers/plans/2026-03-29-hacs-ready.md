# HACS-Ready blower-control-card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `blower-control-card.js` as a HACS-installable Lovelace custom card at `iceboerg00/blower-control-card` with automatic GitHub Releases on git tag push.

**Architecture:** Three config files are added to the existing single-JS repo: `hacs.json` (HACS metadata), `README.md` (user-facing install guide), and `.github/workflows/release.yml` (GitHub Actions auto-release). No changes to the JS file itself. After initial setup, future updates require only bumping the version and pushing a tag.

**Tech Stack:** GitHub Actions (`actions/checkout@v4`, `softprops/action-gh-release@v2`), HACS Lovelace plugin format, Git

---

### Task 1: Create `hacs.json`

**Files:**
- Create: `hacs.json`

- [ ] **Step 1: Create the file**

```json
{
  "name": "Blower Control Card",
  "render_readme": true,
  "filename": "blower-control-card.js"
}
```

Save as `/c/Users/Mike/projekte/hacs.json`.

- [ ] **Step 2: Verify JSON is valid**

Run:
```bash
python -c "import json; json.load(open('hacs.json')); print('OK')"
```
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add hacs.json
git commit -m "chore: add hacs.json for HACS compatibility"
```

---

### Task 2: Create `README.md`

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create the file**

Save as `/c/Users/Mike/projekte/README.md` with this exact content:

```markdown
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
```

- [ ] **Step 2: Verify the file was created**

```bash
head -3 README.md
```
Expected: first three lines of the README.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with HACS installation instructions"
```

---

### Task 3: Create GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create the workflow file**

Save as `/c/Users/Mike/projekte/.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - "v*.*.*"

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: blower-control-card.js
          generate_release_notes: false
          body: |
            Install or update via HACS, or download `blower-control-card.js` manually.
```

- [ ] **Step 3: Verify YAML is valid**

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('OK')"
```
Expected output: `OK`
If Python yaml module missing, run: `pip install pyyaml`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add GitHub Actions auto-release workflow"
```

---

### Task 4: Initialize git and push to GitHub

**Files:** none new — git setup only

- [ ] **Step 1: Initialize git repo (if not already done)**

```bash
git init
git branch -M main
```

- [ ] **Step 2: Stage all files and make initial commit**

```bash
git add blower-control-card.js hacs.json README.md .github/ CLAUDE.md docs/
git status
```

Verify only expected files are staged (no secrets, no large binaries).

```bash
git commit -m "chore: initial HACS release v40.0.0"
```

- [ ] **Step 3: Create the GitHub repository**

Open https://github.com/new in your browser and fill in:
- **Repository name:** `blower-control-card`
- **Visibility:** Public
- **Initialize repository:** leave all checkboxes **unchecked** (no README, no .gitignore, no license)
- Click **Create repository**

- [ ] **Step 4: Add remote and push**

```bash
git remote add origin https://github.com/iceboerg00/blower-control-card.git
git push -u origin main
```

You will be prompted for GitHub credentials. Use your GitHub username and a [Personal Access Token](https://github.com/settings/tokens) (classic, `repo` scope) as the password.

- [ ] **Step 5: Verify push succeeded**

Open https://github.com/iceboerg00/blower-control-card in your browser. You should see all four files: `blower-control-card.js`, `hacs.json`, `README.md`, `.github/`.

---

### Task 5: Create first release tag

**Files:** none

- [ ] **Step 1: Create and push the v40.0.0 tag**

```bash
git tag v40.0.0
git push origin v40.0.0
```

- [ ] **Step 2: Verify GitHub Actions ran**

Open https://github.com/iceboerg00/blower-control-card/actions

Wait ~30 seconds. You should see a green checkmark on the "Release" workflow run.

- [ ] **Step 3: Verify the release was created**

Open https://github.com/iceboerg00/blower-control-card/releases

You should see release `v40.0.0` with `blower-control-card.js` attached as an asset.

---

### Task 6: Test HACS installation

- [ ] **Step 1: Add custom repository in HACS**

In Home Assistant:
1. Open HACS
2. Three-dot menu → **Custom repositories**
3. Repository: `iceboerg00/blower-control-card`
4. Category: **Lovelace**
5. Click **Add**

- [ ] **Step 2: Install the card**

In HACS → Frontend (or Lovelace) → search "Blower Control Card" → **Install** → confirm version `v40.0.0`

- [ ] **Step 3: Add resource and test card**

HACS should prompt to add the resource automatically. If not, add manually:
- **Settings → Dashboards → Resources** → `+` → URL: `/hacsfiles/blower-control-card/blower-control-card.js` → Type: **JavaScript module**

Add the card to a dashboard:
```yaml
type: custom:blower-control-card
```

Verify the card loads without errors in the browser console.

---

## Future Update Workflow

After any change to `blower-control-card.js`:

```bash
# 1. Bump BCC_VERSION in blower-control-card.js (e.g., v41)
git add blower-control-card.js
git commit -m "chore: release v41.0.0"
git tag v41.0.0
git push && git push --tags
# GitHub Actions creates the release automatically (~30s)
# HACS users see the update in HACS → Updates
```
