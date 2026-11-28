import { useEffect, useRef } from 'react';
import { CANVAS_H, CANVAS_W, type DrawOp } from '../../../shared/drawing';
import { Drawing } from './drawing';

/** How long the replay of a finished drawing takes. */
const REPLAY_MS = 1400;

/**
 * A finished drawing, shown read-only. With `animate` it is redrawn stroke by stroke, the way it was made.
 * `ops` is undefined while the picture is still on its way from the server.
 */
export function DrawingView({ ops, animate = false }: { ops: DrawOp[] | undefined; animate?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d', { willReadFrequently: true })!;
    const drawing = new Drawing(ctx);
    if (!ops) return;
    if (!animate) {
      for (const op of ops) drawing.apply(op);
      return;
    }

    // Split long strokes into short runs so the line grows instead of popping in whole.
    const steps: DrawOp[] = [];
    for (const op of ops) {
      if (op.t !== 'pts') steps.push(op);
      else for (let i = 0; i < op.pts.length; i += 8) steps.push({ t: 'pts', id: op.id, pts: op.pts.slice(i, i + 8) });
    }
    let done = 0;
    let frame = 0;
    const started = performance.now();
    const paint = (now: number) => {
      const target = Math.ceil(Math.min(1, (now - started) / REPLAY_MS) * steps.length);
      while (done < target) drawing.apply(steps[done++]);
      if (done < steps.length) frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [ops, animate]);

  return <canvas ref={canvasRef} className="sk-canvas" width={CANVAS_W} height={CANVAS_H} />;
}
