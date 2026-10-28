import { motion } from 'framer-motion';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { getGameMeta } from '../../shared/catalog';
import { AppShell } from '../components/AppShell';
import { NameGate } from '../components/NameGate';
import { getIdentity } from '../lib/identity';
import { accentStyle } from '../lib/site';
import { request } from '../lib/socket';
import { useToast } from '../lib/toast';
import './GamePage.css';

export function GamePage() {
  const { gameId = '' } = useParams();
  const game = getGameMeta(gameId);
  const navigate = useNavigate();
  const toast = useToast();
  const [askName, setAskName] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!game || game.status !== 'live') return <Navigate to="/" replace />;

  const create = async () => {
    const identity = getIdentity();
    if (!identity.name) return setAskName(true);
    setBusy(true);
    const res = await request<{ code: string }>('room:create', { gameId: game.id, identity });
    setBusy(false);
    if (res.ok) navigate(`/room/${res.code}`);
    else toast(res.error, 'error');
  };

  return (
    <AppShell>
      <div className="container game-page" style={accentStyle(game.accent)}>
        <Link to="/" className="muted small back">← All games</Link>
        <motion.section className="game-hero panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="game-hero-art">
            <motion.span
              className="game-hero-emoji"
              animate={{ rotate: [0, -6, 6, 0], y: [0, -6, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            >
              {game.emoji}
            </motion.span>
          </div>
          <div className="game-hero-body stack" style={{ '--gap': '16px' } as React.CSSProperties}>
            <div className="row wrap" style={{ '--gap': '6px' } as React.CSSProperties}>
              {game.tags.map((t) => <span key={t} className="chip">{t}</span>)}
            </div>
            <h1 className="game-title">{game.name}</h1>
            <p className="muted game-desc">{game.description}</p>
            <div className="row wrap">
              <span className="chip">👥 {game.fillWithBots ? `${game.maxPlayers} seats — bots fill empty ones` : `${game.minPlayers}–${game.maxPlayers} players`}</span>
              <span className="chip">⏱ {game.minutes} min</span>
            </div>
            <div className="row wrap">
              <button className="btn btn-primary btn-lg" onClick={create} disabled={busy}>
                {busy ? 'Opening lobby…' : 'Create a lobby'}
              </button>
              <span className="faint small">You’ll get an invite link to share.</span>
            </div>
          </div>
        </motion.section>

        {game.howToPlay && (
          <section className="panel panel-pad how-to">
            <h2>How to play</h2>
            <ol>
              {game.howToPlay.map((step, i) => (
                <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.06 }}>
                  {step}
                </motion.li>
              ))}
            </ol>
          </section>
        )}
      </div>
      {askName && (
        <NameGate
          onCancel={() => setAskName(false)}
          onDone={() => {
            setAskName(false);
            create();
          }}
        />
      )}
    </AppShell>
  );
}
