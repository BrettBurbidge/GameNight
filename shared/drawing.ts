// Drawing primitives shared by every game with a canvas.

/** Drawing ops on a fixed 800×600 canvas. Strokes are streamed as begin + batched points. */
export type DrawOp =
  | { t: 'begin'; id: number; color: string; size: number; x: number; y: number }
  | { t: 'pts'; id: number; pts: number[] }
  | { t: 'fill'; x: number; y: number; color: string }
  | { t: 'undo' }
  | { t: 'clear' };

export const CANVAS_W = 800;
export const CANVAS_H = 600;

/** What the server relays for each accepted op. */
export interface StreamEvent {
  turnId: number;
  seq: number;
  op: DrawOp;
}

export interface StreamSnapshot {
  turnId: number;
  ops: { seq: number; op: DrawOp }[];
}

/** Checks and clamps an op from a client. Returns null for anything malformed. */
export function validOp(raw: unknown): DrawOp | null {
  if (!raw || typeof raw !== 'object') return null;
  const op = raw as Record<string, unknown>;
  const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : null);
  const color = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
  switch (op.t) {
    case 'begin': {
      const id = num(op.id, 1e9), x = num(op.x, CANVAS_W), y = num(op.y, CANVAS_H), size = num(op.size, 60), c = color(op.color);
      return id === null || x === null || y === null || !size || !c ? null : { t: 'begin', id, x, y, size, color: c };
    }
    case 'pts': {
      const id = num(op.id, 1e9);
      if (id === null || !Array.isArray(op.pts) || op.pts.length % 2 || op.pts.length > 400) return null;
      const pts = op.pts.map((v, i) => num(v, i % 2 ? CANVAS_H : CANVAS_W));
      return pts.some((v) => v === null) ? null : { t: 'pts', id, pts: pts as number[] };
    }
    case 'fill': {
      const x = num(op.x, CANVAS_W), y = num(op.y, CANVAS_H), c = color(op.color);
      return x === null || y === null || !c ? null : { t: 'fill', x, y, color: c };
    }
    case 'undo':
      return { t: 'undo' };
    case 'clear':
      return { t: 'clear' };
    default:
      return null;
  }
}

type Kept =
  | { kind: 'stroke'; id: number; begin: Extract<DrawOp, { t: 'begin' }>; pts: number[] }
  | { kind: 'fill'; op: Extract<DrawOp, { t: 'fill' }> };

/**
 * Boils a finished drawing down to what is left on the canvas: undone and cleared work is dropped,
 * each stroke becomes one `begin` plus one `pts`, and points closer than `minGap` pixels are thinned out.
 * An empty result means a blank canvas.
 */
export function compactOps(ops: DrawOp[], minGap = 3): DrawOp[] {
  let kept: Kept[] = [];
  const open = new Map<number, Extract<Kept, { kind: 'stroke' }>>();
  for (const op of ops) {
    switch (op.t) {
      case 'begin': {
        const stroke = { kind: 'stroke' as const, id: op.id, begin: op, pts: [] as number[] };
        kept.push(stroke);
        open.set(op.id, stroke);
        break;
      }
      case 'pts':
        open.get(op.id)?.pts.push(...op.pts);
        break;
      case 'fill':
        kept.push({ kind: 'fill', op });
        break;
      case 'undo': {
        const gone = kept.pop();
        if (gone?.kind === 'stroke') open.delete(gone.id);
        break;
      }
      case 'clear':
        kept = [];
        open.clear();
        break;
    }
  }

  const out: DrawOp[] = [];
  let id = 0;
  for (const item of kept) {
    if (item.kind === 'fill') {
      out.push(item.op);
      continue;
    }
    id++;
    out.push({ ...item.begin, id });
    const pts: number[] = [];
    let lx = item.begin.x;
    let ly = item.begin.y;
    for (let i = 0; i < item.pts.length; i += 2) {
      const x = item.pts[i];
      const y = item.pts[i + 1];
      const last = i === item.pts.length - 2;
      if (!last && Math.abs(x - lx) + Math.abs(y - ly) < minGap) continue;
      pts.push(x, y);
      lx = x;
      ly = y;
    }
    if (pts.length) out.push({ t: 'pts', id, pts });
  }
  return out;
}
