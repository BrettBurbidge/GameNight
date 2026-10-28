export const SITE_NAME = 'Game Night';

export function inviteUrl(code: string) {
  return `${window.location.origin}/join/${code}`;
}

/** Applies a game's accent colours to a subtree. */
export function accentStyle(accent: [string, string]) {
  return { '--accent-a': accent[0], '--accent-b': accent[1] } as React.CSSProperties;
}
