import express from 'express';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { RoomManager } from './rooms';

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
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

http.listen(PORT, () => {
  console.log(`Game server listening on http://localhost:${PORT}`);
});
