import type { GameDefinition } from '../shared/game';
import { fourInARow } from '../shared/games/four-in-a-row/logic';
import { hearts } from '../shared/games/hearts/logic';
import { sketch } from '../shared/games/sketch/logic';
import { dontSayIt } from '../shared/games/dont-say-it/logic';

export const GAME_DEFINITIONS: Record<string, GameDefinition> = {
  [dontSayIt.id]: dontSayIt,
  [hearts.id]: hearts,
  [sketch.id]: sketch,
  [fourInARow.id]: fourInARow,
};
