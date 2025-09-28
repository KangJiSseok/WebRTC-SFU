(() => {
  const state = {
    ws: null,
    roomId: '',
    userId: '',
    device: null,
    recvTransport: null,
    consumers: new Map(),
    listeners: []
  };

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

  function send(action, payload) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    state.ws.send(JSON.stringify({ action, ...payload }));
  }

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

  joinBtn.addEventListener('click', joinRoom);
  leaveBtn.addEventListener('click', leaveRoom);
  window.addEventListener('beforeunload', leaveRoom);

  function ensureRemoteStream(createIfMissing = true) {
    let stream = remoteVideo.srcObject instanceof MediaStream ? remoteVideo.srcObject : null;
    if (!stream && createIfMissing) {
      stream = new MediaStream();
      remoteVideo.srcObject = stream;
    }
    return stream;
  }
})();
