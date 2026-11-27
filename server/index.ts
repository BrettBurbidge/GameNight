import express from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { getGameMeta, inviteTitle } from '../shared/catalog';
import { RoomManager } from './rooms';

// Local secrets (ANTHROPIC_API_KEY for bot table talk) live in an untracked .env; hosts set real env vars.
try {
  process.loadEnvFile();
} catch {
  // No .env file: that's fine.
}

const PORT = Number(process.env.SERVER_PORT ?? process.env.PORT ?? 3001);
const app = express();
const http = createServer(app);
const io = new Server(http, {
  cors: process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN.split(',') } : undefined,
});
const rooms = new RoomManager(io);

io.on('connection', (socket) => rooms.attach(socket));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.roomCount });
});

// In production the same process serves the built client.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  // Invite links get their own title, so the preview in a text message says which game and whose it is.
  // Messaging apps read this from the HTML without running the app, so it has to come from the server.
  const indexHtml = readFileSync(path.join(dist, 'index.html'), 'utf8');
  const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  app.get(['/join/:code', '/room/:code'], (req, res) => {
    const peek = rooms.peek(req.params.code);
    const meta = peek && getGameMeta(peek.gameId);
    if (!peek || !meta) return res.sendFile(path.join(dist, 'index.html'));
    const title = escapeHtml(inviteTitle(meta.name, peek.hostName));
    const about = escapeHtml(`${meta.emoji} ${meta.tagline} Tap to join room ${peek.code}.`);
    const head = [
      `<title>${title}</title>`,
      `<meta property="og:title" content="${title}" />`,
      `<meta property="og:description" content="${about}" />`,
      `<meta name="description" content="${about}" />`,
      `<meta property="og:site_name" content="Game Night" />`,
      `<meta property="og:type" content="website" />`,
    ].join('\n    ');
    res.set('Cache-Control', 'no-store').type('html').send(indexHtml.replace(/<title>[^<]*<\/title>/, () => head));
  });
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

http.listen(PORT, () => {
  console.log(`Game server listening on http://localhost:${PORT}`);
});
