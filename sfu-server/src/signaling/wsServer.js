const WebSocket = require('ws');
const { randomUUID } = require('crypto');
const logger = require('../metrics/logger');
const { handleMessage, handleDisconnect } = require('./handlers');
const { verifyToken } = require('../auth/jwtVerifier');
const { createSessionContext } = require('../auth/sessionContext');

function createWebSocketServer() {
  const port = Number(process.env.WS_PORT || process.env.PORT || 3001);
  const server = new WebSocket.Server({ port });
  const sessions = new Map();
  const roomSessions = new Map();

  server.on('connection', (ws, request) => {
    const sessionId = randomUUID();
    const token = extractToken(request);
    let claims;
    try {
      claims = verifyToken(token);
    } catch (err) {
      logger.warn('ws auth failed', { sessionId, reason: err.message });
      ws.close(1008, 'Unauthorized');
      return;
    }

    const session = {
      id: sessionId,
      ws,
      token,
      context: createSessionContext({
        sessionId,
        userId: claims.sub,
        role: claims.role
      })
    };
    sessions.set(sessionId, session);
    logger.info('ws connected', { sessionId, userId: session.context.userId });

    ws.on('message', async (data) => {
      try {
        const payload = JSON.parse(data.toString());
        const result = await handleMessage(session, payload, {
          sessions,
          roomSessions,
          broadcastToRoom: (roomId, excludeSessionId, message) =>
            broadcastToRoom(sessions, roomSessions, roomId, excludeSessionId, message),
          registerSession: (roomId, targetSessionId) =>
            registerSession(roomSessions, roomId, targetSessionId),
          unregisterSession: (roomId, targetSessionId) =>
            unregisterSession(roomSessions, roomId, targetSessionId)
        });
        if (Array.isArray(result)) {
          result.forEach((message) => sendJson(ws, message));
        } else if (result) {
          sendJson(ws, result);
        }
      } catch (err) {
        logger.warn('ws message error', { sessionId, error: err.message });
        sendJson(ws, {
          type: 'error',
          message: err.message || 'Failed to handle message'
        });
      }
    });

    ws.on('close', (code, reason) => {
      sessions.delete(sessionId);
      handleDisconnect(session, {
        roomSessions,
        broadcastToRoom: (roomId, excludeSessionId, message) =>
          broadcastToRoom(sessions, roomSessions, roomId, excludeSessionId, message),
        unregisterSession: (roomId, targetSessionId) =>
          unregisterSession(roomSessions, roomId, targetSessionId)
      });
      logger.info('ws closed', {
        sessionId,
        code,
        reason: reason ? reason.toString() : ''
      });
    });

    ws.on('error', (err) => {
      logger.error('ws error', { sessionId, error: err.message });
    });
  });

  logger.info(`WebSocket signaling server listening on ws://localhost:${port}`);
  return server;
}

function registerSession(roomSessions, roomId, sessionId) {
  if (!roomId) return;
  if (!roomSessions.has(roomId)) {
    roomSessions.set(roomId, new Set());
  }
  roomSessions.get(roomId).add(sessionId);
}

function unregisterSession(roomSessions, roomId, sessionId) {
  const sessions = roomSessions.get(roomId);
  if (!sessions) return;
  sessions.delete(sessionId);
  if (sessions.size === 0) {
    roomSessions.delete(roomId);
  }
}

function broadcastToRoom(sessions, roomSessions, roomId, excludeSessionId, payload) {
  const ids = roomSessions.get(roomId);
  if (!ids) return;
  ids.forEach((sessionId) => {
    if (sessionId === excludeSessionId) return;
    const target = sessions.get(sessionId);
    if (target && target.ws.readyState === WebSocket.OPEN) {
      sendJson(target.ws, payload);
    }
  });
}

function extractToken(request) {
  if (!request || !request.url) {
    return null;
  }
  const url = new URL(request.url, `http://${request.headers.host}`);
  const token = url.searchParams.get('token');
  if (token) {
    return token;
  }
  const authHeader = request.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }
  return null;
}

function sendJson(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }
  ws.send(JSON.stringify(payload));
}

module.exports = {
  createWebSocketServer
};
