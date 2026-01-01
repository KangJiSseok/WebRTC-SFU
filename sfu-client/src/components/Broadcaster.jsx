import { useCallback, useEffect, useRef, useState } from 'react'
import * as mediasoupClient from 'mediasoup-client'

const RAW_WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001'
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

function appendToken(url, token) {
  if (!token) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}token=${encodeURIComponent(token)}`
}

function buildWsUrl(token) {
  return appendToken(RAW_WS_URL, token)
}

async function fetchSfuToken(roomId, role) {
  const response = await fetch(
    `${API_BASE}/api/rooms/${roomId}/sfu-token?role=${encodeURIComponent(role)}`,
    {
      method: 'POST',
      credentials: 'include'
    }
  )
  if (!response.ok) {
    throw new Error('Failed to issue SFU token. Please login.')
  }
  const data = await response.json()
  return data.token
}

function getMemberId() {
  const raw = localStorage.getItem('sfu_member')
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    return parsed.id ? String(parsed.id) : ''
  } catch (err) {
    return ''
  }
}

function addRoomToList(roomId) {
  if (!roomId) return
  const list = loadRooms()
  if (!list.includes(roomId)) {
    list.unshift(roomId)
    localStorage.setItem('sfu_rooms', JSON.stringify(list.slice(0, 20)))
  }
}

function loadRooms() {
  try {
    const stored = localStorage.getItem('sfu_rooms')
    return stored ? JSON.parse(stored) : []
  } catch (err) {
    return []
  }
}

function createInitialState() {
  return {
    ws: null,
    roomId: '',
    userId: '',
    sfuToken: '',
    device: null,
    sendTransport: null,
    localStream: null,
    producers: new Map(),
    listeners: []
  }
}

function Broadcaster() {
  const [roomId, setRoomId] = useState('')
  const [status, setStatus] = useState('')
  const [isError, setIsError] = useState(false)
  const [canCreate, setCanCreate] = useState(true)
  const [canStart, setCanStart] = useState(false)
  const [canStop, setCanStop] = useState(false)
  const localVideoRef = useRef(null)
  const stateRef = useRef(createInitialState())
  const mountedRef = useRef(false)

  const updateStatus = useCallback((message, error = false) => {
    if (!mountedRef.current) return
    setStatus(message)
    setIsError(error)
    console.log('[broadcaster]', message)
  }, [])

  const addListener = useCallback((entry) => {
    stateRef.current.listeners.push(entry)
  }, [])

  const removeListener = useCallback((entry) => {
    const listeners = stateRef.current.listeners
    const index = listeners.indexOf(entry)
    if (index >= 0) {
      listeners.splice(index, 1)
    }
  }, [])

  const dispatchListeners = useCallback(
    (message) => {
      const listeners = [...stateRef.current.listeners]
      for (const entry of listeners) {
        if (entry.type !== message.type) continue
        if (!entry.predicate(message)) continue
        clearTimeout(entry.timer)
        removeListener(entry)
        entry.resolve(message)
      }
    },
    [removeListener]
  )

  const waitForMessage = useCallback(
    (type, predicate = () => true, timeout = 5000) =>
      new Promise((resolve, reject) => {
        const entry = {
          type,
          predicate,
          resolve,
          reject,
          timer: setTimeout(() => {
            removeListener(entry)
            reject(new Error(`Timeout waiting for ${type}`))
          }, timeout)
        }
        addListener(entry)
      }),
    [addListener, removeListener]
  )

  const send = useCallback((action, payload) => {
    const ws = stateRef.current.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }
    ws.send(JSON.stringify({ action, ...payload }))
  }, [])

  const ensureDevice = useCallback(async (router) => {
    if (!router) throw new Error('Router information missing')
    if (stateRef.current.device) return stateRef.current.device
    const device = new mediasoupClient.Device()
    await device.load({ routerRtpCapabilities: router.rtpCapabilities })
    stateRef.current.device = device
    return device
  }, [])

  const ensureSendTransport = useCallback(async () => {
    if (stateRef.current.sendTransport) return stateRef.current.sendTransport
    const { roomId: currentRoomId } = stateRef.current
    send('createTransport', { roomId: currentRoomId, direction: 'send' })
    const message = await waitForMessage(
      'transportCreated',
      (msg) => msg.roomId === currentRoomId && msg.direction === 'send'
    )
    const { transport } = message
    const device = stateRef.current.device
    if (!device) throw new Error('Device not loaded')
    const sendTransport = device.createSendTransport({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    })

    sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        send('connectTransport', {
          roomId: currentRoomId,
          transportId: sendTransport.id,
          dtlsParameters
        })
        await waitForMessage(
          'transportConnected',
          (msg) =>
            msg.roomId === currentRoomId && msg.transportId === sendTransport.id
        )
        callback()
      } catch (error) {
        errback(error)
      }
    })

    sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
      try {
        send('produce', {
          roomId: currentRoomId,
          transportId: sendTransport.id,
          kind,
          rtpParameters,
          appData: { ...(appData || {}), userId: stateRef.current.userId }
        })
        const produced = await waitForMessage(
          'produced',
          (msg) => msg.roomId === currentRoomId && !!msg.producerId
        )
        callback({ id: produced.producerId })
      } catch (error) {
        errback(error)
      }
    })

    sendTransport.on('connectionstatechange', (connectionState) => {
      if (connectionState === 'failed' || connectionState === 'closed') {
        updateStatus(`Send transport state ${connectionState}`, true)
      }
    })

    stateRef.current.sendTransport = sendTransport
    return sendTransport
  }, [send, updateStatus, waitForMessage])

  const produceTrack = useCallback(
    async (track) => {
      const transport = await ensureSendTransport()
      const producer = await transport.produce({
        track,
        appData: { userId: stateRef.current.userId, kind: track.kind }
      })
      stateRef.current.producers.set(track.id, producer)
      producer.on('transportclose', () => stateRef.current.producers.delete(track.id))
      producer.on('trackended', () => {
        stateRef.current.producers.delete(track.id)
        track.stop()
      })
    },
    [ensureSendTransport]
  )

  const stopBroadcast = useCallback(() => {
    for (const producer of stateRef.current.producers.values()) {
      try {
        producer.close()
      } catch (err) {
        console.warn('Failed to close producer', err)
      }
    }
    stateRef.current.producers.clear()
    if (stateRef.current.localStream) {
      stateRef.current.localStream.getTracks().forEach((track) => track.stop())
      stateRef.current.localStream = null
    }
    if (stateRef.current.sendTransport) {
      stateRef.current.sendTransport.close()
      stateRef.current.sendTransport = null
    }
    if (mountedRef.current) {
      setCanStart(true)
    }
    updateStatus('Broadcast stopped')
  }, [updateStatus])

  const handleRoomReady = useCallback(
    async (message) => {
      await ensureDevice(message.router)
      await ensureSendTransport()
      if (mountedRef.current) {
        setCanCreate(false)
        setCanStart(true)
        setCanStop(true)
      }
      updateStatus(`Room ${stateRef.current.roomId} ready. Press Start Broadcast to begin.`)
    },
    [ensureDevice, ensureSendTransport, updateStatus]
  )

  const handleMessage = useCallback(
    async (message) => {
      switch (message.type) {
        case 'roomCreated':
          await handleRoomReady(message)
          break
        case 'routerRtpCapabilities':
          await ensureDevice(message.router)
          break
        case 'error':
          updateStatus(`Error: ${message.message}`, true)
          break
        default:
          break
      }
    },
    [ensureDevice, handleRoomReady, updateStatus]
  )

  const ensureWebSocket = useCallback(() => {
    if (stateRef.current.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve(stateRef.current.ws)
    }
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(buildWsUrl(stateRef.current.sfuToken))
      stateRef.current.ws = ws
      ws.addEventListener('open', () => {
        updateStatus('Connected to signaling server')
        resolve(ws)
      })
      ws.addEventListener('error', () => {
        reject(new Error('WebSocket error'))
        updateStatus('WebSocket error', true)
      })
      ws.addEventListener('close', () => {
        updateStatus('WebSocket closed')
      })
      ws.addEventListener('message', async (event) => {
        try {
          const message = JSON.parse(event.data)
          dispatchListeners(message)
          await handleMessage(message)
        } catch (err) {
          console.error('Failed to handle message', err)
        }
      })
    })
  }, [dispatchListeners, handleMessage, updateStatus])

  const startBroadcast = useCallback(async () => {
    try {
      await ensureSendTransport()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      })
      stateRef.current.localStream = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      for (const track of stream.getTracks()) {
        await produceTrack(track)
      }
      updateStatus('Broadcasting live')
      if (mountedRef.current) {
        setCanStart(false)
      }
    } catch (err) {
      console.error(err)
      updateStatus(`Failed to start broadcast: ${err.message}`, true)
    }
  }, [ensureSendTransport, produceTrack, updateStatus])

  const connectAndCreateRoom = useCallback(async () => {
    try {
      const trimmedRoom = roomId.trim()
      const memberId = getMemberId()
      if (!trimmedRoom || !memberId) {
        updateStatus('Room ID and login session are required', true)
        return
      }
      stateRef.current.roomId = trimmedRoom
      stateRef.current.userId = memberId
      stateRef.current.sfuToken = await fetchSfuToken(trimmedRoom, 'BROADCASTER')
      await ensureWebSocket()
      send('createRoom', {
        roomId: trimmedRoom,
        hostId: memberId,
        name: trimmedRoom
      })
      updateStatus('Creating room...')
    } catch (err) {
      console.error(err)
      updateStatus(`Failed to create room: ${err.message}`, true)
    }
  }, [ensureWebSocket, roomId, send, updateStatus])

  const leaveRoom = useCallback(() => {
    if (
      stateRef.current.ws &&
      stateRef.current.ws.readyState === WebSocket.OPEN &&
      stateRef.current.roomId &&
      stateRef.current.userId
    ) {
      try {
        send('leaveRoom', {
          roomId: stateRef.current.roomId,
          userId: stateRef.current.userId
        })
      } catch (err) {
        console.warn('Failed to send leaveRoom', err)
      }
    }
    stopBroadcast()
    stateRef.current.ws?.close()
  }, [send, stopBroadcast])

  useEffect(() => {
    mountedRef.current = true
    const handleBeforeUnload = () => leaveRoom()
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      mountedRef.current = false
      window.removeEventListener('beforeunload', handleBeforeUnload)
      leaveRoom()
    }
  }, [leaveRoom])

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>Mediasoup Broadcaster</h2>
        <p>방을 생성하고 방송을 송출합니다.</p>
      </header>
      <div className="panel__body">
        <div className="form-grid">
          <label>
            Room ID
            <input
              value={roomId}
              onChange={(event) => setRoomId(event.target.value)}
              placeholder="room-123"
              autoComplete="off"
            />
          </label>
          <label>
            Broadcaster ID (session)
            <input value={getMemberId() || ''} readOnly />
          </label>
        </div>
        <div className="button-row">
          <button onClick={connectAndCreateRoom} disabled={!canCreate}>
            Create Room
          </button>
          <button onClick={startBroadcast} disabled={!canStart}>
            Start Broadcast
          </button>
          <button onClick={stopBroadcast} disabled={!canStop}>
            Stop
          </button>
        </div>
        <div className={`status ${isError ? 'status--error' : ''}`}>
          {status || 'Ready.'}
        </div>
        <div className="video-wrap">
          <video ref={localVideoRef} autoPlay playsInline muted />
        </div>
      </div>
    </section>
  )
}

export default Broadcaster
