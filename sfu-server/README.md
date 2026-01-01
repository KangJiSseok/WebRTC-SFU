# SFU Server (Node)

This service hosts the WebSocket signaling server and mediasoup control plane.

## Environment variables

- `SPRING_EVENT_BASE_URL` (required for event delivery)
  - Example: `http://localhost:8080`
- `INTERNAL_API_TOKEN` (optional)
  - Must match Spring `INTERNAL_API_TOKEN` when internal auth is enabled.
- `LOG_LEVEL` (optional, default: `info`)
  - `debug | info | warn | error`
- `EVENT_RETRY_MAX` (optional, default: `5`)
- `EVENT_RETRY_BASE_MS` (optional, default: `500`)
- `EVENT_RETRY_MAX_MS` (optional, default: `10000`)
- `EVENT_DLQ_PATH` (optional, default: `./event-dlq.log`)
- `JWT_PUBLIC_KEY` (optional)
  - Inline PEM string.
- `JWT_PUBLIC_KEY_PATH` (optional)
  - Path to PEM file. Used if `JWT_PUBLIC_KEY` is not set.
- `JWT_AUTH_DISABLED` (optional, default: `false`)
  - Set `true` to bypass JWT verification in local development.
- `JWT_ISSUER` (optional)
- `JWT_AUDIENCE` (optional)
- `MEDIASOUP_ANNOUNCED_IP` (optional)
- `MEDIASOUP_MIN_PORT` (optional, default: `10000`)
- `MEDIASOUP_MAX_PORT` (optional, default: `10100`)
- `WS_PORT` or `PORT` (optional, default: `3001`)

## Example

```bash
export SPRING_EVENT_BASE_URL=http://localhost:8080
export INTERNAL_API_TOKEN=replace-with-shared-token
export JWT_PUBLIC_KEY_PATH=./keys/public.pem
export JWT_ISSUER=https://auth.example.com
export JWT_AUDIENCE=sfu-client
export MEDIASOUP_ANNOUNCED_IP=1.2.3.4
export WS_PORT=3001
```

## Token issuance (Spring)

Spring can issue a dev token via `POST /api/auth/token`:

```bash
curl -X POST http://localhost:8080/api/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"subject":"user-1","role":"BROADCASTER"}'
```

## SFU token access guard (Spring)

To protect the `/api/rooms/{roomId}/sfu-token` endpoint, set `SFU_TOKEN_HASH`
with a BCrypt hash and pass the raw token via `X-Access-Token`.
