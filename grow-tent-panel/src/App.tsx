import { Blower } from './modules/blower/Blower';
import { Light } from './modules/light/Light';
import { Humidifier } from './modules/humidifier/Humidifier';
import { Circ } from './modules/circ/Circ';
import { HassProvider } from './ha/HassProvider';

const CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; }
  input[type=range] {
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: 2px;
    background: rgba(255,255,255,0.15);
    outline: none;
  }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    cursor: pointer;
  }
  input[type=time] { color-scheme: dark; }
  input[type=checkbox] { accent-color: #03a9f4; width: 16px; height: 16px; }
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
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 20px', color: '#f5f5f5' }}>
          Growzelt
        </h1>
        <Blower />
        <Humidifier />
        <Light />
        <Circ />
      </div>
    </HassProvider>
  );
}
