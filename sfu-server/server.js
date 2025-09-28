const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const mediasoup = require('mediasoup');
const config = require('./mediasoup-config');

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const httpServer = http.createServer(app);
const aio = new Server(httpServer, {
  cors: {
    origin: '*'
  }
});

aio.on('connection', socket => {
  socket.on('disconnect', () => {
    // placeholder hook for future socket-based coordination
  });
});

let worker;
const rooms = new Map();

async function createWorker() {
  const { rtcMinPort, rtcMaxPort } = config.workerSettings;
  const mediasoupWorker = await mediasoup.createWorker({
    rtcMinPort,
    rtcMaxPort
  });

  mediasoupWorker.on('died', () => {
    console.error('Mediasoup worker died, exiting in 2 seconds...');
    setTimeout(() => process.exit(1), 2000);
  });

  console.log(`Mediasoup worker created [pid:${mediasoupWorker.pid}]`);
  return mediasoupWorker;
}

async function getWorker() {
  if (!worker) {
    worker = await createWorker();
  }
  return worker;
}

async function getOrCreateRoom(roomId) {
  if (rooms.has(roomId)) {
    return rooms.get(roomId);
  }
  const mediasoupWorker = await getWorker();
  const router = await mediasoupWorker.createRouter(config.routerOptions);
  const room = {
    id: roomId,
    router,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map()
  };
  rooms.set(roomId, room);
  console.log(`Room ${roomId} initialized`);
  return room;
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function removeRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }
  for (const transport of room.transports.values()) {
    try {
      transport.close();
    } catch (err) {
      console.warn('Error closing transport', err);
    }
  }
  for (const producer of room.producers.values()) {
    try {
      producer.close();
    } catch (err) {
      console.warn('Error closing producer', err);
    }
  }
  for (const consumer of room.consumers.values()) {
    try {
      consumer.close();
    } catch (err) {
      console.warn('Error closing consumer', err);
    }
  }
  try {
    room.router.close();
  } catch (err) {
    console.warn('Error closing router', err);
  }
  rooms.delete(roomId);
  console.log(`Room ${roomId} cleaned up`);
}

function serializeRouter(room) {
  return {
    roomId: room.id,
    routerId: room.router.id,
    rtpCapabilities: room.router.rtpCapabilities
  };
}

function errorResponse(res, status, message) {
  return res.status(status).json({ error: message });
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

app.post('/rooms', asyncRoute(async (req, res) => {
  console.log('[/rooms] from spring headers:', req.headers);
  console.log('[/rooms] from spring body:', req.body);
  const { roomId } = req.body;
  if (!roomId) {
    return errorResponse(res, 400, 'roomId is required');
  }
  const room = await getOrCreateRoom(roomId);
  return res.json(serializeRouter(room));
}));

app.get('/rooms/:roomId/rtp-capabilities', asyncRoute(async (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) {
    return errorResponse(res, 404, 'Room not found');
  }
  return res.json(serializeRouter(room));
}));

app.post('/rooms/:roomId/transports', asyncRoute(async (req, res) => {
  const { roomId } = req.params;
  const { direction } = req.body;
  if (!direction) {
    return errorResponse(res, 400, 'direction is required');
  }
  const room = await getOrCreateRoom(roomId);
  const transport = await room.router.createWebRtcTransport(config.webRtcTransportOptions);

  transport.appData = { roomId, direction };

  transport.on('dtlsstatechange', state => {
    if (state === 'closed' || state === 'failed') {
      console.warn(`Transport ${transport.id} dtls state ${state}, closing`);
      transport.close();
    }
  });
  transport.on('iceconnectionstatechange', state => {
    if (state === 'failed' || state === 'disconnected') {
      console.warn(`Transport ${transport.id} ice state ${state}, closing`);
      transport.close();
    }
  });
  transport.observer.on('close', () => {
    room.transports.delete(transport.id);
  });

  room.transports.set(transport.id, transport);

  res.json({
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters
  });
}));

app.post('/rooms/:roomId/transports/:transportId/connect', asyncRoute(async (req, res) => {
  const { roomId, transportId } = req.params;
  const room = getRoom(roomId);
  if (!room) {
    return errorResponse(res, 404, 'Room not found');
  }
  const transport = room.transports.get(transportId);
  if (!transport) {
    return errorResponse(res, 404, 'Transport not found');
  }
  const { dtlsParameters } = req.body;
  if (!dtlsParameters) {
    return errorResponse(res, 400, 'dtlsParameters is required');
  }
  await transport.connect({ dtlsParameters });
  res.json({ connected: true });
}));

app.post('/rooms/:roomId/producers', asyncRoute(async (req, res) => {
  const { roomId } = req.params;
  const room = getRoom(roomId);
  if (!room) {
    return errorResponse(res, 404, 'Room not found');
  }
  const { transportId, kind, rtpParameters, appData } = req.body;
  if (!transportId || !kind || !rtpParameters) {
    return errorResponse(res, 400, 'transportId, kind and rtpParameters are required');
  }
  const transport = room.transports.get(transportId);
  if (!transport) {
    return errorResponse(res, 404, 'Transport not found');
  }

  const producer = await transport.produce({ kind, rtpParameters, appData });
  room.producers.set(producer.id, producer);

  producer.on('transportclose', () => {
    room.producers.delete(producer.id);
  });

  res.json({
    producerId: producer.id,
    kind: producer.kind,
    appData: producer.appData || {}
  });
}));

app.post('/rooms/:roomId/consumers', asyncRoute(async (req, res) => {
  const { roomId } = req.params;
  const room = getRoom(roomId);
  if (!room) {
    return errorResponse(res, 404, 'Room not found');
  }
  const { transportId, rtpCapabilities, producerId } = req.body;
  if (!transportId || !rtpCapabilities || !producerId) {
    return errorResponse(res, 400, 'transportId, producerId and rtpCapabilities are required');
  }
  const transport = room.transports.get(transportId);
  if (!transport) {
    return errorResponse(res, 404, 'Transport not found');
  }
  const producer = room.producers.get(producerId);
  if (!producer) {
    return errorResponse(res, 404, 'Producer not found');
  }
  if (!room.router.canConsume({ producerId: producer.id, rtpCapabilities })) {
    return errorResponse(res, 400, 'Unsupported rtpCapabilities');
  }

  const consumer = await transport.consume({
    producerId: producer.id,
    rtpCapabilities,
    paused: true
  });

  room.consumers.set(consumer.id, consumer);

  consumer.on('transportclose', () => {
    room.consumers.delete(consumer.id);
  });
  consumer.on('producerclose', () => {
    room.consumers.delete(consumer.id);
  });

  res.json({
    consumerId: consumer.id,
    producerId: producer.id,
    kind: consumer.kind,
    type: consumer.type,
    rtpParameters: consumer.rtpParameters,
    producerPaused: consumer.producerPaused,
    appData: producer.appData || {}
  });
}));

app.post('/rooms/:roomId/consumers/:consumerId/resume', asyncRoute(async (req, res) => {
  const { roomId, consumerId } = req.params;
  const room = getRoom(roomId);
  if (!room) {
    return errorResponse(res, 404, 'Room not found');
  }
  const consumer = room.consumers.get(consumerId);
  if (!consumer) {
    return errorResponse(res, 404, 'Consumer not found');
  }
  await consumer.resume();
  res.json({ resumed: true });
}));

app.delete('/rooms/:roomId', asyncRoute(async (req, res) => {
  removeRoom(req.params.roomId);
  res.json({ closed: true });
}));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

app.use((err, req, res, next) => {
  console.error('SFU error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

httpServer.listen(PORT, () => {
  console.log(`SFU server listening on http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down');
  httpServer.close(() => process.exit(0));
  for (const roomId of Array.from(rooms.keys())) {
    removeRoom(roomId);
  }
  if (worker) {
    worker.close();
  }
});
