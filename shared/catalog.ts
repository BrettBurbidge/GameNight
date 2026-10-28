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
  /**
   * `from`: below this many players everyone plays on one team (co-op).
   * `whenConfig`: teams only apply when the host picks this setting.
   */
  teams?: { names: string[]; colors: string[]; from?: number; whenConfig?: { key: string; value: string } };
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
    description:
      'One player draws a secret word on a live shared canvas while everyone else races to guess it. Play everyone-for-themselves at any size, or split 4+ players into teams with buzzer-beater steals.',
    emoji: '🎨',
    minPlayers: 2,
    maxPlayers: 12,
    minutes: '15–30',
    status: 'live',
    accent: ['#22c55e', '#eab308'],
    tags: ['Party', 'Drawing'],
    teams: { names: ['Team Ink', 'Team Paint'], colors: ['#38bdf8', '#facc15'], from: 4, whenConfig: { key: 'mode', value: 'teams' } },
    config: [
      {
        key: 'mode',
        label: 'Mode',
        default: 'ffa',
        options: [
          { value: 'ffa', label: 'Everyone for themselves' },
          { value: 'teams', label: 'Teams (4+)' },
        ],
      },
      {
        key: 'drawSeconds',
        label: 'Draw time',
        default: 80,
        options: [
          { value: 60, label: '60 sec' },
          { value: 80, label: '80 sec' },
          { value: 120, label: '120 sec' },
        ],
      },
      {
        key: 'rounds',
        label: 'Rounds',
        default: 3,
        options: [
          { value: 2, label: '2' },
          { value: 3, label: '3' },
          { value: 5, label: '5' },
        ],
      },
      {
        key: 'hints',
        label: 'Letter hints',
        default: 'on',
        options: [
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ],
      },
    ],
    howToPlay: [
      'Players take turns drawing. The drawer picks one of three words — easy, medium or hard.',
      'Everyone else types guesses. You see blanks for each letter, and a few letters appear as time runs down.',
      'Guess faster for more points (100–300). The drawer earns points for every player who gets it.',
      'Teams mode (4+): only the drawer’s team guesses. If time runs out, the other team gets 10 seconds to steal for 150 points.',
      'Most points after the last round wins.',
    ],
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
    id: 'four-in-a-row',
    name: 'Four in a Row',
    tagline: 'Drop discs. Line up four.',
    description:
      'The quick head-to-head classic. Challenge a friend, or play solo against a bot from easy to genuinely tough. Anyone else who joins can watch.',
    emoji: '🔴',
    minPlayers: 1,
    maxPlayers: 2,
    minutes: '5–15',
    status: 'live',
    accent: ['#ef4444', '#facc15'],
    tags: ['Strategy', '1v1', 'Bots'],
    bots: true,
    fillWithBots: true,
    config: [
      {
        key: 'bestOf',
        label: 'Match',
        default: 3,
        options: [
          { value: 1, label: 'Single game' },
          { value: 3, label: 'Best of 3' },
          { value: 5, label: 'Best of 5' },
        ],
      },
      {
        key: 'difficulty',
        label: 'Bot difficulty',
        default: 'medium',
        options: [
          { value: 'easy', label: 'Easy' },
          { value: 'medium', label: 'Medium' },
          { value: 'hard', label: 'Hard' },
        ],
      },
    ],
    howToPlay: [
      'Take turns dropping a disc into one of the seven columns. It falls to the lowest open spot.',
      'Line up four of your colour — across, up and down, or diagonally — to win the game.',
      'Fill the board with no four in a row and it’s a draw.',
      'In a match, players take turns going first. First to win the majority takes the match.',
      'Tip: on your turn, press 1–7 to drop in a column.',
    ],
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
