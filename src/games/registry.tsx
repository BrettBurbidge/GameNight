import type { ComponentType } from 'react';
import { FourBoard } from './four-in-a-row/FourBoard';
import { HeartsBoard } from './hearts/HeartsBoard';
import { SketchBoard } from './sketch/SketchBoard';
import { DontSayItBoard } from './dont-say-it/DontSayItBoard';
import type { BoardProps } from './types';

/** Client-side boards, keyed by catalog id. */
export const BOARDS: Record<string, ComponentType<BoardProps>> = {
  'dont-say-it': DontSayItBoard,
  hearts: HeartsBoard,
  sketch: SketchBoard,
  'four-in-a-row': FourBoard,
};
