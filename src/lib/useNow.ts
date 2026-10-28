import { useEffect, useState } from 'react';

/** Re-renders every `ms` while `active`, returning the (server-synced) time. */
export function useNow(serverNow: () => number, active: boolean, ms = 200) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(id);
  }, [active, ms, serverNow]);
  return active ? now : serverNow();
}
