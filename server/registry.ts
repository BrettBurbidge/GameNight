import type { GameDefinition } from '../shared/game';
import { hearts } from '../shared/games/hearts/logic';
import { dontSayIt } from '../shared/games/dont-say-it/logic';

export const GAME_DEFINITIONS: Record<string, GameDefinition> = {
  [dontSayIt.id]: dontSayIt,
  [hearts.id]: hearts,
};
