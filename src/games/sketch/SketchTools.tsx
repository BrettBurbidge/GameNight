import type { RefObject } from 'react';
import type { SketchCanvasHandle, Tool } from './SketchCanvas';

export const COLORS = ['#111827', '#6b7280', '#ef4444', '#f97316', '#facc15', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#92400e', '#fde68a'];
export const SIZES = [4, 10, 22];

interface Props {
  tool: Tool;
  color: string;
  size: number;
  onTool(tool: Tool): void;
  onColor(color: string): void;
  onSize(size: number): void;
  canvas: RefObject<SketchCanvasHandle>;
}

/** The palette, brush sizes and undo/clear buttons that sit under a canvas you can draw on. */
export function SketchTools({ tool, color, size, onTool, onColor, onSize, canvas }: Props) {
  return (
    <div className="sk-tools panel">
      <div className="sk-colors">
        {COLORS.map((c) => (
          <button
            key={c}
            className={`sk-swatch ${color === c && tool !== 'eraser' ? 'on' : ''}`}
            style={{ background: c }}
            aria-label={`Colour ${c}`}
            onClick={() => {
              onColor(c);
              if (tool === 'eraser') onTool('brush');
            }}
          />
        ))}
      </div>
      <div className="sk-toolrow">
        {SIZES.map((s) => (
          <button key={s} className={`sk-size ${size === s ? 'on' : ''}`} onClick={() => onSize(s)} aria-label={`Brush size ${s}`}>
            <i style={{ width: s, height: s }} />
          </button>
        ))}
        <span className="sk-sep" />
        <button className={`btn btn-sm ${tool === 'brush' ? 'btn-primary' : ''}`} onClick={() => onTool('brush')}>✏️ Brush</button>
        <button className={`btn btn-sm ${tool === 'fill' ? 'btn-primary' : ''}`} onClick={() => onTool('fill')}>🪣 Fill</button>
        <button className={`btn btn-sm ${tool === 'eraser' ? 'btn-primary' : ''}`} onClick={() => onTool('eraser')}>🧽 Eraser</button>
        <span className="sk-sep" />
        <button className="btn btn-sm" onClick={() => canvas.current?.undo()} title="Undo (Ctrl/⌘+Z)">↶ Undo</button>
        <button className="btn btn-sm btn-danger" onClick={() => canvas.current?.clear()}>🗑 Clear</button>
      </div>
    </div>
  );
}
