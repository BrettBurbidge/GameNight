import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatMessage, PlayerInfo } from '../../shared/types';
import { request } from '../lib/socket';
import { useToast } from '../lib/toast';

export function Chat({ messages, playersById, compact }: { messages: ChatMessage[]; playersById: Record<string, PlayerInfo>; compact?: boolean }) {
  const [text, setText] = useState('');
  const toast = useToast();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const message = text;
    setText('');
    const res = await request('chat:send', { text: message });
    if (!res.ok) {
      toast(res.error, 'error');
      setText(message);
    }
  };

  return (
    <div className={`chat ${compact ? 'compact' : ''}`}>
      <div className="chat-list scroll" ref={listRef}>
        {messages.length === 0 && <div className="faint small chat-empty">Say hi 👋</div>}
        {messages.map((m) => {
          if (!m.playerId) return <div key={m.id} className="chat-system">{m.text}</div>;
          const p = playersById[m.playerId];
          return (
            <div key={m.id} className="chat-msg">
              <span className="chat-name" style={{ color: p?.color }}>{p ? `${p.avatar} ${p.name}` : 'Someone'}</span>
              <span className="chat-text">{m.text}</span>
            </div>
          );
        })}
      </div>
      <form className="chat-form" onSubmit={send}>
        <input className="input" placeholder="Message the room…" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
      </form>
    </div>
  );
}
