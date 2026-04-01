import { useRef, useCallback } from 'react';

const CX = 110, CY = 110, R = 85;
const S_ANG = 135;  // degrees — start angle
const T_ANG = 270;  // degrees — total sweep

function xy(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number): string {
  const s = xy(cx, cy, r, startDeg);
  const e = xy(cx, cy, r, startDeg + sweepDeg);
  const large = sweepDeg > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

function valToSweep(val: number, min: number, max: number): number {
  return ((val - min) / (max - min)) * T_ANG;
}

function degToVal(angleDeg: number, min: number, max: number): number {
  const a = ((angleDeg % 360) + 360) % 360;
  const rel = ((a - S_ANG) + 360) % 360;
  if (rel > T_ANG) return rel > T_ANG + (360 - T_ANG) / 2 ? min : max;
  return Math.round(min + (rel / T_ANG) * (max - min));
}

interface DialProps {
  value: number;
  min: number;
  max: number;
  color: string;
  label?: string;           // center text (defaults to value)
  onChange?: (v: number) => void;
  onChangeEnd?: (v: number) => void;
  disabled?: boolean;
}

export function Dial({ value, min, max, color, label, onChange, onChangeEnd, disabled }: DialProps) {
  const clamped = Math.min(Math.max(value, min), max);
  const sw = valToSweep(clamped, min, max);
  const trackPath = arcPath(CX, CY, R, S_ANG, T_ANG);
  const valuePath = sw > 0 ? arcPath(CX, CY, R, S_ANG, Math.max(1, sw)) : '';
  const thumb = xy(CX, CY, R, S_ANG + sw);
  const isDragging = useRef(false);

  const getVal = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const rc = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const deg = Math.atan2(e.clientY - (rc.top + rc.height / 2), e.clientX - (rc.left + rc.width / 2)) * 180 / Math.PI;
    return degToVal(deg, min, max);
  }, [min, max]);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    isDragging.current = true;
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }, [disabled]);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging.current) return;
    onChange?.(getVal(e));
  }, [onChange, getVal]);

  const onPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    onChangeEnd?.(getVal(e));
  }, [onChangeEnd, getVal]);

  return (
    <svg
      viewBox={`0 0 ${CX * 2} ${CY * 2}`}
      style={{ width: 220, height: 220, touchAction: 'none', cursor: disabled ? 'default' : 'pointer', display: 'block' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={14} strokeLinecap="round" />
      {valuePath && (
        <path d={valuePath} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />
      )}
      <circle cx={thumb.x} cy={thumb.y} r={10} fill={color} />
      <text x={CX} y={CY - 8} textAnchor="middle" fill="#f5f5f5" fontSize={36} fontWeight="bold" fontFamily="sans-serif">
        {label ?? clamped}
      </text>
      <text x={CX} y={CY + 22} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={16} fontFamily="sans-serif">
        %
      </text>
    </svg>
  );
}
