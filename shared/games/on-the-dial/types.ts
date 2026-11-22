import type { PlayerId } from '../../types';

export type DialAction =
  /** Broadcaster: put the clue on air and open the dial to the tuners. */
  | { type: 'clue'; text: string }
  /** Broadcaster: trade the band (and signal) for a new one, once per round. */
  | { type: 'swap' }
  /** Tuner: move your needle; `lock` commits it for the round. */
  | { type: 'tune'; value: number; lock?: boolean }
  /** Anyone seated: skip the rest of the reveal. */
  | { type: 'next' };

export interface Band {
  left: string;
  right: string;
}

export interface RoundResult {
  /** Where the signal was, 0–100. */
  target: number;
  needles: Record<PlayerId, number>;
  /** Signal bars (0–5) each tuner picked up. */
  bars: Record<PlayerId, number>;
  /** The broadcaster's share: the tuners' average, rounded. */
  broadcasterBars: number;
}

export interface DialView {
  phase: 'clue' | 'tune' | 'reveal' | 'over';
  mode: 'versus' | 'coop';
  /** Seated players in broadcasting order. */
  order: PlayerId[];
  scores: Record<PlayerId, number>;
  /** Co-op: the shared score and the most it could be so far by the end. */
  teamScore: number;
  round: number;
  totalRounds: number;
  broadcasterId: PlayerId;
  band: Band;
  clue: string | null;
  endsAt: number | null;
  phaseSeconds: number;
  role: 'broadcaster' | 'tuner' | 'spectator';
  /** The hidden signal. Only the broadcaster gets it before the reveal. */
  target: number | null;
  canSwap: boolean;
  myNeedle: number | null;
  /** Tuners who have locked in (not where). */
  locked: PlayerId[];
  result: RoundResult | null;
  /** Versus: everyone tied for first once the game is over. */
  winners: PlayerId[];
}
