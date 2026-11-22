// Loose word matching shared by the word games: forgiving enough to catch "cheesy" for "cheese",
// strict enough not to flag "pizzeria" for "pizza".

/** "Hot-dog!" -> "hot dog" */
export const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** "cheese" -> "chees" so "cheesy" is caught too. Short words are left alone. */
export const stem = (w: string) => {
  const s = w.replace(/(ing|ed|es|s|e|y)$/, '');
  return s.length >= 4 ? s : w;
};

/** Returns the first candidate the text uses (including simple word forms), or null. */
export function findWordHit(text: string, candidates: string[]): string | null {
  const tokens = normalize(text).split(' ').filter(Boolean);
  const joined = ` ${tokens.join(' ')} `;
  const flat = tokens.join('');
  for (const candidate of candidates) {
    const c = normalize(candidate);
    if (!c) continue;
    if (c.includes(' ')) {
      if (joined.includes(` ${c} `) || flat.includes(c.replace(/ /g, ''))) return candidate;
    } else if (tokens.some((t) => t === c || (c.length >= 3 && t.startsWith(stem(c))))) {
      return candidate;
    }
  }
  return null;
}
