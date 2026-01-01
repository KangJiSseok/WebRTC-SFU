require('dotenv').config();
const { createWebSocketServer } = require('./signaling/wsServer');
const roomManager = require('./core/roomManager');
const { closeWorker } = require('./core/mediasoupService');

function start() {
  createWebSocketServer();
}

start();

function shutdown() {
  roomManager.closeAllRooms();
  closeWorker();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
