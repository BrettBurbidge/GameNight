import { motion } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GAMES, type GameMeta } from '../../shared/catalog';
import { AppShell } from '../components/AppShell';
import { accentStyle } from '../lib/site';
import './Home.css';

export function Home() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const live = GAMES.filter((g) => g.status === 'live');
  const soon = GAMES.filter((g) => g.status === 'soon');

  const join = (e: FormEvent) => {
    e.preventDefault();
    const clean = code.replace(/[^a-z0-9]/gi, '').toUpperCase();
    if (clean.length >= 4) navigate(`/join/${clean}`);
  };

  return (
    <AppShell>
      <section className="hero container">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="chip chip-accent">No sign-up · Free · Play in your browser</span>
          <h1 className="hero-title">
            Game night,
            <br />
            <span className="gradient-text">anywhere.</span>
          </h1>
          <p className="hero-sub muted">Pick a game, open a lobby, and share the invite link. Friends join in one click — no accounts, no downloads.</p>
        </motion.div>
        <motion.form
          className="join-card panel panel-pad stack"
          onSubmit={join}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <h3>Got an invite code?</h3>
          <input className="input input-code" maxLength={6} placeholder="ABCDE" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn btn-primary" disabled={code.replace(/[^a-z0-9]/gi, '').length < 4}>Join game</button>
        </motion.form>
      </section>

      <section className="container section">
        <div className="section-head">
          <h2>Play now</h2>
        </div>
        <div className="game-grid featured">
          {live.map((g, i) => (
            <GameTile key={g.id} game={g} index={i} featured />
          ))}
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <h2>Coming soon</h2>
          <span className="muted small">{soon.length} more games on the way</span>
        </div>
        <div className="game-grid">
          {soon.map((g, i) => (
            <GameTile key={g.id} game={g} index={i} />
          ))}
        </div>
      </section>
      <footer className="container footer faint small">Made for long-distance friends. Rooms close automatically when everyone leaves.</footer>
    </AppShell>
  );
}

function players(g: GameMeta) {
  if (g.fillWithBots) return `${g.maxPlayers} seats · bots fill in`;
  return g.minPlayers === g.maxPlayers ? `${g.minPlayers} players` : `${g.minPlayers}–${g.maxPlayers} players`;
}

function GameTile({ game, index, featured }: { game: GameMeta; index: number; featured?: boolean }) {
  const live = game.status === 'live';
  const body = (
    <motion.div
      className={`game-tile ${featured ? 'featured' : ''} ${live ? '' : 'soon'}`}
      style={accentStyle(game.accent)}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index, duration: 0.4 }}
      whileHover={live ? { y: -6 } : undefined}
    >
      <div className="tile-art">
        <span className="tile-emoji">{game.emoji}</span>
      </div>
      <div className="tile-body stack" style={{ '--gap': '8px' } as React.CSSProperties}>
        <div className="row spread">
          <h3>{game.name}</h3>
          {!live && <span className="chip">Soon</span>}
        </div>
        <p className="muted small tile-tagline">{game.tagline}</p>
        <div className="row wrap" style={{ '--gap': '6px' } as React.CSSProperties}>
          <span className="chip">👥 {players(game)}</span>
          <span className="chip">⏱ {game.minutes} min</span>
        </div>
      </div>
    </motion.div>
  );
  return live ? <Link to={`/games/${game.id}`}>{body}</Link> : body;
}
