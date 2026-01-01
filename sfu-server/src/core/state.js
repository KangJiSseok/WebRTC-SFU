const rooms = new Map();

function getRoom(roomId) {
  return rooms.get(roomId);
}

function getAllRooms() {
  return Array.from(rooms.values());
}

function setRoom(roomId, roomState) {
  rooms.set(roomId, roomState);
}

function deleteRoom(roomId) {
  rooms.delete(roomId);
}

module.exports = {
  rooms,
  getRoom,
  getAllRooms,
  setRoom,
  deleteRoom
};
