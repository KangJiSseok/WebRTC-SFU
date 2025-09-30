// 브로드캐스터 페이지에서 mediasoup를 통해 방송을 수행하는 핵심 로직을 캡슐화한 즉시 실행 함수
(() => {
  // 브라우저에서 유지해야 하는 방송 상태와 mediasoup 관련 정보를 모아둔 객체
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

  // 주요 DOM 요소 캐시. 신호/버튼/미리보기 비디오를 빠르게 접근하기 위해 보관한다.
  const statusEl = document.getElementById('status');
  const roomInput = document.getElementById('roomId');
  const userInput = document.getElementById('userId');
  const connectBtn = document.getElementById('connectBtn');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const localVideo = document.getElementById('localVideo');

  const WS_URL = 'ws://localhost:8080/ws';

  // 사용자에게 상태 메시지를 한국어로 전달하고 콘솔에도 기록한다.
  function setStatus(message, isError = false) {
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.style.color = isError ? '#b00020' : '#333';
    }
    console.log('[broadcaster]', message);
  }

  // 서버가 보낸 특정 응답을 대기열에 추가한다.
  function addListener(entry) {
    state.listeners.push(entry);
  }

  // 한 번 사용한 리스너는 배열에서 바로 제거하여 메모리 누수를 방지한다.
  function removeListener(entry) {
    const index = state.listeners.indexOf(entry);
    if (index >= 0) {
      state.listeners.splice(index, 1);
    }
  }

  // 수신된 메시지를 검사하여 기다리고 있던 Promise를 깨운다.
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

  // 특정 타입의 WebSocket 응답을 기다리는 Promise 헬퍼. mediasoup 절차가 순차적으로 진행되도록 보장한다.
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

  // 신호 서버와의 WebSocket 연결을 생성하거나 재사용한다.
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

  // 공통 포맷으로 WebSocket 메시지를 전송한다.
  function send(action, payload) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    const message = { action, ...payload };
    state.ws.send(JSON.stringify(message));
  }

  // 서버로부터 수신한 메시지를 타입별로 분기 처리한다.
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

  // 방 생성 응답을 수신했을 때 디바이스/트랜스포트를 준비한다.
  async function handleRoomReady(message) {
    await ensureDevice(message.router);
    await ensureSendTransport();
    connectBtn.disabled = true;
    startBtn.disabled = false;
    stopBtn.disabled = false;
    setStatus(`Room ${state.roomId} ready. Press Start Broadcast to begin.`);
  }

  // mediasoup Device를 초기화하여 라우터의 RTP 능력을 로드한다.
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

  // 브로드캐스터가 사용할 송신 트랜스포트를 생성 및 연결한다.
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

  // 카메라/마이크 스트림을 가져와 각 트랙을 mediasoup producer로 전송한다.
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

  // 개별 미디어 트랙을 송신 트랜스포트에 연결하고 producer를 생성한다.
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

  // 방송을 중단하면서 producer와 로컬 트랙을 정리한다.
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

  // 페이지 이탈 또는 수동 종료 시 방을 떠났다고 서버에 알린다.
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

  // 사용자가 입력한 ID 기반으로 WebSocket을 연결하고 방 생성을 요청한다.
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

  // 버튼/윈도 이벤트를 바인딩하여 사용자 액션을 처리한다.
  connectBtn.addEventListener('click', connectAndCreateRoom);
  startBtn.addEventListener('click', startBroadcast);
  stopBtn.addEventListener('click', stopBroadcast);
  window.addEventListener('beforeunload', leaveRoom);
})();
