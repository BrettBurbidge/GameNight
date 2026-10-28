// The game catalog drives the home page, game pages, lobby rules and settings UI.
// Adding a game = add an entry here, a GameDefinition on the server, and a board on the client.

export interface ConfigOption {
  key: string;
  label: string;
  options: { value: string | number; label: string }[];
  default: string | number;
}

export interface GameMeta {
  id: string;
  name: string;
  tagline: string;
  description: string;
  emoji: string;
  minPlayers: number;
  maxPlayers: number;
  minutes: string;
  status: 'live' | 'soon';
  /** Two-stop gradient used for the game's cards, buttons and highlights. */
  accent: [string, string];
  tags: string[];
  /** Host can add bots in the lobby. */
  bots?: boolean;
  /** Empty seats are filled with bots when the game starts. */
  fillWithBots?: boolean;
  /** `from`: below this many players everyone plays on one team (co-op). */
  teams?: { names: string[]; colors: string[]; from?: number };
  config?: ConfigOption[];
  howToPlay?: string[];
}

export const GAMES: GameMeta[] = [
  {
    id: 'dont-say-it',
    name: 'Don’t Say It!',
    tagline: 'Describe the word. Dodge the forbidden ones.',
    description:
      'Race the clock to get your team to say the secret word — without using any of the forbidden words on the card. Two or three players team up co-op; four or more split into rival teams.',
    emoji: '🤐',
    minPlayers: 2,
    maxPlayers: 16,
    minutes: '20–40',
    status: 'live',
    accent: ['#f97316', '#ec4899'],
    tags: ['Party', 'Teams', 'Words'],
    teams: { names: ['Team Blaze', 'Team Tide'], colors: ['#fb7185', '#38bdf8'], from: 4 },
    config: [
      {
        key: 'turnSeconds',
        label: 'Turn length',
        default: 60,
        options: [
          { value: 45, label: '45 sec' },
          { value: 60, label: '60 sec' },
          { value: 90, label: '90 sec' },
        ],
      },
      {
        key: 'rounds',
        label: 'Rounds',
        default: 4,
        options: [
          { value: 2, label: '2 (quick)' },
          { value: 4, label: '4' },
          { value: 6, label: '6' },
          { value: 8, label: '8 (marathon)' },
        ],
      },
      {
        key: 'skipPenalty',
        label: 'Skipping a card',
        default: 1,
        options: [
          { value: 0, label: 'Free' },
          { value: 1, label: '−1 point' },
        ],
      },
    ],
    howToPlay: [
      'With 4+ players, split into two teams that take turns. With 2–3 players, everyone plays together on one team and chases a high score.',
      'Each turn a new player is the clue giver.',
      'The clue giver sees a secret word plus five forbidden words. Describe the word — by voice on your call, or by typing clues.',
      'Teammates type guesses. A correct guess scores +1 and deals the next card.',
      'Typed clues containing a forbidden word are buzzed automatically. The other team can also hit BUZZ if they hear one.',
      'After the last round, the highest-scoring team wins (or, co-op, try to beat your best).',
    ],
  },
  {
    id: 'hearts',
    name: 'Hearts',
    tagline: 'Duck the hearts. Fear the Queen of Spades.',
    description:
      'The classic four-player trick-taking card game. Avoid taking hearts and the Queen of Spades — or take them all and shoot the moon. Missing players are filled with bots.',
    emoji: '♥️',
    minPlayers: 1,
    maxPlayers: 4,
    minutes: '20–30',
    status: 'live',
    accent: ['#ef4444', '#a855f7'],
    tags: ['Cards', 'Classic', 'Bots'],
    bots: true,
    fillWithBots: true,
    config: [
      {
        key: 'targetScore',
        label: 'Game ends at',
        default: 100,
        options: [
          { value: 50, label: '50 points' },
          { value: 100, label: '100 points' },
        ],
      },
      {
        key: 'botSpeed',
        label: 'Bot speed',
        default: 'normal',
        options: [
          { value: 'fast', label: 'Fast' },
          { value: 'normal', label: 'Normal' },
          { value: 'chill', label: 'Chill' },
        ],
      },
    ],
    howToPlay: [
      'Each hand, pass three cards (left, right, across, then hold).',
      'Whoever holds the 2♣ leads the first trick. You must follow suit if you can.',
      'Hearts cannot be led until a heart has been played (hearts are “broken”).',
      'Each heart you take is 1 point; the Queen of Spades is 13. Low score wins.',
      'Take every heart and the Queen and you shoot the moon: everyone else gets 26.',
    ],
  },

  // ---- Roadmap: each of these plugs into the same lobby / invite / bot framework ----
  {
    id: 'spades',
    name: 'Spades',
    tagline: 'Bid your tricks, partner up, spades are always trump.',
    description: 'Partnership trick-taking with bids, nils and bags. Bots fill empty seats.',
    emoji: '♠️',
    minPlayers: 1,
    maxPlayers: 4,
    minutes: '30–45',
    status: 'soon',
    accent: ['#3b82f6', '#22d3ee'],
    tags: ['Cards', 'Teams', 'Bots'],
  },
  {
    id: 'codewords',
    name: 'Code Words',
    tagline: 'One-word clues, a grid of 25 words, one assassin.',
    description: 'Spymasters link words on a 5×5 grid with a single clue while their team guesses — and avoids the assassin.',
    emoji: '🕵️',
    minPlayers: 4,
    maxPlayers: 12,
    minutes: '15–25',
    status: 'soon',
    accent: ['#ef4444', '#3b82f6'],
    tags: ['Party', 'Teams', 'Words'],
  },
  {
    id: 'sketch',
    name: 'Sketch It',
    tagline: 'Draw it fast. Guess it faster.',
    description: 'A live shared canvas: one player draws, everyone races to guess. Points for speed.',
    emoji: '🎨',
    minPlayers: 3,
    maxPlayers: 12,
    minutes: '15–30',
    status: 'soon',
    accent: ['#22c55e', '#eab308'],
    tags: ['Party', 'Drawing'],
  },
  {
    id: 'wavelength',
    name: 'On the Dial',
    tagline: 'Read your friends’ minds on a spectrum.',
    description: 'A hidden target sits on a dial between two extremes. The psychic gives a clue; the team turns the dial.',
    emoji: '📡',
    minPlayers: 2,
    maxPlayers: 12,
    minutes: '20–30',
    status: 'soon',
    accent: ['#14b8a6', '#8b5cf6'],
    tags: ['Party', 'Co-op'],
  },
  {
    id: 'spyfall',
    name: 'Who’s the Spy?',
    tagline: 'Everyone knows the location — except one.',
    description: 'Ask sly questions to unmask the spy before they figure out where you are.',
    emoji: '🕶️',
    minPlayers: 3,
    maxPlayers: 10,
    minutes: '10–15',
    status: 'soon',
    accent: ['#64748b', '#f43f5e'],
    tags: ['Social deduction'],
  },
  {
    id: 'werewolf',
    name: 'Werewolf',
    tagline: 'Night falls. Someone in the village is not who they seem.',
    description: 'Hidden roles, night actions and daytime votes, with an automated narrator.',
    emoji: '🐺',
    minPlayers: 5,
    maxPlayers: 16,
    minutes: '20–40',
    status: 'soon',
    accent: ['#6366f1', '#0ea5e9'],
    tags: ['Social deduction'],
  },
  {
    id: 'liars-dice',
    name: 'Liar’s Dice',
    tagline: 'Bluff about the dice under every cup.',
    description: 'Bid on how many dice show a face across the table — or call your rival a liar.',
    emoji: '🎲',
    minPlayers: 2,
    maxPlayers: 6,
    minutes: '10–20',
    status: 'soon',
    accent: ['#f59e0b', '#ef4444'],
    tags: ['Dice', 'Bluffing', 'Bots'],
  },
  {
    id: 'euchre',
    name: 'Euchre',
    tagline: 'Bowers, trump calls and going alone.',
    description: 'The fast Midwest partnership classic with a 24-card deck. Bots fill empty seats.',
    emoji: '🃏',
    minPlayers: 1,
    maxPlayers: 4,
    minutes: '15–25',
    status: 'soon',
    accent: ['#10b981', '#3b82f6'],
    tags: ['Cards', 'Teams', 'Bots'],
  },
  {
    id: 'crazy-eights',
    name: 'Crazy Eights',
    tagline: 'Match the suit or rank. Eights are wild.',
    description: 'Shed your hand first with skips, reverses and draw-twos in this fast family favourite.',
    emoji: '🎴',
    minPlayers: 2,
    maxPlayers: 8,
    minutes: '10–20',
    status: 'soon',
    accent: ['#ec4899', '#f97316'],
    tags: ['Cards', 'Family', 'Bots'],
  },
  {
    id: 'trivia',
    name: 'Trivia Showdown',
    tagline: 'Buzz in. Bet big. Bragging rights.',
    description: 'Category rounds with wagers and a lightning final. Great for big groups.',
    emoji: '🧠',
    minPlayers: 2,
    maxPlayers: 20,
    minutes: '15–30',
    status: 'soon',
    accent: ['#a855f7', '#06b6d4'],
    tags: ['Party', 'Quiz'],
  },
  {
    id: 'word-grid',
    name: 'Word Grid',
    tagline: 'Shake the letters. Find the words.',
    description: 'Everyone gets the same 4×4 letter grid and three minutes. Unique words score big.',
    emoji: '🔤',
    minPlayers: 1,
    maxPlayers: 10,
    minutes: '5–10',
    status: 'soon',
    accent: ['#84cc16', '#14b8a6'],
    tags: ['Words', 'Speed'],
  },
  {
    id: 'dice-royale',
    name: 'Dice Royale',
    tagline: 'Five dice, three rolls, thirteen boxes.',
    description: 'Roll for straights, full houses and five-of-a-kinds on a shared scorecard.',
    emoji: '🎯',
    minPlayers: 1,
    maxPlayers: 6,
    minutes: '15–30',
    status: 'soon',
    accent: ['#f43f5e', '#f59e0b'],
    tags: ['Dice', 'Family', 'Bots'],
  },
  {
    id: 'connect-four',
    name: 'Four in a Row',
    tagline: 'Drop discs. Line up four.',
    description: 'The quick head-to-head classic with slick drop animations and a bot opponent.',
    emoji: '🔴',
    minPlayers: 1,
    maxPlayers: 2,
    minutes: '5',
    status: 'soon',
    accent: ['#ef4444', '#facc15'],
    tags: ['Strategy', '1v1', 'Bots'],
  },
  {
    id: 'gin-rummy',
    name: 'Gin Rummy',
    tagline: 'Meld your sets, knock, and go gin.',
    description: 'Two-player rummy with knocking, undercuts and a sharp bot to practise against.',
    emoji: '🍸',
    minPlayers: 1,
    maxPlayers: 2,
    minutes: '15–20',
    status: 'soon',
    accent: ['#0ea5e9', '#22c55e'],
    tags: ['Cards', '1v1', 'Bots'],
  },
];

export function getGameMeta(id: string): GameMeta | undefined {
  return GAMES.find((g) => g.id === id);
}

export function defaultConfig(meta: GameMeta): Record<string, string | number> {
  return Object.fromEntries((meta.config ?? []).map((o) => [o.key, o.default]));
}
