import { io } from 'socket.io-client';
import type { Ack } from '../../shared/types';

export const socket = io({ autoConnect: true, transports: ['websocket', 'polling'] });

/** Emit with an acknowledgement, resolving to the server's Ack (or a timeout error). */
export async function request<T = object>(event: string, payload: unknown = {}): Promise<Ack<T>> {
  try {
    return await socket.timeout(8000).emitWithAck(event, payload);
  } catch {
    return { ok: false, error: 'The server did not respond. Check your connection.' };
  }
}
