import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { parseIncomingMessage } from '@chaos-parcel/shared';
import { RoomManager } from './roomManager.js';
import {
  handleConnectionMessage,
  handleDisconnect,
  handleHostRoomCreate,
} from './handlers/connection.js';
import type { ClientMeta } from './types.js';

const PORT = Number(process.env.PORT ?? 3001);
const WS_PATH = process.env.WS_PATH ?? '/ws';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
const JOIN_BASE_URL = process.env.JOIN_BASE_URL ?? 'http://localhost:5173/join';

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: WS_PATH });
const roomManager = new RoomManager();

const connectionMeta = new WeakMap<WebSocket, ClientMeta>();

wss.on('connection', (socket, request) => {
  const url = new URL(request.url ?? '', `http://${request.headers.host ?? 'localhost'}`);
  const roleParam = url.searchParams.get('role');
  const role = roleParam === 'host' ? 'host' : 'player';

  const meta: ClientMeta = { role };
  connectionMeta.set(socket, meta);

  socket.on('message', (data) => {
    const raw = data.toString();

    if (meta.role === 'host' && !meta.roomCode) {
      try {
        const message = parseIncomingMessage(JSON.parse(raw), 'host');
        if (message.event === 'ROOM_CREATE') {
          handleHostRoomCreate(
            roomManager,
            socket,
            meta,
            message.payload.host_version,
            JOIN_BASE_URL,
          );
          return;
        }
      } catch {
        roomManager.sendError(socket, 'INVALID_MESSAGE', 'Host must send ROOM_CREATE first.');
        return;
      }
    }

    handleConnectionMessage(roomManager, socket, meta, raw);
  });

  socket.on('close', () => {
    handleDisconnect(roomManager, meta);
    connectionMeta.delete(socket);
  });

  socket.on('error', () => {
    handleDisconnect(roomManager, meta);
  });
});

server.listen(PORT, () => {
  console.log(`Chaos Parcel server listening on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}${WS_PATH}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Kill the existing process:`);
    console.error(`  lsof -ti:${PORT} | xargs kill`);
    process.exit(1);
  }
  throw err;
});
