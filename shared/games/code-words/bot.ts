// What a Code Words bot asks its brain, what comes back, and how it turns the answer into a move.
// The brain (server/bots/codeWordsBrain.ts) is a model call; everything here is pure so it can be tested without one.

export type BotSkill = 'easy' | 'standard' | 'sharp';

export const BOT_SKILLS: BotSkill[] = ['easy', 'standard', 'sharp'];

/** A cipher bot needs a clue. It is told its own target and nothing about the other team's. */
export interface ClueRequest {
  kind: 'clue';
  /** Words still in play, the target among them. */
  words: string[];
  /** Words already played. Still off limits as clues. */
  spent: string[];
  target: string;
  skill: BotSkill;
}

/** A team's guesser bots need both clues read. They see what a human guesser sees: no targets. */
export interface GuessRequest {
  kind: 'guess';
  /** Words still in play, with their board index as `id`. */
  words: { id: number; word: string }[];
  ownClue: string | null;
  theirClue: string | null;
}

export type CodeWordsBotRequest = ClueRequest | GuessRequest;

/** Candidate clues, best first. The bot sends the first one the rules allow. */
export interface ClueThought {
  clues: string[];
}

/** Board indices, most likely first, for each clue. */
export interface GuessThought {
  own: number[];
  theirs: number[];
}

// How long a bot sits on its move, so it lands like a person's would. Each bot gets its own spot in the spread.
export const CLUE_WAIT_MS = 6000;
export const CLUE_SPREAD_MS = 8000;
export const PICK_WAIT_MS = 4000;
export const PICK_SPREAD_MS = 7000;
/** Between a bot's first pick, its second, and locking in. */
export const PICK_STEP_MS = 2500;

/**
 * Skill is how far down the brain's ranking a bot will stray. The numbers are the odds of
 * taking the 1st, 2nd, 3rd choice; a sharp bot always takes the top one.
 */
const CRACK_ODDS: Record<BotSkill, number[]> = {
  easy: [0.55, 0.3, 0.15],
  standard: [0.85, 0.12, 0.03],
  sharp: [1],
};
const INTERCEPT_ODDS: Record<BotSkill, number[]> = {
  easy: [0.45, 0.3, 0.25],
  standard: [0.7, 0.2, 0.1],
  sharp: [1],
};
/** How often a bot doesn't try to read the other team at all. */
const SKIP_INTERCEPT: Record<BotSkill, number> = { easy: 0.5, standard: 0.1, sharp: 0 };

/** A stable number in [0, 1) for a seed, so a bot's choices don't change each time it is asked. */
export function roll(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Mix the bits once more: FNV alone leaves similar seeds close together.
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function choose(ranked: number[], odds: number[], x: number): number | null {
  if (!ranked.length) return null;
  const weights = odds.slice(0, ranked.length);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i] / total;
    if (x < acc) return ranked[i];
  }
  return ranked[0];
}

/**
 * The two words a bot settles on, given its team's reading of the clues.
 * `playable` filters out anything the brain returned that is not a live board word.
 */
export function choosePicks(
  thought: unknown,
  skill: BotSkill,
  playable: (index: number) => boolean,
  rollFor: (salt: string) => number,
): { crack: number | null; intercept: number | null } {
  const ranked = (list: unknown) => [...new Set(Array.isArray(list) ? list : [])].filter((i): i is number => playable(i));
  const t = (thought ?? {}) as Partial<GuessThought>;
  const crack = choose(ranked(t.own), CRACK_ODDS[skill], rollFor('crack'));
  const intercept =
    rollFor('skip') < SKIP_INTERCEPT[skill]
      ? null
      : choose(ranked(t.theirs).filter((i) => i !== crack), INTERCEPT_ODDS[skill], rollFor('intercept'));
  return { crack, intercept };
}
