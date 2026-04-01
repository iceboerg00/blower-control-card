import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { App } from './App';
import { setHass } from './ha/hassStore';
import type { HassObject } from './store/types';

// ── HA Custom Panel entry point ───────────────────────────────────────────
// HA injects `hass` via the `set hass(h)` setter after the element connects.
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
    // Simulate HA pushing state updates every 3 seconds
    setInterval(() => setHass({ ...mockHass }), 3000);
  });

  // Mount directly to #root div in index.html
  const root = document.getElementById('root');
  if (root && !root.firstChild) {
    const panel = document.createElement('grow-tent-panel');
    root.appendChild(panel);
  }
}
