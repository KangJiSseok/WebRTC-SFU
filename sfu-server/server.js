// SFU 서버는 Express 기반 REST API와 mediasoup 코어를 이용해 동작한다.
// Spring 신호 서버에서 호출하는 REST 엔드포인트를 노출하고, 실시간 미디어 처리를 담당한다.
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const mediasoup = require('mediasoup');
const config = require('./mediasoup-config');

const PORT = process.env.PORT || 3001;

const app = express();
// REST 호출이 다른 도메인에서 올 수 있으므로 CORS 및 JSON 파서를 기본 설정한다.
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const httpServer = http.createServer(app);
// Socket.IO는 향후 확장이 가능하도록 초기화하지만 현재는 기본 감시만 수행한다.
const aio = new Server(httpServer, {
  cors: {
    origin: '*'
  }
});

aio.on('connection', socket => {
  socket.on('disconnect', () => {
    // 추후 WebSocket 기반 추가 동기화를 붙일 수 있는 자리이다.
  });
});

let worker;
// roomId를 키로 하여 mediasoup 자원을 추적한다.
const rooms = new Map();

// mediasoup Worker 프로세스를 생성하고 비정상 종료를 감시한다.
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

// 단일 Worker를 재사용하기 위한 헬퍼.
async function getWorker() {
  if (!worker) {
    worker = await createWorker();
  }
  return worker;
}

// 존재하지 않는 경우 Router와 리소스를 만들고, 있으면 재사용한다.
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
  // 이미 생성된 방 객체를 단순 조회한다.
  return rooms.get(roomId);
}

// 방이 비었을 때 모든 mediasoup 리소스를 정리한다.
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

// Router 정보를 REST 응답 형식으로 변환한다.
function serializeRouter(room) {
  return {
    roomId: room.id,
    routerId: room.router.id,
    rtpCapabilities: room.router.rtpCapabilities
  };
}

// 공통 에러 응답 포맷을 제공한다.
function errorResponse(res, status, message) {
  return res.status(status).json({ error: message });
}

// 비동기 라우터에서 throw를 next로 위임하기 위한 래퍼.
function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// Spring 신호 서버가 방 생성 시 호출하는 엔드포인트
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

// 특정 방의 Router RTP 역량 정보를 조회한다.
app.get('/rooms/:roomId/rtp-capabilities', asyncRoute(async (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) {
    return errorResponse(res, 404, 'Room not found');
  }
  return res.json(serializeRouter(room));
}));

// 송신/수신 방향에 맞는 WebRTC 트랜스포트를 생성한다.
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

// 클라이언트가 DTLS 매개변수를 전달하면 트랜스포트를 연결한다.
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

// 브로드캐스터가 오디오/비디오 트랙을 업스트림으로 전송할 때 호출한다.
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

// 시청자가 특정 producer를 구독하고자 할 때 consumer를 생성한다.
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

// 초기에는 consumer가 pause 상태이므로 resume을 통해 미디어 전송을 시작한다.
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

// Spring 측에서 방을 정리할 때 호출하는 API
app.delete('/rooms/:roomId', asyncRoute(async (req, res) => {
  removeRoom(req.params.roomId);
  res.json({ closed: true });
}));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

// 예외 상황을 로깅하고 500 응답으로 반환한다.
app.use((err, req, res, next) => {
  console.error('SFU error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// HTTP 서버 시작과 동시에 REST/SFU 서비스를 제공한다.
httpServer.listen(PORT, () => {
  console.log(`SFU server listening on http://localhost:${PORT}`);
});

// 컨테이너 종료 등으로 SIGTERM 수신 시 안전하게 리소스를 해제한다.
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
