const config = require('../../../mediasoup-config');
const { createRouter } = require('../../core/mediasoupService');
const roomManager = require('../../core/roomManager');
const { publishEvent } = require('../../integration/eventPublisher');

async function handleMessage(session, payload, context) {
  const action = payload && payload.action;
  if (!action) {
    return { type: 'error', message: 'Missing action' };
  }
  switch (action) {
    case 'createRoom':
      return handleCreateRoom(session, payload, context);
    case 'joinRoom':
      return handleJoinRoom(session, payload, context);
    case 'leaveRoom':
      return handleLeaveRoom(session, payload, context);
    case 'getRouterRtpCapabilities':
      return handleRouterCapabilities(session, payload);
    case 'createTransport':
      return handleCreateTransport(session, payload);
    case 'connectTransport':
      return handleConnectTransport(session, payload);
    case 'produce':
      return handleProduce(session, payload, context);
    case 'consume':
      return handleConsume(session, payload);
    case 'resumeConsumer':
      return handleResumeConsumer(session, payload);
    default:
      return { type: 'error', message: `Unknown action: ${action}` };
  }
}

function handleDisconnect(session, context) {
  safeLeaveRoom(session, context);
}

async function handleCreateRoom(session, payload, context) {
  const roomId = requiredText(payload, 'roomId');
  const hostId = requiredText(payload, 'hostId');
  const name = payload.name || roomId;
  ensureRole(session, ['BROADCASTER', 'HOST', 'ADMIN']);

  const router = await createRouter();
  const room = await roomManager.createRoom(roomId, router, { name, hostId });
  room.participants.set(hostId, { userId: hostId, role: 'BROADCASTER' });

  session.context.roomId = roomId;
  session.context.userId = hostId;
  session.context.role = 'BROADCASTER';

  context.registerSession(roomId, session.id);

  publishEvent({
    eventType: 'ROOM_CREATED',
    roomId,
    payload: {
      hostId,
      name
    }
  });

  return {
    type: 'roomCreated',
    roomId,
    room: toRoomNode(room),
    router: toRouterNode(room),
    participants: toParticipants(room),
    producers: toProducers(room)
  };
}

async function handleJoinRoom(session, payload, context) {
  const roomId = requiredText(payload, 'roomId');
  const userId = requiredText(payload, 'userId');
  const role = payload.role || session.context.role || 'VIEWER';
  const room = getRoomOrThrow(roomId);

  room.participants.set(userId, { userId, role });
  session.context.roomId = roomId;
  session.context.userId = userId;
  session.context.role = role;
  context.registerSession(roomId, session.id);

  publishEvent({
    eventType: 'PARTICIPANT_JOINED',
    roomId,
    payload: {
      userId,
      role,
      sessionId: session.id
    }
  });

  return {
    type: 'roomJoined',
    roomId,
    userId,
    role,
    router: toRouterNode(room),
    participants: toParticipants(room),
    producers: toProducers(room)
  };
}

function handleLeaveRoom(session, payload, context) {
  const roomId = payload.roomId || session.context.roomId;
  const userId = payload.userId || session.context.userId;
  if (!roomId || !userId) {
    return { type: 'error', message: 'Missing roomId or userId' };
  }
  safeLeaveRoom(session, context);
  return { type: 'roomLeft', roomId, userId };
}

function handleRouterCapabilities(session, payload) {
  const roomId = requiredText(payload, 'roomId');
  const room = getRoomOrThrow(roomId);
  return {
    type: 'routerRtpCapabilities',
    roomId,
    router: toRouterNode(room)
  };
}

async function handleCreateTransport(session, payload) {
  const roomId = requiredText(payload, 'roomId');
  const direction = requiredText(payload, 'direction');
  const room = getRoomOrThrow(roomId);
  ensureSessionRoom(session, roomId);

  const transport = await room.router.createWebRtcTransport(config.webRtcTransportOptions);
  transport.appData = { roomId, direction, sessionId: session.id };

  transport.on('dtlsstatechange', (state) => {
    if (state === 'closed' || state === 'failed') {
      transport.close();
    }
  });
  transport.on('iceconnectionstatechange', (state) => {
    if (state === 'failed' || state === 'disconnected') {
      transport.close();
    }
  });
  transport.observer.on('close', () => {
    room.transports.delete(transport.id);
    session.context.transportIds.delete(transport.id);
  });

  room.transports.set(transport.id, transport);
  session.context.transportIds.add(transport.id);

  return {
    type: 'transportCreated',
    roomId,
    direction,
    transport: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    }
  };
}

async function handleConnectTransport(session, payload) {
  const roomId = requiredText(payload, 'roomId');
  const transportId = requiredText(payload, 'transportId');
  const dtlsParameters = payload.dtlsParameters;
  if (!dtlsParameters) {
    return { type: 'error', message: 'dtlsParameters is required' };
  }
  const room = getRoomOrThrow(roomId);
  ensureSessionRoom(session, roomId);
  const transport = room.transports.get(transportId);
  if (!transport) {
    return { type: 'error', message: 'Transport not found' };
  }
  if (transport.appData?.sessionId !== session.id) {
    return { type: 'error', message: 'Transport not owned by session' };
  }
  await transport.connect({ dtlsParameters });
  return { type: 'transportConnected', roomId, transportId };
}

async function handleProduce(session, payload, context) {
  const roomId = requiredText(payload, 'roomId');
  const transportId = requiredText(payload, 'transportId');
  const kind = requiredText(payload, 'kind');
  const rtpParameters = payload.rtpParameters;
  if (!rtpParameters) {
    return { type: 'error', message: 'rtpParameters is required' };
  }
  ensureRole(session, ['BROADCASTER', 'HOST', 'ADMIN']);
  const room = getRoomOrThrow(roomId);
  ensureSessionRoom(session, roomId);

  const transport = room.transports.get(transportId);
  if (!transport) {
    return { type: 'error', message: 'Transport not found' };
  }
  if (transport.appData?.sessionId !== session.id) {
    return { type: 'error', message: 'Transport not owned by session' };
  }

  const producer = await transport.produce({ kind, rtpParameters, appData: payload.appData });
  room.producers.set(producer.id, producer);
  session.context.producerIds.add(producer.id);

  producer.on('transportclose', () => {
    removeProducer(room, producer.id, context, session.id);
  });
  producer.on('close', () => {
    removeProducer(room, producer.id, context, session.id);
  });

  const response = {
    type: 'produced',
    roomId,
    producerId: producer.id,
    producer: {
      producerId: producer.id,
      kind: producer.kind,
      appData: producer.appData || {}
    }
  };

  context.broadcastToRoom(roomId, session.id, {
    type: 'newProducer',
    roomId,
    producerId: producer.id
  });

  publishEvent({
    eventType: 'PRODUCER_CREATED',
    roomId,
    payload: {
      producerId: producer.id,
      kind: producer.kind,
      userId: session.context.userId
    }
  });

  return response;
}

async function handleConsume(session, payload) {
  const roomId = requiredText(payload, 'roomId');
  const transportId = requiredText(payload, 'transportId');
  const producerId = requiredText(payload, 'producerId');
  const rtpCapabilities = payload.rtpCapabilities;
  if (!rtpCapabilities) {
    return { type: 'error', message: 'rtpCapabilities is required' };
  }
  const room = getRoomOrThrow(roomId);
  ensureSessionRoom(session, roomId);

  const transport = room.transports.get(transportId);
  if (!transport) {
    return { type: 'error', message: 'Transport not found' };
  }
  if (transport.appData?.sessionId !== session.id) {
    return { type: 'error', message: 'Transport not owned by session' };
  }

  const producer = room.producers.get(producerId);
  if (!producer) {
    return { type: 'error', message: 'Producer not found' };
  }
  if (!room.router.canConsume({ producerId: producer.id, rtpCapabilities })) {
    return { type: 'error', message: 'Unsupported rtpCapabilities' };
  }

  const consumer = await transport.consume({
    producerId: producer.id,
    rtpCapabilities,
    paused: true
  });
  consumer.appData = { sessionId: session.id };
  room.consumers.set(consumer.id, consumer);
  session.context.consumerIds.add(consumer.id);

  consumer.on('transportclose', () => {
    room.consumers.delete(consumer.id);
    session.context.consumerIds.delete(consumer.id);
  });
  consumer.on('producerclose', () => {
    room.consumers.delete(consumer.id);
    session.context.consumerIds.delete(consumer.id);
  });

  return {
    type: 'consumed',
    roomId,
    consumer: {
      consumerId: consumer.id,
      producerId: producer.id,
      kind: consumer.kind,
      type: consumer.type,
      rtpParameters: consumer.rtpParameters,
      producerPaused: consumer.producerPaused,
      appData: producer.appData || {}
    }
  };
}

async function handleResumeConsumer(session, payload) {
  const roomId = requiredText(payload, 'roomId');
  const consumerId = requiredText(payload, 'consumerId');
  const room = getRoomOrThrow(roomId);
  ensureSessionRoom(session, roomId);

  const consumer = room.consumers.get(consumerId);
  if (!consumer) {
    return { type: 'error', message: 'Consumer not found' };
  }
  if (consumer.appData?.sessionId !== session.id) {
    return { type: 'error', message: 'Consumer not owned by session' };
  }
  await consumer.resume();
  return { type: 'consumerResumed', roomId, consumerId };
}

function safeLeaveRoom(session, context) {
  const roomId = session.context.roomId;
  if (!roomId) return;
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  const userId = session.context.userId;
  if (userId) {
    room.participants.delete(userId);
  }
  if (userId) {
    publishEvent({
      eventType: 'PARTICIPANT_LEFT',
      roomId,
      payload: {
        userId,
        role: session.context.role || null,
        sessionId: session.id
      }
    });
  }
  context.unregisterSession(roomId, session.id);

  for (const producerId of session.context.producerIds) {
    removeProducer(room, producerId, context, session.id);
  }
  session.context.producerIds.clear();

  for (const consumerId of session.context.consumerIds) {
    const consumer = room.consumers.get(consumerId);
    if (consumer) {
      try {
        consumer.close();
      } catch (err) {
        console.warn('Failed to close consumer', err);
      }
      room.consumers.delete(consumerId);
    }
  }
  session.context.consumerIds.clear();

  for (const transportId of session.context.transportIds) {
    const transport = room.transports.get(transportId);
    if (transport) {
      try {
        transport.close();
      } catch (err) {
        console.warn('Failed to close transport', err);
      }
      room.transports.delete(transportId);
    }
  }
  session.context.transportIds.clear();

  if (room.participants.size === 0) {
    roomManager.closeRoom(roomId);
    publishEvent({
      eventType: 'ROOM_CLOSED',
      roomId
    });
  }
  session.context.roomId = null;
}

function removeProducer(room, producerId, context, excludeSessionId) {
  const producer = room.producers.get(producerId);
  if (!producer) return;
  room.producers.delete(producerId);
  try {
    producer.close();
  } catch (err) {
    console.warn('Failed to close producer', err);
  }
  publishEvent({
    eventType: 'PRODUCER_CLOSED',
    roomId: room.id,
    payload: {
      producerId
    }
  });
  context.broadcastToRoom(room.id, excludeSessionId, {
    type: 'producerClosed',
    roomId: room.id,
    producerId
  });
}

function getRoomOrThrow(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room) {
    throw new Error(`Room not found: ${roomId}`);
  }
  return room;
}

function ensureSessionRoom(session, roomId) {
  if (session.context.roomId !== roomId) {
    throw new Error('Session is not joined to the room');
  }
}

function ensureRole(session, roles) {
  const role = (session.context.role || '').toUpperCase();
  if (!roles.includes(role)) {
    throw new Error('Not authorized');
  }
}

function requiredText(payload, field) {
  const value = payload[field];
  if (!value || `${value}`.trim() === '') {
    throw new Error(`${field} is required`);
  }
  return value;
}

function toRoomNode(room) {
  return {
    id: room.id,
    name: room.name,
    hostId: room.hostId,
    routerId: room.router.id,
    createdAt: room.createdAt.toISOString()
  };
}

function toRouterNode(room) {
  return {
    roomId: room.id,
    routerId: room.router.id,
    rtpCapabilities: room.router.rtpCapabilities,
    createdAt: room.createdAt.toISOString()
  };
}

function toParticipants(room) {
  return Array.from(room.participants.keys());
}

function toProducers(room) {
  return Array.from(room.producers.keys());
}

module.exports = { handleMessage, handleDisconnect };
