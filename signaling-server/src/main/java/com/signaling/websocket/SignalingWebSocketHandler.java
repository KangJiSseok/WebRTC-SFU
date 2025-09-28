package com.signaling.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.signaling.model.Room;
import com.signaling.model.RouterInfo;
import com.signaling.model.User;
import com.signaling.model.UserRole;
import com.signaling.service.MediaSoupException;
import com.signaling.service.MediaSoupService;
import com.signaling.service.RoomService;
import com.signaling.service.UserService;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class SignalingWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(SignalingWebSocketHandler.class);

    private final ObjectMapper objectMapper;
    private final RoomService roomService;
    private final UserService userService;
    private final MediaSoupService mediaSoupService;

    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final Map<String, SessionContext> contexts = new ConcurrentHashMap<>();
    private final Map<String, Set<String>> roomSessions = new ConcurrentHashMap<>();
    private final Map<String, Set<String>> roomProducers = new ConcurrentHashMap<>();

    public SignalingWebSocketHandler(ObjectMapper objectMapper, RoomService roomService,
            UserService userService, MediaSoupService mediaSoupService) {
        this.objectMapper = objectMapper;
        this.roomService = roomService;
        this.userService = userService;
        this.mediaSoupService = mediaSoupService;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.put(session.getId(), session);
        contexts.put(session.getId(), new SessionContext(session.getId()));
        log.debug("WebSocket connected: {}", session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws IOException {
        JsonNode payload = objectMapper.readTree(message.getPayload());
        String action = requiredText(payload, "action");
        log.debug("Incoming action {} from session {}", action, session.getId());
        try {
            switch (action) {
                case "createRoom" -> handleCreateRoom(session, payload);
                case "joinRoom" -> handleJoinRoom(session, payload);
                case "leaveRoom" -> handleLeaveRoom(session, payload);
                case "getRouterRtpCapabilities" -> handleRouterCapabilities(session, payload);
                case "createTransport" -> handleCreateTransport(session, payload);
                case "connectTransport" -> handleConnectTransport(session, payload);
                case "produce" -> handleProduce(session, payload);
                case "consume" -> handleConsume(session, payload);
                case "resumeConsumer" -> handleResumeConsumer(session, payload);
                default -> sendError(session, action, "Unknown action: " + action);
            }
        } catch (IllegalArgumentException | MediaSoupException ex) {
            log.warn("Action {} failed: {}", action, ex.getMessage(), ex);
            sendError(session, action, ex.getMessage());
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        SessionContext context = contexts.remove(session.getId());
        sessions.remove(session.getId());
        safeLeaveRoom(context);
    }

    private void handleCreateRoom(WebSocketSession session, JsonNode payload) {
        SessionContext context = contexts.get(session.getId());
        String roomId = requiredText(payload, "roomId");
        String hostId = requiredText(payload, "hostId");
        String name = optionalText(payload, "name");

        if (roomService.roomExists(roomId)) {
            throw new IllegalArgumentException("Room already exists: " + roomId);
        }

        Room room = roomService.createRoom(roomId, hostId, name);
        RouterInfo routerInfo = mediaSoupService.createRouter(roomId);
        roomService.saveRouterInfo(roomId, routerInfo);

        UserRole role = UserRole.BROADCASTER;
        User host = new User(hostId, roomId, role, Instant.now());
        userService.addUser(host);
        roomService.addUserToRoom(roomId, hostId);

        context.roomId = roomId;
        context.userId = hostId;
        context.role = role;
        registerSession(roomId, session.getId());
        roomProducers.computeIfAbsent(roomId, key -> ConcurrentHashMap.newKeySet());

        ObjectNode response = objectMapper.createObjectNode();
        response.put("type", "roomCreated");
        response.put("roomId", roomId);
        response.set("room", toRoomNode(room));
        response.set("router", toRouterNode(routerInfo));
        response.set("participants", toParticipantsNode(roomService.getUsersInRoom(roomId)));
        response.set("producers", toProducersNode(roomId));
        send(session, response);
    }

    private void handleJoinRoom(WebSocketSession session, JsonNode payload) {
        SessionContext context = contexts.get(session.getId());
        String roomId = requiredText(payload, "roomId");
        String userId = requiredText(payload, "userId");
        UserRole role = UserRole.fromValue(requiredText(payload, "role"));

        Room room = roomService.getRoom(roomId)
                .orElseThrow(() -> new IllegalArgumentException("Room not found: " + roomId));
        RouterInfo routerInfo = roomService.getRouterInfo(roomId)
                .orElseThrow(() -> new IllegalArgumentException("Router info missing for room: " + roomId));

        User user = new User(userId, roomId, role, Instant.now());
        userService.addUser(user);
        roomService.addUserToRoom(roomId, userId);

        context.roomId = roomId;
        context.userId = userId;
        context.role = role;
        registerSession(roomId, session.getId());

        ObjectNode response = objectMapper.createObjectNode();
        response.put("type", "roomJoined");
        response.put("roomId", room.getId());
        response.put("userId", userId);
        response.put("role", role.toValue());
        response.set("router", toRouterNode(routerInfo));
        response.set("participants", toParticipantsNode(roomService.getUsersInRoom(roomId)));
        response.set("producers", toProducersNode(roomId));
        send(session, response);
    }

    private void handleLeaveRoom(WebSocketSession session, JsonNode payload) {
        SessionContext context = contexts.get(session.getId());
        if (context == null) {
            throw new IllegalArgumentException("Session context not found");
        }
        String roomId = Optional.ofNullable(optionalText(payload, "roomId")).orElse(context.roomId);
        String userId = Optional.ofNullable(optionalText(payload, "userId")).orElse(context.userId);

        if (roomId == null || userId == null) {
            throw new IllegalArgumentException("Missing roomId or userId for leaveRoom");
        }

        safeLeaveRoom(context);
        context.clear();

        ObjectNode response = objectMapper.createObjectNode();
        response.put("type", "roomLeft");
        response.put("roomId", roomId);
        response.put("userId", userId);
        send(session, response);
    }

    private void handleRouterCapabilities(WebSocketSession session, JsonNode payload) {
        String roomId = requiredText(payload, "roomId");
        RouterInfo routerInfo = roomService.getRouterInfo(roomId)
                .orElseGet(() -> {
                    RouterInfo info = mediaSoupService.createRouter(roomId);
                    roomService.saveRouterInfo(roomId, info);
                    return info;
                });
        ObjectNode response = objectMapper.createObjectNode();
        response.put("type", "routerRtpCapabilities");
        response.put("roomId", roomId);
        response.set("router", toRouterNode(routerInfo));
        send(session, response);
    }

    private void handleCreateTransport(WebSocketSession session, JsonNode payload) {
        String roomId = requiredText(payload, "roomId");
        String direction = requiredText(payload, "direction");
        JsonNode transport = mediaSoupService.createTransport(roomId, direction);
        ObjectNode response = objectMapper.createObjectNode();
        response.put("type", "transportCreated");
        response.put("roomId", roomId);
        response.put("direction", direction);
        response.set("transport", transport);
        send(session, response);
    }

    private void handleConnectTransport(WebSocketSession session, JsonNode payload) {
        String roomId = requiredText(payload, "roomId");
        String transportId = requiredText(payload, "transportId");
        JsonNode dtlsParameters = payload.path("dtlsParameters");
        if (dtlsParameters.isMissingNode() || dtlsParameters.isNull()) {
            throw new IllegalArgumentException("dtlsParameters is required");
        }
        JsonNode result = mediaSoupService.connectTransport(roomId, transportId, dtlsParameters);
        ObjectNode response = objectMapper.createObjectNode();
        response.put("type", "transportConnected");
        response.put("roomId", roomId);
        response.put("transportId", transportId);
        if (result != null && !result.isNull()) {
            response.set("result", result);
        }
        send(session, response);
    }

    private void handleProduce(WebSocketSession session, JsonNode payload) {
        String roomId = requiredText(payload, "roomId");
        SessionContext context = contexts.get(session.getId());
        JsonNode result = mediaSoupService.createProducer(roomId, payload);
        ObjectNode response = objectMapper.createObjectNode();
        response.put("type", "produced");
        response.put("roomId", roomId);
        if (result != null) {
            response.set("producer", result);
        }
        String producerId = result != null ? optionalText(result, "producerId") : null;
        if (producerId != null) {
            response.put("producerId", producerId);
            if (context != null) {
                context.producerIds.add(producerId);
            }
            roomProducers.computeIfAbsent(roomId, key -> ConcurrentHashMap.newKeySet()).add(producerId);
            ObjectNode notification = objectMapper.createObjectNode();
            notification.put("type", "newProducer");
            notification.put("roomId", roomId);
            notification.put("producerId", producerId);
            broadcastToRoom(roomId, session.getId(), notification);
        }
        send(session, response);
    }

    private void handleConsume(WebSocketSession session, JsonNode payload) {
        String roomId = requiredText(payload, "roomId");
        JsonNode result = mediaSoupService.createConsumer(roomId, payload);
        ObjectNode response = objectMapper.createObjectNode();
        response.put("type", "consumed");
        response.put("roomId", roomId);
        if (result != null) {
            response.set("consumer", result);
        }
        send(session, response);
    }

    private void handleResumeConsumer(WebSocketSession session, JsonNode payload) {
        String roomId = requiredText(payload, "roomId");
        String consumerId = requiredText(payload, "consumerId");
        JsonNode result = mediaSoupService.resumeConsumer(roomId, consumerId);
        ObjectNode response = objectMapper.createObjectNode();
        response.put("type", "consumerResumed");
        response.put("roomId", roomId);
        response.put("consumerId", consumerId);
        if (result != null) {
            response.set("result", result);
        }
        send(session, response);
    }

    private void safeLeaveRoom(SessionContext context) {
        if (context == null || context.roomId == null || context.userId == null) {
            return;
        }
        String roomId = context.roomId;
        String userId = context.userId;

        userService.removeUser(userId);
        roomService.removeUserFromRoom(roomId, userId);

        roomSessions.computeIfPresent(roomId, (key, set) -> {
            set.remove(context.sessionId);
            return set.isEmpty() ? null : set;
        });

        if (!context.producerIds.isEmpty()) {
            context.producerIds.forEach(producerId -> removeProducer(roomId, producerId, context.sessionId));
            context.producerIds.clear();
        }

        if (roomService.getUsersInRoom(roomId).isEmpty()) {
            try {
                mediaSoupService.closeRoom(roomId);
            } catch (MediaSoupException ex) {
                log.debug("Ignored mediasoup close error for room {}: {}", roomId, ex.getMessage());
            }
            roomService.deleteRoom(roomId);
            roomProducers.remove(roomId);
            roomSessions.remove(roomId);
            log.info("Room {} closed due to no participants", roomId);
        }
    }

    private ObjectNode toRoomNode(Room room) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("id", room.getId());
        node.put("name", room.getName());
        node.put("hostId", room.getHostId());
        node.put("routerId", room.getRouterId());
        node.put("createdAt", room.getCreatedAt().toString());
        return node;
    }

    private void registerSession(String roomId, String sessionId) {
        roomSessions.computeIfAbsent(roomId, key -> ConcurrentHashMap.newKeySet()).add(sessionId);
    }

    private ArrayNode toProducersNode(String roomId) {
        ArrayNode arrayNode = objectMapper.createArrayNode();
        Set<String> producers = roomProducers.get(roomId);
        if (producers != null) {
            producers.stream().filter(Objects::nonNull).forEach(arrayNode::add);
        }
        return arrayNode;
    }

    private void broadcastToRoom(String roomId, String excludeSessionId, ObjectNode payload) {
        Set<String> sessionIds = roomSessions.get(roomId);
        if (sessionIds == null || sessionIds.isEmpty()) {
            return;
        }
        for (String sessionId : sessionIds) {
            if (sessionId == null || sessionId.equals(excludeSessionId)) {
                continue;
            }
            WebSocketSession target = sessions.get(sessionId);
            if (target != null && target.isOpen()) {
                send(target, payload.deepCopy());
            }
        }
    }

    private void removeProducer(String roomId, String producerId, String excludeSessionId) {
        roomProducers.computeIfPresent(roomId, (key, set) -> {
            set.remove(producerId);
            return set.isEmpty() ? null : set;
        });
        if (producerId != null) {
            ObjectNode notification = objectMapper.createObjectNode();
            notification.put("type", "producerClosed");
            notification.put("roomId", roomId);
            notification.put("producerId", producerId);
            broadcastToRoom(roomId, excludeSessionId, notification);
        }
    }

    private ObjectNode toRouterNode(RouterInfo routerInfo) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("roomId", routerInfo.getRoomId());
        node.put("routerId", routerInfo.getRouterId());
        node.set("rtpCapabilities", objectMapper.valueToTree(routerInfo.getRtpCapabilities()));
        node.put("createdAt", routerInfo.getCreatedAt().toString());
        return node;
    }

    private ArrayNode toParticipantsNode(List<String> participants) {
        ArrayNode arrayNode = objectMapper.createArrayNode();
        participants.stream().filter(Objects::nonNull).forEach(arrayNode::add);
        return arrayNode;
    }

    private String requiredText(JsonNode node, String field) {
        String value = optionalText(node, field);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value;
    }

    private String optionalText(JsonNode node, String field) {
        JsonNode valueNode = node.get(field);
        if (valueNode == null || valueNode.isNull()) {
            return null;
        }
        return valueNode.asText();
    }

    private void send(WebSocketSession session, ObjectNode payload) {
        try {
            session.sendMessage(new TextMessage(payload.toString()));
        } catch (IOException ex) {
            log.error("Failed to send message to session {}", session.getId(), ex);
        }
    }

    private void sendError(WebSocketSession session, String action, String message) {
        ObjectNode error = objectMapper.createObjectNode();
        error.put("type", "error");
        error.put("action", action);
        error.put("message", message);
        send(session, error);
    }

    private static class SessionContext {
        private final String sessionId;
        private String userId;
        private String roomId;
        private UserRole role;
        private final Set<String> producerIds = ConcurrentHashMap.newKeySet();

        private SessionContext(String sessionId) {
            this.sessionId = sessionId;
        }

        private void clear() {
            this.userId = null;
            this.roomId = null;
            this.role = null;
            this.producerIds.clear();
        }
    }
}
