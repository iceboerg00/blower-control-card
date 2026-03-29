# HACS-Ready blower-control-card — Design Spec

**Date:** 2026-03-29
**Status:** Approved

## Goal

Publish `blower-control-card.js` as a HACS-installable Lovelace custom card so users can install and update it via HACS instead of manually uploading the JS file.

## Repository

- **GitHub user:** `iceboerg00`
- **Repo name:** `blower-control-card`
- **Visibility:** Public (required by HACS)
- **First release:** `v40.0.0`

## Repository Structure

```
blower-control-card/
├── blower-control-card.js        ← existing file, unchanged
├── hacs.json                     ← HACS metadata
├── README.md                     ← installation guide for HACS users
└── .github/
    └── workflows/
        └── release.yml           ← auto-release on git tag
```

## Files to Create

### `hacs.json`
```json
{
  "name": "Blower Control Card",
  "render_readme": true,
  "filename": "blower-control-card.js"
}
```

### `README.md`
Content:
- Short description of the card (grow tent environment controller)
- HACS installation instructions (custom repo → `iceboerg00/blower-control-card`, type Lovelace)
- Manual installation fallback
- Lovelace YAML config example with all supported entity options
- Screenshot placeholder

### `.github/workflows/release.yml`
Trigger: `push` of tags matching `v*.*.*`
Steps:
1. `actions/checkout@v4`
2. `softprops/action-gh-release@v2` — creates GitHub Release and attaches `blower-control-card.js` as asset

## Future Update Workflow

```bash
# Edit blower-control-card.js, bump BCC_VERSION
git add blower-control-card.js
git commit -m "chore: release v41.0.0"
git tag v41.0.0
git push && git push --tags
# GitHub Actions creates the release automatically
```

## Initial Setup Steps (one-time, manual)

Because `gh` CLI is not installed, the GitHub repo must be created manually:

1. Create all local files (`hacs.json`, `README.md`, `.github/workflows/release.yml`)
2. `git init && git add . && git commit -m "chore: initial HACS release v40.0.0"`
3. Create repo on github.com: `iceboerg00/blower-control-card` (public, no README)
4. `git remote add origin https://github.com/iceboerg00/blower-control-card.git`
5. `git push -u origin main`
6. `git tag v40.0.0 && git push --tags` → Actions creates first release

## HACS End-User Installation

HACS → three-dot menu → **Custom repositories** → add `iceboerg00/blower-control-card` as type **Lovelace** → install → add resource in Lovelace.
