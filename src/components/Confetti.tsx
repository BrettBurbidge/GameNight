import { motion } from 'framer-motion';
import { useMemo } from 'react';

const COLORS = ['#f472b6', '#38bdf8', '#a3e635', '#fbbf24', '#c084fc', '#fb7185'];

/** A one-shot confetti burst. Re-key it to fire again. */
export function Confetti({ count = 60 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 900,
        y: -200 - Math.random() * 400,
        r: Math.random() * 720 - 360,
        color: COLORS[i % COLORS.length],
        delay: Math.random() * 0.2,
        w: 6 + Math.random() * 6,
      })),
    [count],
  );
  return (
    <div style={{ position: 'fixed', left: '50%', top: '45%', pointerEvents: 'none', zIndex: 60 }}>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          style={{ position: 'absolute', width: p.w, height: p.w * 1.6, background: p.color, borderRadius: 2 }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 700], rotate: p.r, opacity: [1, 1, 0] }}
          transition={{ duration: 2.2, delay: p.delay, ease: 'easeOut', times: [0, 0.35, 1] }}
        />
      ))}
    </div>
  );
}
