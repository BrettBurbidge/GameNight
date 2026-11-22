import type { PlayerId } from '../../types';
import type { PageKind } from './pages';

// `seq` and `chapter` say which page or chapter the player was looking at, so two people clicking at the
// same moment (or a click that lands just after the page changed) can't skip twice.
export type OpenBookAction =
  /** Reader, on a "pick" page: choose who answers. */
  | { type: 'pick'; playerId: PlayerId }
  /** Reader or whoever is answering: swap this page for another, no questions asked. */
  | { type: 'pass'; seq: number }
  /** Reader or whoever is answering: the conversation is done, turn the page. */
  | { type: 'next'; seq: number }
  /** Any player: vote (or un-vote) to move on to the next chapter early. */
  | { type: 'vote'; chapter: number }
  /** Closing notes: write or rewrite your note. */
  | { type: 'note'; text: string };

export interface OpenBookView {
  phase: 'pages' | 'notes' | 'over';
  /** Seated players in reading order. */
  order: PlayerId[];
  role: 'player' | 'spectator';

  chapter: number;
  chapterCount: number;
  chapterTitle: string;
  chapterBlurb: string;
  /** 1-based position within the chapter. */
  pageInChapter: number;
  pagesPerChapter: number;
  /** Changes every time a new page is shown. */
  pageSeq: number;
  page: { kind: PageKind; text: string } | null;
  readerId: PlayerId;
  /** Who the reader picked on a "pick" page. */
  answererId: PlayerId | null;
  votes: PlayerId[];
  votesNeeded: number;

  noteSeconds: number;
  notesEndAt: number | null;
  /** Everyone writing a closing note, and who has handed theirs in. */
  writers: PlayerId[];
  submitted: PlayerId[];
  /** Notes are private: you only ever get the one you wrote and the one written to you. */
  writingTo: PlayerId | null;
  myNote: string | null;
  received: { from: PlayerId; text: string } | null;
}
