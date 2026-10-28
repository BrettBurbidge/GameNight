import { useEffect, useRef, useState } from 'react';
import type { Identity, RoomSnapshot } from '../../shared/types';
import { request, socket } from './socket';

export type RoomState =
  | { kind: 'joining' }
  | { kind: 'error'; message: string }
  | { kind: 'kicked' }
  | { kind: 'ready'; room: RoomSnapshot };

/** Joins a room (re-joining automatically after reconnects) and streams its personalised snapshot. */
export function useRoom(code: string, identity: Identity, enabled: boolean) {
  const [state, setState] = useState<RoomState>({ kind: 'joining' });
  const [connected, setConnected] = useState(socket.connected);
  const clockOffset = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    const join = async () => {
      const res = await request('room:join', { code, identity });
      if (!alive) return;
      if (!res.ok) setState({ kind: 'error', message: res.error });
    };
    const onState = (room: RoomSnapshot) => {
      clockOffset.current = room.serverNow - Date.now();
      setState({ kind: 'ready', room });
    };
    const onKicked = () => setState({ kind: 'kicked' });
    const onConnect = () => {
      setConnected(true);
      join();
    };
    const onDisconnect = () => setConnected(false);

    socket.on('room:state', onState);
    socket.on('room:kicked', onKicked);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) join();

    return () => {
      alive = false;
      socket.off('room:state', onState);
      socket.off('room:kicked', onKicked);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
    // Identity changes (rename/avatar) re-join to update the seat.
  }, [code, identity.id, identity.secret, identity.name, identity.avatar, enabled]);

  /** Server-synchronised clock for countdowns. */
  const serverNow = () => Date.now() + clockOffset.current;

  return { state, connected, serverNow };
}
