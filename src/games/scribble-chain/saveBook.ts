import { CANVAS_H, CANVAS_W, type DrawOp } from '../../../shared/drawing';
import type { RevealPage } from '../../../shared/games/scribble-chain/types';
import type { PlayerInfo } from '../../../shared/types';
import { Drawing } from '../sketch/drawing';

const PAD = 40;
const WIDTH = CANVAS_W + PAD * 2;
const DISPLAY = "'Fredoka', ui-rounded, system-ui, sans-serif";
const BODY = "'Inter', system-ui, -apple-system, sans-serif";
const HEADER_H = 150;
const BYLINE_H = 56;
const LINE_H = 60;
const GAP = 34;
const FOOTER_H = 70;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** Lays a whole book out as one tall picture: every word and drawing, in order, with who made it. */
export function renderBook(ownerName: string, pages: RevealPage[], drawings: Record<string, DrawOp[]>, people: Record<string, PlayerInfo>): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const wordFont = `700 46px ${DISPLAY}`;

  // Measure first: the height depends on how the words wrap.
  ctx.font = wordFont;
  const blocks = pages.map((page) => (page.kind === 'draw' ? { page, lines: [] as string[], height: CANVAS_H } : { page, lines: wrap(ctx, page.text, CANVAS_W - 40), height: 0 }));
  for (const b of blocks) if (b.page.kind !== 'draw') b.height = b.lines.length * LINE_H + 20;
  canvas.width = WIDTH;
  canvas.height = HEADER_H + blocks.reduce((sum, b) => sum + BYLINE_H + b.height + GAP, 0) + FOOTER_H;

  ctx.fillStyle = '#12122a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#f4f3ff';
  ctx.font = `700 54px ${DISPLAY}`;
  ctx.fillText(wrap(ctx, `${ownerName}’s book`, CANVAS_W)[0], PAD, 70);
  ctx.fillStyle = '#a9a7c9';
  ctx.font = `600 22px ${BODY}`;
  ctx.fillText('📒 Scribble Chain', PAD, 118);

  let y = HEADER_H;
  blocks.forEach(({ page, lines, height }, i) => {
    const by = people[page.by];
    const verb = i === 0 ? 'started with' : page.kind === 'draw' ? 'drew' : 'guessed';
    ctx.font = `600 26px ${BODY}`;
    ctx.fillStyle = '#f4f3ff';
    const who = `${by?.avatar ?? ''} ${by?.name ?? 'Someone'}`.trim();
    ctx.fillText(who, PAD, y + BYLINE_H / 2);
    ctx.fillStyle = '#a9a7c9';
    ctx.fillText(` ${verb}`, PAD + ctx.measureText(who).width, y + BYLINE_H / 2);
    y += BYLINE_H;

    if (page.kind === 'draw') {
      const sheet = document.createElement('canvas');
      sheet.width = CANVAS_W;
      sheet.height = CANVAS_H;
      const drawing = new Drawing(sheet.getContext('2d', { willReadFrequently: true })!);
      for (const op of drawings[page.key] ?? []) drawing.apply(op);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(PAD, y, CANVAS_W, CANVAS_H, 24);
      ctx.clip();
      ctx.drawImage(sheet, PAD, y);
      ctx.restore();
      if (page.missed) {
        ctx.fillStyle = '#6b7280';
        ctx.font = `600 32px ${DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.fillText('Ran out of time!', WIDTH / 2, y + CANVAS_H / 2);
        ctx.textAlign = 'left';
      }
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.beginPath();
      ctx.roundRect(PAD, y, CANVAS_W, height, 24);
      ctx.fill();
      ctx.fillStyle = '#ec4899';
      ctx.font = wordFont;
      ctx.textAlign = 'center';
      lines.forEach((line, n) => ctx.fillText(line, WIDTH / 2, y + 10 + LINE_H * (n + 0.5)));
      ctx.textAlign = 'left';
    }
    y += height + GAP;
  });

  ctx.fillStyle = '#6f6d93';
  ctx.font = `500 20px ${BODY}`;
  ctx.textAlign = 'center';
  ctx.fillText(window.location.host, WIDTH / 2, y + FOOTER_H / 2 - 10);
  return canvas;
}

/**
 * Saves a book as a PNG. On a phone this opens the share sheet (which is how a picture gets into the
 * camera roll); elsewhere it downloads the file.
 */
export async function saveBook(ownerName: string, pages: RevealPage[], drawings: Record<string, DrawOp[]>, people: Record<string, PlayerInfo>): Promise<void> {
  await document.fonts?.ready;
  const canvas = renderBook(ownerName, pages, drawings, people);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not make the picture.');
  const name = `scribble-chain-${ownerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'book'}.png`;
  const file = new File([blob], name, { type: 'image/png' });

  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      // Closing the share sheet is not an error; anything else falls through to a download.
      if ((err as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
