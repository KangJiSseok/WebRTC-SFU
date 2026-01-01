import { useCallback, useEffect, useRef, useState } from 'react'
import * as mediasoupClient from 'mediasoup-client'

const RAW_WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001'
const WS_TOKEN = import.meta.env.VITE_WS_TOKEN
const WS_URL = WS_TOKEN ? appendToken(RAW_WS_URL, WS_TOKEN) : RAW_WS_URL

function appendToken(url, token) {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}token=${encodeURIComponent(token)}`
}

function createInitialState() {
  return {
    ws: null,
    roomId: '',
    userId: '',
    device: null,
    recvTransport: null,
    consumers: new Map(),
    listeners: []
  }
}

function Viewer() {
  const [roomId, setRoomId] = useState('')
  const [userId, setUserId] = useState('')
  const [status, setStatus] = useState('')
  const [isError, setIsError] = useState(false)
  const [canJoin, setCanJoin] = useState(true)
  const [canLeave, setCanLeave] = useState(false)
  const remoteVideoRef = useRef(null)
  const stateRef = useRef(createInitialState())
  const mountedRef = useRef(false)

  const updateStatus = useCallback((message, error = false) => {
    if (!mountedRef.current) return
    setStatus(message)
    setIsError(error)
    console.log('[viewer]', message)
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

  const ensureRecvTransport = useCallback(async () => {
    if (stateRef.current.recvTransport) return stateRef.current.recvTransport
    const { roomId: currentRoomId } = stateRef.current
    send('createTransport', { roomId: currentRoomId, direction: 'recv' })
    const message = await waitForMessage(
      'transportCreated',
      (msg) => msg.roomId === currentRoomId && msg.direction === 'recv'
    )
    const { transport } = message
    const device = stateRef.current.device
    if (!device) throw new Error('Device not loaded')
    const recvTransport = device.createRecvTransport({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    })

    recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        send('connectTransport', {
          roomId: currentRoomId,
          transportId: recvTransport.id,
          dtlsParameters
        })
        await waitForMessage(
          'transportConnected',
          (msg) =>
            msg.roomId === currentRoomId && msg.transportId === recvTransport.id
        )
        callback()
      } catch (error) {
        errback(error)
      }
    })

    recvTransport.on('connectionstatechange', (connectionState) => {
      if (connectionState === 'failed' || connectionState === 'closed') {
        updateStatus(`Receive transport state ${connectionState}`, true)
      }
    })

    stateRef.current.recvTransport = recvTransport
    return recvTransport
  }, [send, updateStatus, waitForMessage])

  const ensureRemoteStream = useCallback((createIfMissing = true) => {
    const videoEl = remoteVideoRef.current
    if (!videoEl) return null
    let stream = videoEl.srcObject instanceof MediaStream ? videoEl.srcObject : null
    if (!stream && createIfMissing) {
      stream = new MediaStream()
      videoEl.srcObject = stream
    }
    return stream
  }, [])

  const attachConsumer = useCallback(
    (kind, track) => {
      const stream = ensureRemoteStream()
      if (!stream || !remoteVideoRef.current) return
      if (kind === 'video') {
        stream.getVideoTracks().forEach((t) => {
          stream.removeTrack(t)
          t.stop()
        })
        stream.addTrack(track)
        remoteVideoRef.current.srcObject = stream
        remoteVideoRef.current.play().catch(() => {})
      } else if (kind === 'audio') {
        stream.getAudioTracks().forEach((t) => {
          stream.removeTrack(t)
          t.stop()
        })
        stream.addTrack(track)
        remoteVideoRef.current.srcObject = stream
        remoteVideoRef.current.muted = false
        remoteVideoRef.current.play().catch(() => {})
      }
    },
    [ensureRemoteStream]
  )

  const removeConsumer = useCallback(
    (producerId) => {
      const entry = stateRef.current.consumers.get(producerId)
      if (!entry) return
      try {
        entry.consumer.close()
      } catch (err) {
        console.warn('Failed to close consumer', err)
      }
      const stream = ensureRemoteStream(false)
      if (stream && entry.track) {
        try {
          stream.removeTrack(entry.track)
        } catch (err) {
          console.warn('Failed to remove track', err)
        }
      }
      if (entry.track) {
        entry.track.stop()
      }
      stateRef.current.consumers.delete(producerId)
      const videoEl = remoteVideoRef.current
      if (stream && stream.getTracks().length === 0 && videoEl) {
        videoEl.srcObject = null
        videoEl.pause()
      }
    },
    [ensureRemoteStream]
  )

  const consumeProducer = useCallback(
    async (producerId) => {
      if (!producerId || stateRef.current.consumers.has(producerId)) return
      await ensureRecvTransport()
      send('consume', {
        roomId: stateRef.current.roomId,
        transportId: stateRef.current.recvTransport.id,
        producerId,
        rtpCapabilities: stateRef.current.device.rtpCapabilities
      })
      const message = await waitForMessage(
        'consumed',
        (msg) =>
          msg.roomId === stateRef.current.roomId &&
          msg.consumer &&
          msg.consumer.producerId === producerId
      )
      const info = message.consumer
      const consumer = await stateRef.current.recvTransport.consume({
        id: info.consumerId,
        producerId: info.producerId,
        kind: info.kind,
        rtpParameters: info.rtpParameters
      })

      attachConsumer(consumer.kind, consumer.track)
      stateRef.current.consumers.set(producerId, {
        consumer,
        kind: consumer.kind,
        track: consumer.track
      })
      consumer.on('transportclose', () => removeConsumer(producerId))
      consumer.on('producerclose', () => removeConsumer(producerId))

      send('resumeConsumer', {
        roomId: stateRef.current.roomId,
        consumerId: info.consumerId
      })
      await waitForMessage(
        'consumerResumed',
        (msg) =>
          msg.roomId === stateRef.current.roomId && msg.consumerId === info.consumerId
      )
    },
    [attachConsumer, ensureRecvTransport, removeConsumer, send, waitForMessage]
  )

  const handleRoomJoined = useCallback(
    async (message) => {
      await ensureDevice(message.router)
      await ensureRecvTransport()
      const producers = message.producers || []
      for (const producerId of producers) {
        await consumeProducer(producerId)
      }
      if (mountedRef.current) {
        setCanJoin(false)
        setCanLeave(true)
      }
      updateStatus(`Joined room ${stateRef.current.roomId}`)
    },
    [consumeProducer, ensureDevice, ensureRecvTransport, updateStatus]
  )

  const handleMessage = useCallback(
    async (message) => {
      switch (message.type) {
        case 'roomJoined':
          await handleRoomJoined(message)
          break
        case 'newProducer':
          await consumeProducer(message.producerId)
          break
        case 'producerClosed':
          removeConsumer(message.producerId)
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
    [consumeProducer, ensureDevice, handleRoomJoined, removeConsumer, updateStatus]
  )

  const ensureWebSocket = useCallback(() => {
    if (stateRef.current.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve(stateRef.current.ws)
    }
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL)
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

  const joinRoom = useCallback(async () => {
    try {
      const trimmedRoom = roomId.trim()
      const trimmedUser = userId.trim()
      if (!trimmedRoom || !trimmedUser) {
        updateStatus('Room ID and Viewer ID are required', true)
        return
      }
      stateRef.current.roomId = trimmedRoom
      stateRef.current.userId = trimmedUser
      await ensureWebSocket()
      send('joinRoom', { roomId: trimmedRoom, userId: trimmedUser, role: 'VIEWER' })
      updateStatus('Joining room...')
    } catch (err) {
      console.error(err)
      updateStatus(`Failed to join room: ${err.message}`, true)
    }
  }, [ensureWebSocket, roomId, send, updateStatus, userId])

  const leaveRoom = useCallback(() => {
    for (const producerId of [...stateRef.current.consumers.keys()]) {
      removeConsumer(producerId)
    }
    if (stateRef.current.recvTransport) {
      stateRef.current.recvTransport.close()
      stateRef.current.recvTransport = null
    }
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
    if (mountedRef.current) {
      setCanJoin(true)
      setCanLeave(false)
    }
    updateStatus('Left room')
    const stream = ensureRemoteStream(false)
    stream?.getTracks().forEach((track) => track.stop())
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
      remoteVideoRef.current.pause()
    }
    stateRef.current.ws?.close()
  }, [ensureRemoteStream, removeConsumer, send, updateStatus])

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
        <h2>Mediasoup Viewer</h2>
        <p>방에 참가해 방송을 시청합니다.</p>
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
            Viewer ID
            <input
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="viewer-1"
              autoComplete="off"
            />
          </label>
        </div>
        <div className="button-row">
          <button onClick={joinRoom} disabled={!canJoin}>
            Join Room
          </button>
          <button onClick={leaveRoom} disabled={!canLeave}>
            Leave Room
          </button>
        </div>
        <div className={`status ${isError ? 'status--error' : ''}`}>
          {status || 'Ready.'}
        </div>
        <div className="video-wrap">
          <video ref={remoteVideoRef} autoPlay playsInline controls />
        </div>
      </div>
    </section>
  )
}

export default Viewer
