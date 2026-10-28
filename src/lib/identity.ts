import { useCallback, useSyncExternalStore } from 'react';
import type { Identity } from '../../shared/types';

// Guest identity: a random id + secret stored in this browser. No sign-up, ever.

const KEY = 'gamenight.identity.v1';
export const AVATARS = ['😎', '🦊', '🐼', '🐸', '🦄', '🐙', '👽', '🤠', '🐯', '🦉', '🐵', '🍕', '🌮', '🎸', '🚀', '⚡️', '🌈', '🔥', '👑', '🎃'];

const uid = () => crypto.randomUUID().replace(/-/g, '');

function read(): Identity {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (stored?.id && stored?.secret) return stored;
  } catch {
    /* fall through */
  }
  const fresh: Identity = { id: uid().slice(0, 16), secret: uid(), name: '', avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)] };
  try {
    localStorage.setItem(KEY, JSON.stringify(fresh));
  } catch {
    /* private mode: identity lasts for this tab only */
  }
  return fresh;
}

let current = read();
const listeners = new Set<() => void>();

export function useIdentity() {
  const identity = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
  const update = useCallback((patch: Partial<Pick<Identity, 'name' | 'avatar'>>) => {
    current = { ...current, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  }, []);
  return [identity, update] as const;
}

export function getIdentity() {
  return current;
}
