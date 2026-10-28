import type { ComponentType } from 'react';
import { HeartsBoard } from './hearts/HeartsBoard';
import { DontSayItBoard } from './dont-say-it/DontSayItBoard';
import type { BoardProps } from './types';

/** Client-side boards, keyed by catalog id. */
export const BOARDS: Record<string, ComponentType<BoardProps>> = {
  'dont-say-it': DontSayItBoard,
  hearts: HeartsBoard,
};
