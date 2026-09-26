import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { verifyAccessToken } from '../../lib/tokens.js';

/**
 * Socket.IO gateway for push delivery.
 *
 * Scope is deliberately narrow: notifications, alert fires and order-status
 * changes. Live prices are NOT streamed here - they are polled from the cached
 * quote endpoint instead. Streaming quotes to every connected client would
 * multiply upstream provider calls without making the data any less delayed,
 * and would burn the free tier for no honest gain.
 *
 * Every socket is authenticated with the same access token the REST API uses,
 * then joined to a room keyed by user id so a message can only ever reach the
 * account it belongs to.
 */

let io: SocketServer | null = null;

function userRoom(userId: string): string {
  return `user:${userId}`;
}

interface HandshakeAuth {
  token?: string;
}

/** Socket.IO types `socket.data` as `any`; this narrows what we store on it. */
interface SocketData {
  userId: string;
  role: string;
}

export function initRealtime(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    path: '/api/v1/socket.io',
    cors: {
      origin: env.CORS_ORIGINS,
      credentials: true,
    },
    // Free-tier hosts drop idle connections; these keep reconnects prompt
    // without being chatty.
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  io.use((socket: Socket, next) => {
    const auth = socket.handshake.auth as HandshakeAuth | undefined;
    const token =
      auth?.token ??
      (typeof socket.handshake.query.token === 'string' ? socket.handshake.query.token : undefined);

    if (!token) {
      next(new Error('Authentication required'));
      return;
    }

    const result = verifyAccessToken(token);
    if (!result.ok) {
      next(new Error('Invalid or expired token'));
      return;
    }

    const data = socket.data as SocketData;
    data.userId = result.claims.sub;
    data.role = result.claims.role;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const { userId } = socket.data as SocketData;
    void socket.join(userRoom(userId));

    logger.debug({ userId, socketId: socket.id }, 'Realtime client connected');

    socket.on('disconnect', (reason) => {
      logger.debug({ userId, reason }, 'Realtime client disconnected');
    });
  });

  logger.info('Realtime gateway ready');
  return io;
}

/** Sends an event to every socket belonging to one user. No-op if not ready. */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(userRoom(userId)).emit(event, payload);
}

/** Broadcasts to every connected client. Used for platform-wide notices. */
export function emitBroadcast(event: string, payload: unknown): void {
  io?.emit(event, payload);
}

export function getConnectionCount(): number {
  return io?.engine.clientsCount ?? 0;
}

export async function closeRealtime(): Promise<void> {
  if (!io) return;
  await io.close();
  io = null;
}
