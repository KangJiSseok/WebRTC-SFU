const DEFAULT_TIMEOUT_MS = 5000;
const logger = require('../metrics/logger');

async function postEvent(event) {
  const baseUrl = process.env.SPRING_EVENT_BASE_URL;
  if (!baseUrl) {
    return null;
  }
  const url = `${baseUrl}/api/rooms/${encodeURIComponent(event.roomId)}/events`;
  const token = process.env.INTERNAL_API_TOKEN || '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Server-Token': token } : {})
      },
      body: JSON.stringify(event),
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Spring event post failed: ${response.status} ${text}`);
    }
    const result = await response.json();
    logger.debug('spring event posted', {
      roomId: event.roomId,
      eventType: event.eventType,
      status: response.status
    });
    return { status: response.status, body: result };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  postEvent
};
