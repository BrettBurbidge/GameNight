import { motion } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import { AVATARS, useIdentity } from '../lib/identity';

/** The only "sign in" step: pick a display name and an avatar. Stored in this browser. */
export function NameGate({ title = 'Who’s playing?', subtitle, submitLabel = 'Let’s play', onDone, onCancel }: { title?: string; subtitle?: string; submitLabel?: string; onDone: () => void; onCancel?: () => void }) {
  const [identity, update] = useIdentity();
  const [name, setName] = useState(identity.name);
  const [avatar, setAvatar] = useState(identity.avatar);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim().slice(0, 20);
    if (!clean) return;
    update({ name: clean, avatar });
    onDone();
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <motion.form
        className="modal panel panel-pad stack"
        style={{ '--gap': '18px' } as React.CSSProperties}
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      >
        <div className="stack" style={{ '--gap': '4px' } as React.CSSProperties}>
          <h2>{title}</h2>
          <p className="muted small" style={{ margin: 0 }}>{subtitle ?? 'No account needed — just a name your friends will recognise.'}</p>
        </div>
        <div className="row">
          <div className="avatar" style={{ '--size': '56px', '--c': '#a78bfa' } as React.CSSProperties}>{avatar}</div>
          <input className="input" autoFocus maxLength={20} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="avatar-picker">
          {AVATARS.map((a) => (
            <button type="button" key={a} className={`avatar-option ${a === avatar ? 'on' : ''}`} onClick={() => setAvatar(a)}>
              {a}
            </button>
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
          <button className="btn btn-primary" disabled={!name.trim()}>{submitLabel}</button>
        </div>
      </motion.form>
    </div>
  );
}
