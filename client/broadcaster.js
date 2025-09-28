(() => {
  const state = {
    ws: null,
    roomId: '',
    userId: '',
    device: null,
    sendTransport: null,
    localStream: null,
    producers: new Map(),
    listeners: []
  };

  const statusEl = document.getElementById('status');
  const roomInput = document.getElementById('roomId');
  const userInput = document.getElementById('userId');
  const connectBtn = document.getElementById('connectBtn');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const localVideo = document.getElementById('localVideo');

  const WS_URL = 'ws://localhost:8080/ws';

  function setStatus(message, isError = false) {
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.style.color = isError ? '#b00020' : '#333';
    }
    console.log('[broadcaster]', message);
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
      ws.addEventListener('error', (event) => {
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
    const message = { action, ...payload };
    state.ws.send(JSON.stringify(message));
  }

  async function handleMessage(message) {
    switch (message.type) {
      case 'roomCreated':
        await handleRoomReady(message);
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

  async function handleRoomReady(message) {
    await ensureDevice(message.router);
    await ensureSendTransport();
    connectBtn.disabled = true;
    startBtn.disabled = false;
    stopBtn.disabled = false;
    setStatus(`Room ${state.roomId} ready. Press Start Broadcast to begin.`);
  }

  async function ensureDevice(router) {
    if (!router) {
      throw new Error('Router information missing');
    }
    if (state.device) {
      return state.device;
    }
    if (!window.mediasoupClient) {
      throw new Error('mediasoup-client library not loaded');
    }
    const device = new window.mediasoupClient.Device();
    await device.load({ routerRtpCapabilities: router.rtpCapabilities });
    state.device = device;
    return device;
  }

  async function ensureSendTransport() {
    if (state.sendTransport) {
      return state.sendTransport;
    }
    send('createTransport', { roomId: state.roomId, direction: 'send' });
    const message = await waitForMessage('transportCreated', (msg) => msg.roomId === state.roomId && msg.direction === 'send');
    const { transport } = message;
    const device = state.device;
    if (!device) {
      throw new Error('Device not loaded');
    }
    const sendTransport = device.createSendTransport({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    });

    sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        send('connectTransport', {
          roomId: state.roomId,
          transportId: sendTransport.id,
          dtlsParameters
        });
        await waitForMessage('transportConnected', (msg) => msg.roomId === state.roomId && msg.transportId === sendTransport.id);
        callback();
      } catch (error) {
        errback(error);
      }
    });

    sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
      try {
        send('produce', {
          roomId: state.roomId,
          transportId: sendTransport.id,
          kind,
          rtpParameters,
          appData: { ...(appData || {}), userId: state.userId }
        });
        const produced = await waitForMessage('produced', (msg) => msg.roomId === state.roomId && !!msg.producerId);
        callback({ id: produced.producerId });
      } catch (error) {
        errback(error);
      }
    });

    sendTransport.on('connectionstatechange', (connectionState) => {
      if (connectionState === 'failed' || connectionState === 'closed') {
        setStatus(`Send transport state ${connectionState}`, true);
      }
    });

    state.sendTransport = sendTransport;
    return sendTransport;
  }

  async function startBroadcast() {
    try {
      await ensureSendTransport();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      state.localStream = stream;
      localVideo.srcObject = stream;

      for (const track of stream.getTracks()) {
        await produceTrack(track);
      }
      setStatus('Broadcasting live');
      startBtn.disabled = true;
    } catch (err) {
      console.error(err);
      setStatus(`Failed to start broadcast: ${err.message}`, true);
    }
  }

  async function produceTrack(track) {
    const transport = await ensureSendTransport();
    const producer = await transport.produce({ track, appData: { userId: state.userId, kind: track.kind } });
    state.producers.set(track.id, producer);
    producer.on('transportclose', () => state.producers.delete(track.id));
    producer.on('trackended', () => {
      state.producers.delete(track.id);
      track.stop();
    });
  }

  function stopBroadcast() {
    for (const producer of state.producers.values()) {
      try {
        producer.close();
      } catch (err) {
        console.warn('Failed to close producer', err);
      }
    }
    state.producers.clear();
    if (state.localStream) {
      state.localStream.getTracks().forEach((track) => track.stop());
      state.localStream = null;
    }
    if (state.sendTransport) {
      state.sendTransport.close();
      state.sendTransport = null;
    }
    startBtn.disabled = false;
    setStatus('Broadcast stopped');
  }

  function leaveRoom() {
    if (state.ws && state.ws.readyState === WebSocket.OPEN && state.roomId && state.userId) {
      try {
        send('leaveRoom', { roomId: state.roomId, userId: state.userId });
      } catch (err) {
        console.warn('Failed to send leaveRoom', err);
      }
    }
    stopBroadcast();
  }

  async function connectAndCreateRoom() {
    try {
      state.roomId = roomInput.value.trim();
      state.userId = userInput.value.trim();
      if (!state.roomId || !state.userId) {
        setStatus('Room ID and Broadcaster ID are required', true);
        return;
      }
      await ensureWebSocket();
      send('createRoom', { roomId: state.roomId, hostId: state.userId, name: state.roomId });
      setStatus('Creating room...');
    } catch (err) {
      console.error(err);
      setStatus(`Failed to create room: ${err.message}`, true);
    }
  }

  connectBtn.addEventListener('click', connectAndCreateRoom);
  startBtn.addEventListener('click', startBroadcast);
  stopBtn.addEventListener('click', stopBroadcast);
  window.addEventListener('beforeunload', leaveRoom);
})();
