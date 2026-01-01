const fs = require('fs');
const path = require('path');
const { postEvent } = require('./springClient');
const logger = require('../metrics/logger');

const queue = [];
let processing = false;

const RETRY_MAX = Number(process.env.EVENT_RETRY_MAX || 5);
const RETRY_BASE_MS = Number(process.env.EVENT_RETRY_BASE_MS || 500);
const RETRY_MAX_MS = Number(process.env.EVENT_RETRY_MAX_MS || 10000);

async function publishEvent(event) {
  if (!event || !event.roomId || !event.eventType) {
    return null;
  }
  const payload = {
    eventId: event.eventId || cryptoRandomId(),
    eventType: event.eventType,
    occurredAt: event.occurredAt || new Date().toISOString(),
    roomId: event.roomId,
    payload: event.payload || {}
  };
  enqueue({ payload, attempts: 0 });
  processQueue();
  return payload.eventId;
}

function enqueue(entry) {
  queue.push(entry);
}

async function processQueue() {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const entry = queue.shift();
    try {
      const result = await postEvent(entry.payload);
      if (result && (result.status === 200 || result.status === 201)) {
        logger.debug('spring event acknowledged', {
          eventType: entry.payload.eventType,
          status: result.status
        });
      } else {
        logger.warn('spring event unknown status', {
          eventType: entry.payload.eventType,
          status: result ? result.status : 'unknown'
        });
      }
    } catch (err) {
      const attempts = entry.attempts + 1;
      if (attempts <= RETRY_MAX) {
        const delay = computeBackoff(attempts);
        logger.warn('spring event post failed, retrying', {
          eventType: entry.payload.eventType,
          attempts,
          delay
        });
        scheduleRetry({ payload: entry.payload, attempts }, delay);
      } else {
        logger.error('spring event post failed, giving up', {
          eventType: entry.payload.eventType,
          attempts
        });
        writeToDlq(entry.payload, err);
      }
    }
  }
  processing = false;
}

function scheduleRetry(entry, delay) {
  setTimeout(() => {
    enqueue(entry);
    processQueue();
  }, delay);
}

function computeBackoff(attempts) {
  const base = Math.min(RETRY_BASE_MS * 2 ** (attempts - 1), RETRY_MAX_MS);
  const jitter = Math.floor(Math.random() * 200);
  return base + jitter;
}

function cryptoRandomId() {
  const crypto = require('crypto');
  return crypto.randomUUID();
}

function writeToDlq(payload, error) {
  const filePath = process.env.EVENT_DLQ_PATH
    ? path.resolve(process.env.EVENT_DLQ_PATH)
    : path.join(process.cwd(), 'event-dlq.log');
  const record = {
    failedAt: new Date().toISOString(),
    payload,
    error: error ? error.message : 'unknown'
  };
  try {
    fs.appendFileSync(filePath, JSON.stringify(record) + '\n');
  } catch (err) {
    logger.error('failed to write dlq', { message: err.message });
  }
}

module.exports = {
  publishEvent
};
