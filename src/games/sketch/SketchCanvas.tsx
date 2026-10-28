import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { CANVAS_H, CANVAS_W, type DrawOp, type StreamEvent, type StreamSnapshot } from '../../../shared/games/sketch/types';
import { request, socket } from '../../lib/socket';
import { Drawing } from './drawing';

export type Tool = 'brush' | 'fill' | 'eraser';

export interface SketchCanvasHandle {
  undo(): void;
  clear(): void;
}

interface Props {
  turnId: number;
  canDraw: boolean;
  tool: Tool;
  color: string;
  size: number;
}

const FLUSH_MS = 40;

/**
 * The shared canvas. The drawer's strokes render locally and stream to the server;
 * everyone else applies the relayed ops in order, re-syncing if they miss any.
 */
export const SketchCanvas = forwardRef<SketchCanvasHandle, Props>(function SketchCanvas({ turnId, canDraw, tool, color, size }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Drawing | null>(null);
  const sync = useRef({ turnId, lastSeq: 0, syncing: false, buffer: [] as StreamEvent[] });
  const stroke = useRef<{ id: number; pending: number[]; lastX: number; lastY: number } | null>(null);
  const nextId = useRef(Math.floor(Date.now() % 1e8) * 10);

  const send = useCallback((op: DrawOp) => {
    drawing.current?.apply(op);
    socket.emit('game:stream', op);
  }, []);

  useImperativeHandle(ref, () => ({
    undo: () => send({ t: 'undo' }),
    clear: () => send({ t: 'clear' }),
  }), [send]);

  // (Re)build the picture from the server, then apply anything that arrived meanwhile.
  const resync = useCallback(async () => {
    const s = sync.current;
    s.syncing = true;
    s.buffer = [];
    const res = await request<{ data: StreamSnapshot | null }>('game:stream-sync');
    if (!res.ok || !res.data || res.data.turnId !== s.turnId) {
      s.syncing = false;
      return;
    }
    drawing.current?.reset();
    for (const { op } of res.data.ops) drawing.current?.apply(op);
    s.lastSeq = res.data.ops.at(-1)?.seq ?? 0;
    s.syncing = false;
    for (const ev of s.buffer.sort((a, b) => a.seq - b.seq)) {
      if (ev.seq === s.lastSeq + 1) {
        drawing.current?.apply(ev.op);
        s.lastSeq = ev.seq;
      }
    }
    s.buffer = [];
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d', { willReadFrequently: true })!;
    drawing.current = new Drawing(ctx);
  }, []);

  // New turn: blank canvas, then catch up (covers joining mid-turn and reconnects).
  useEffect(() => {
    sync.current.turnId = turnId;
    sync.current.lastSeq = 0;
    drawing.current?.reset();
    stroke.current = null;
    resync();
  }, [turnId, resync]);

  useEffect(() => {
    const onEvent = (ev: StreamEvent) => {
      const s = sync.current;
      if (ev.turnId !== s.turnId) return;
      if (s.syncing) return void s.buffer.push(ev);
      if (ev.seq <= s.lastSeq) return;
      if (ev.seq > s.lastSeq + 1) return void resync();
      drawing.current?.apply(ev.op);
      s.lastSeq = ev.seq;
    };
    const onReconnect = () => resync();
    socket.on('game:stream', onEvent);
    socket.on('connect', onReconnect);
    return () => {
      socket.off('game:stream', onEvent);
      socket.off('connect', onReconnect);
    };
  }, [resync]);

  // Batch outgoing points so a fast scribble doesn't flood the socket.
  useEffect(() => {
    if (!canDraw) return;
    const id = setInterval(() => flush(), FLUSH_MS);
    return () => clearInterval(id);
  });

  const flush = () => {
    const s = stroke.current;
    if (s && s.pending.length) {
      socket.emit('game:stream', { t: 'pts', id: s.id, pts: s.pending } satisfies DrawOp);
      s.pending = [];
    }
  };

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width) * CANVAS_W),
      y: Math.round(((e.clientY - rect.top) / rect.height) * CANVAS_H),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const { x, y } = toCanvas(e);
    if (tool === 'fill') {
      send({ t: 'fill', x, y, color });
      return;
    }
    canvasRef.current!.setPointerCapture(e.pointerId);
    const id = ++nextId.current;
    const strokeColor = tool === 'eraser' ? '#ffffff' : color;
    const strokeSize = tool === 'eraser' ? Math.max(size, 18) : size;
    stroke.current = { id, pending: [], lastX: x, lastY: y };
    send({ t: 'begin', id, x, y, size: strokeSize, color: strokeColor });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = stroke.current;
    if (!s || !canDraw) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const pts: number[] = [];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const { x, y } = toCanvas(ev);
      if (Math.abs(x - s.lastX) + Math.abs(y - s.lastY) < 2) continue;
      pts.push(x, y);
      s.lastX = x;
      s.lastY = y;
    }
    if (!pts.length) return;
    drawing.current?.apply({ t: 'pts', id: s.id, pts });
    s.pending.push(...pts);
    if (s.pending.length >= 300) flush();
  };

  const endStroke = () => {
    flush();
    stroke.current = null;
  };

  // Ctrl/Cmd+Z undoes while drawing.
  useEffect(() => {
    if (!canDraw) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        send({ t: 'undo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canDraw, send]);

  return (
    <canvas
      ref={canvasRef}
      className={`sk-canvas ${canDraw ? `can-draw tool-${tool}` : ''}`}
      width={CANVAS_W}
      height={CANVAS_H}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onLostPointerCapture={endStroke}
    />
  );
});
