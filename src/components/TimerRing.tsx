import './TimerRing.css';

/** Countdown ring. Colour comes from --active (falls back to the page accent); turns red for the last 10 seconds. */
export function TimerRing({ remaining, total, live, small }: { remaining: number; total: number; live: boolean; small?: boolean }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, remaining / total));
  const secs = Math.ceil(remaining / 1000);
  const urgent = live && secs <= 10;
  return (
    <div className={`timer ${urgent ? 'urgent' : ''} ${small ? 'small' : ''}`}>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} className="timer-track" />
        <circle cx="50" cy="50" r={r} className="timer-fill" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <span className="timer-text">{secs}</span>
    </div>
  );
}
