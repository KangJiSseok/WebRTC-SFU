// 뷰어 페이지에서 SFU를 통해 방송을 시청하기 위한 모든 로직을 담은 즉시 실행 함수
(() => {
  // 뷰어 전용 상태 값과 mediasoup 객체를 한곳에 보관한다.
  const state = {
    ws: null,
    roomId: '',
    userId: '',
    device: null,
    recvTransport: null,
    consumers: new Map(),
    listeners: []
  };

  // 뷰어 화면에서 자주 사용하는 DOM 요소를 캐시한다.
  const statusEl = document.getElementById('status');
  const roomInput = document.getElementById('roomId');
  const userInput = document.getElementById('userId');
  const joinBtn = document.getElementById('joinBtn');
  const leaveBtn = document.getElementById('leaveBtn');
  const remoteVideo = document.getElementById('remoteVideo');
  if (!remoteVideo) {
    throw new Error('remoteVideo element not found');
  }

  function getRemoteContainer() {
    let el = document.getElementById('remoteContainer');
    if (!el) {
      // 최후의 안전장치: 없으면 만들어 붙이고 콘솔 경고
      console.warn('[viewer] #remoteContainer not found. Creating one at the end of <body>.');
      el = document.createElement('div');
      el.id = 'remoteContainer';
      document.body.appendChild(el);
    }
    return el;
  }

  const WS_URL = 'ws://localhost:8080/ws';

  // UI와 콘솔에 현재 진행 상황을 표시한다.
  function setStatus(message, isError = false) {
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.style.color = isError ? '#b00020' : '#333';
    }
    console.log('[viewer]', message);
  }

  function addListener(entry) {
    state.listeners.push(entry);
  }

  function removeListener(entry) {
    const index = state.listeners.indexOf(entry);
    if (index >= 0) {
      state.listeners.splice(index, 1);
    }
  }

  function dispatchListeners(message) {
    const listeners = [...state.listeners];
    for (const entry of listeners) {
      if (entry.type !== message.type) {
        continue;
      }
      if (!entry.predicate(message)) {
        continue;
      }
      clearTimeout(entry.timer);
      removeListener(entry);
      entry.resolve(message);
    }
  }

  // 특정 WebSocket 응답을 기다리며 mediasoup 시퀀스를 동기화한다.
  function waitForMessage(type, predicate = () => true, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const entry = {
        type,
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          removeListener(entry);
          reject(new Error(`Timeout waiting for ${type}`));
        }, timeout)
      };
      addListener(entry);
    });
  }

  // 신호 서버와의 WebSocket 연결을 보장한다.
  function ensureWebSocket() {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve(state.ws);
    }
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      state.ws = ws;
      ws.addEventListener('open', () => {
        setStatus('Connected to signaling server');
        resolve(ws);
      });
      ws.addEventListener('error', () => {
        reject(new Error('WebSocket error'));
        setStatus('WebSocket error', true);
      });
      ws.addEventListener('close', () => {
        setStatus('WebSocket closed');
      });
      ws.addEventListener('message', async (event) => {
        try {
          const message = JSON.parse(event.data);
          dispatchListeners(message);
          await handleMessage(message);
        } catch (err) {
          console.error('Failed to handle message', err);
        }
      });
    });
  }

  // 공통 메시지 포맷으로 WebSocket 액션을 전송한다.
  function send(action, payload) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    state.ws.send(JSON.stringify({ action, ...payload }));
  }

  // 서버에서 수신한 이벤트를 타입별로 처리한다.
  async function handleMessage(message) {
    switch (message.type) {
      case 'roomJoined':
        await handleRoomJoined(message);
        break;
      case 'newProducer':
        await consumeProducer(message.producerId);
        break;
      case 'producerClosed':
        removeConsumer(message.producerId);
        break;
      case 'routerRtpCapabilities':
        await ensureDevice(message.router);
        break;
      case 'error':
        setStatus(`Error: ${message.message}`, true);
        break;
      default:
        break;
    }
  }

  // 방에 성공적으로 접속했을 때 트랜스포트 및 producer 소비를 준비한다.
  async function handleRoomJoined(message) {
    await ensureDevice(message.router);
    await ensureRecvTransport();
    const producers = message.producers || [];
    for (const producerId of producers) {
      await consumeProducer(producerId);
    }
    joinBtn.disabled = true;
    leaveBtn.disabled = false;
    setStatus(`Joined room ${state.roomId}`);
  }

  async function loadMediasoupIfNeeded() {
    if (window.mediasoupClient) return;
    try {
      const m = await import('https://esm.sh/mediasoup-client@3.16.7');
      window.mediasoupClient = m;
      console.log('mediasoup loaded dynamically');
    } catch (e) {
      throw new Error('Failed to load mediasoup-client ESM: ' + e.message);
    }
  }

  // mediasoup Device를 초기화하여 라우터 RTP 정보를 로드한다.
  async function ensureDevice(router) {
    if (!router) {
      throw new Error('Router information missing');
    }
    if (state.device) {
      return state.device;
    }
    if (!window.mediasoupClient) await loadMediasoupIfNeeded();
    const device = new window.mediasoupClient.Device();
    await device.load({ routerRtpCapabilities: router.rtpCapabilities });
    state.device = device;
    return device;
  }

  // 수신 전용 트랜스포트를 생성하고 DTLS를 연결한다.
  async function ensureRecvTransport() {
    if (state.recvTransport) {
      return state.recvTransport;
    }
    send('createTransport', { roomId: state.roomId, direction: 'recv' });
    const message = await waitForMessage('transportCreated', (msg) => msg.roomId === state.roomId && msg.direction === 'recv');
    const { transport } = message;
    const device = state.device;
    if (!device) {
      throw new Error('Device not loaded');
    }
    const recvTransport = device.createRecvTransport({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    });

    recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        send('connectTransport', {
          roomId: state.roomId,
          transportId: recvTransport.id,
          dtlsParameters
        });
        await waitForMessage('transportConnected', (msg) => msg.roomId === state.roomId && msg.transportId === recvTransport.id);
        callback();
      } catch (error) {
        errback(error);
      }
    });

    recvTransport.on('connectionstatechange', (connectionState) => {
      if (connectionState === 'failed' || connectionState === 'closed') {
        setStatus(`Receive transport state ${connectionState}`, true);
      }
    });

    state.recvTransport = recvTransport;
    return recvTransport;
  }

  // 서버에 consumer 생성을 요청하고 생성된 트랙을 단일 비디오로 합친다.
  async function consumeProducer(producerId) {
    if (!producerId || state.consumers.has(producerId)) {
      return;
    }
    await ensureRecvTransport();
    send('consume', {
      roomId: state.roomId,
      transportId: state.recvTransport.id,
      producerId,
      rtpCapabilities: state.device.rtpCapabilities
    });
    const message = await waitForMessage('consumed', (msg) => msg.roomId === state.roomId && msg.consumer && msg.consumer.producerId === producerId);
    const info = message.consumer;
    const consumer = await state.recvTransport.consume({
      id: info.consumerId,
      producerId: info.producerId,
      kind: info.kind,
      rtpParameters: info.rtpParameters
    });

    // 트랙 종류에 따라 단일 비디오 요소에 연결
    attachConsumer(consumer.kind, consumer.track);

    state.consumers.set(producerId, { consumer, kind: consumer.kind, track: consumer.track });

    consumer.on('transportclose', () => removeConsumer(producerId));
    consumer.on('producerclose', () => removeConsumer(producerId));

    send('resumeConsumer', { roomId: state.roomId, consumerId: info.consumerId });
    await waitForMessage('consumerResumed', (msg) => msg.roomId === state.roomId && msg.consumerId === info.consumerId);
  }

  // 오디오/비디오 트랙을 단일 MediaStream에 붙여 비디오 요소로 재생한다.
  function attachConsumer(kind, track) {
    const stream = ensureRemoteStream();
    if (kind === 'video') {
      stream.getVideoTracks().forEach((t) => {
        stream.removeTrack(t);
        t.stop();
      });
      stream.addTrack(track);
      remoteVideo.srcObject = stream;
      remoteVideo.play().catch(() => {});
    } else if (kind === 'audio') {
      stream.getAudioTracks().forEach((t) => {
        stream.removeTrack(t);
        t.stop();
      });
      stream.addTrack(track);
      remoteVideo.srcObject = stream;
      remoteVideo.muted = false;
      remoteVideo.play().catch(() => {});
    }
  }

  // 특정 producer에 대응하는 consumer 리소스를 정리한다.
  function removeConsumer(producerId) {
    const entry = state.consumers.get(producerId);
    if (!entry) {
      return;
    }
    try {
      entry.consumer.close();
    } catch (err) {
      console.warn('Failed to close consumer', err);
    }
    const stream = ensureRemoteStream(false);
    if (stream && entry.track) {
      try {
        stream.removeTrack(entry.track);
      } catch (err) {
        console.warn('Failed to remove track', err);
      }
    }
    if (entry.track) {
      entry.track.stop();
    }
    state.consumers.delete(producerId);

    if (stream && stream.getTracks().length === 0) {
      remoteVideo.srcObject = null;
      remoteVideo.pause();
    }
  }

  // 방을 떠날 때 서버에 알리고 로컬 자원을 해제한다.
  function leaveRoom() {
    for (const producerId of [...state.consumers.keys()]) {
      removeConsumer(producerId);
    }
    if (state.recvTransport) {
      state.recvTransport.close();
      state.recvTransport = null;
    }
    if (state.ws && state.ws.readyState === WebSocket.OPEN && state.roomId && state.userId) {
      try {
        send('leaveRoom', { roomId: state.roomId, userId: state.userId });
      } catch (err) {
        console.warn('Failed to send leaveRoom', err);
      }
    }
    joinBtn.disabled = false;
    leaveBtn.disabled = true;
    setStatus('Left room');
    const stream = ensureRemoteStream(false);
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    remoteVideo.srcObject = null;
    remoteVideo.pause();
  }

  // 사용자 입력값을 바탕으로 방 참가를 시도한다.
  async function joinRoom() {
    try {
      state.roomId = roomInput.value.trim();
      state.userId = userInput.value.trim();
      if (!state.roomId || !state.userId) {
        setStatus('Room ID and Viewer ID are required', true);
        return;
      }
      await ensureWebSocket();
      send('joinRoom', { roomId: state.roomId, userId: state.userId, role: 'VIEWER' });
      setStatus('Joining room...');
    } catch (err) {
      console.error(err);
      setStatus(`Failed to join room: ${err.message}`, true);
    }
  }

  // 버튼 이벤트와 브라우저 종료 시그널을 바인딩한다.
  joinBtn.addEventListener('click', joinRoom);
  leaveBtn.addEventListener('click', leaveRoom);
  window.addEventListener('beforeunload', leaveRoom);

  // 원격 스트림을 재사용하거나 필요 시 새로 생성한다.
  function ensureRemoteStream(createIfMissing = true) {
    let stream = remoteVideo.srcObject instanceof MediaStream ? remoteVideo.srcObject : null;
    if (!stream && createIfMissing) {
      stream = new MediaStream();
      remoteVideo.srcObject = stream;
    }
    return stream;
  }
})();
