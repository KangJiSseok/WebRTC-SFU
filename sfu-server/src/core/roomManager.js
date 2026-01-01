const { getRoom, getAllRooms, setRoom, deleteRoom } = require('./state');

async function createRoom(roomId, router, { name, hostId } = {}) {
  if (getRoom(roomId)) {
    throw new Error(`Room already exists: ${roomId}`);
  }
  const room = {
    id: roomId,
    name: name || roomId,
    hostId: hostId || null,
    createdAt: new Date(),
    router,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
    participants: new Map()
  };
  setRoom(roomId, room);
  return room;
}

function closeRoom(roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  for (const transport of room.transports.values()) {
    try {
      transport.close();
    } catch (err) {
      console.warn('Failed to close transport', err);
    }
  }
  for (const producer of room.producers.values()) {
    try {
      producer.close();
    } catch (err) {
      console.warn('Failed to close producer', err);
    }
  }
  for (const consumer of room.consumers.values()) {
    try {
      consumer.close();
    } catch (err) {
      console.warn('Failed to close consumer', err);
    }
  }
  try {
    room.router.close();
  } catch (err) {
    console.warn('Failed to close router', err);
  }
  deleteRoom(roomId);
}

function closeAllRooms() {
  getAllRooms().forEach((room) => closeRoom(room.id));
}

module.exports = {
  createRoom,
  closeRoom,
  closeAllRooms,
  getRoom
};
