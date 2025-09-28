# WebRTC SFU (mediasoup + Spring Boot)

Reimplementation of the demo to use a mediasoup-based SFU and a Spring Boot signaling service.

## Project Layout

```
webrtc-sfu/
├── signaling-server/          # Spring Boot REST + WebSocket signaling API
│   ├── src/main/java/com/signaling/
│   │   ├── config/            # WebSocket + config properties
│   │   ├── controller/        # REST endpoints for rooms/users
│   │   ├── model/             # DTOs and domain models
│   │   ├── service/           # In-memory state + mediasoup bridge
│   │   └── websocket/         # TextWebSocketHandler for signaling
│   └── src/main/resources/application.yml
├── sfu-server/                # mediasoup SFU (Node.js)
│   ├── package.json
│   ├── mediasoup-config.js
│   └── server.js              # Express REST surface for signaling server
└── client/                    # Static broadcaster/viewer clients
    ├── broadcaster.html / .js
    └── viewer.html / .js
```

## Running the stack

### 1. Spring Boot signaling server

```bash
cd signaling-server
# ensure Java 17 is available, e.g. export JAVA_HOME=$(/usr/libexec/java_home -v 17)
./gradlew bootRun
```

The server exposes REST APIs under `http://localhost:8080/api/*` and a signaling WebSocket at `ws://localhost:8080/ws`.

### 2. mediasoup SFU

```bash
cd sfu-server
npm install
npm start
```

> **Note**: mediasoup requires Python 3, C++ build tools, and a recent Node.js runtime. Install the prerequisites before running `npm install`.

Environment variables:

- `PORT` (default `3001`)
- `MEDIASOUP_ANNOUNCED_IP` to advertise a public IP when running behind NAT
- `MEDIASOUP_MIN_PORT` / `MEDIASOUP_MAX_PORT` to override the router UDP port range

### 3. Client

Open the static files directly in a browser (e.g. with a simple file:// load or via a static file server):

- `client/broadcaster.html` — create a room and publish audio/video.
- `client/viewer.html` — join an existing room and subscribe to producers.

Both pages load `mediasoup-client` from jsDelivr and communicate with the Spring Boot signaling server via WebSocket.

## Signaling Flow Overview

1. Broadcaster creates a room (`createRoom`) which provisions a mediasoup router on the SFU.
2. Broadcaster requests a send transport, connects DTLS, and produces audio/video. The signaling server pushes `newProducer` events to room participants.
3. Viewers join the room (`joinRoom`), obtain router RTP capabilities, create a receive transport, and request `consume` for each announced producer.
4. The Spring service proxies all mediasoup operations over HTTP to the Node.js SFU (`createTransport`, `connect`, `produce`, `consume`, `resume`).
5. When the last participant leaves the room the signaling service tears down mediasoup resources.

## Configuration

`signaling-server/src/main/resources/application.yml` holds the SFU base URL and default worker port range:

```yaml
mediasoup:
  sfu-server-url: http://localhost:3001
  worker-settings:
    rtc-min-port: 10000
    rtc-max-port: 10100
```

Override values via environment variables or additional Spring profiles as needed.

## Next steps

- Harden authentication/authorization.
- Persist room state beyond process memory.
- Add retries/backoff for mediasoup HTTP calls and enrich telemetry/logging.
