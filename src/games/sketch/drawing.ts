import { CANVAS_H, CANVAS_W, type DrawOp } from '../../../shared/games/sketch/types';

type Item =
  | { kind: 'stroke'; id: number; color: string; size: number; pts: number[] }
  | { kind: 'fill'; x: number; y: number; color: string };

/** Turns a stream of DrawOps into pixels. Undo and clear replay everything that's left. */
export class Drawing {
  private items: Item[] = [];
  private strokes = new Map<number, Extract<Item, { kind: 'stroke' }>>();

  constructor(private ctx: CanvasRenderingContext2D) {
    this.reset();
  }

  reset() {
    this.items = [];
    this.strokes.clear();
    this.blank();
  }

  apply(op: DrawOp) {
    switch (op.t) {
      case 'begin': {
        const stroke = { kind: 'stroke' as const, id: op.id, color: op.color, size: op.size, pts: [op.x, op.y] };
        this.items.push(stroke);
        this.strokes.set(op.id, stroke);
        this.drawStroke(stroke, 0);
        break;
      }
      case 'pts': {
        const stroke = this.strokes.get(op.id);
        if (!stroke) return;
        const from = stroke.pts.length - 2;
        stroke.pts.push(...op.pts);
        this.drawStroke(stroke, from);
        break;
      }
      case 'fill':
        this.items.push({ kind: 'fill', x: op.x, y: op.y, color: op.color });
        floodFill(this.ctx, op.x, op.y, op.color);
        break;
      case 'undo':
        this.items.pop();
        this.redraw();
        break;
      case 'clear':
        this.items = [];
        this.redraw();
        break;
    }
  }

  get isEmpty() {
    return this.items.length === 0;
  }

  private blank() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  private redraw() {
    this.blank();
    for (const item of this.items) {
      if (item.kind === 'stroke') this.drawStroke(item, 0);
      else floodFill(this.ctx, item.x, item.y, item.color);
    }
  }

  /** Draws a stroke from point index `from` (in the flat [x,y,...] array) to the end. */
  private drawStroke(stroke: Extract<Item, { kind: 'stroke' }>, from: number) {
    const { ctx } = this;
    const p = stroke.pts;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (p.length === 2) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], stroke.size / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(p[Math.max(0, from)], p[Math.max(1, from + 1)]);
    for (let i = Math.max(2, from + 2); i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.stroke();
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Scanline flood fill with a small tolerance so anti-aliased edges don't leave halos. */
export function floodFill(ctx: CanvasRenderingContext2D, sx: number, sy: number, hex: string) {
  const x0 = Math.floor(Math.min(CANVAS_W - 1, sx));
  const y0 = Math.floor(Math.min(CANVAS_H - 1, sy));
  const img = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  const d = img.data;
  const at = (x: number, y: number) => (y * CANVAS_W + x) * 4;
  const start = at(x0, y0);
  const target = [d[start], d[start + 1], d[start + 2]];
  const fill = hexToRgb(hex);
  if (target.every((v, i) => Math.abs(v - fill[i]) < 8)) return;
  const tolerance = 48;
  const matches = (i: number) =>
    Math.abs(d[i] - target[0]) <= tolerance && Math.abs(d[i + 1] - target[1]) <= tolerance && Math.abs(d[i + 2] - target[2]) <= tolerance;
  const paint = (i: number) => {
    d[i] = fill[0];
    d[i + 1] = fill[1];
    d[i + 2] = fill[2];
    d[i + 3] = 255;
  };
  const seen = new Uint8Array(CANVAS_W * CANVAS_H);
  const stack: number[] = [x0, y0];
  while (stack.length) {
    const y = stack.pop()!;
    let x = stack.pop()!;
    while (x >= 0 && matches(at(x, y)) && !seen[y * CANVAS_W + x]) x--;
    x++;
    let up = false;
    let down = false;
    while (x < CANVAS_W && matches(at(x, y)) && !seen[y * CANVAS_W + x]) {
      paint(at(x, y));
      seen[y * CANVAS_W + x] = 1;
      if (y > 0) {
        const m = matches(at(x, y - 1)) && !seen[(y - 1) * CANVAS_W + x];
        if (m && !up) stack.push(x, y - 1);
        up = m;
      }
      if (y < CANVAS_H - 1) {
        const m = matches(at(x, y + 1)) && !seen[(y + 1) * CANVAS_W + x];
        if (m && !down) stack.push(x, y + 1);
        down = m;
      }
      x++;
    }
  }
  ctx.putImageData(img, 0, 0);
}
