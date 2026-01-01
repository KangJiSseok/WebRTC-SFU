function createSessionContext({ sessionId, userId, role }) {
  return {
    sessionId,
    userId,
    role,
    roomId: null,
    producerIds: new Set(),
    transportIds: new Set(),
    consumerIds: new Set()
  };
}

module.exports = {
  createSessionContext
};
