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

/**
 * 브라우저와의 WebSocket 시그널링 메시지를 처리하고 mediasoup REST 호출을 중계한다.
 */
@Component
public class SignalingWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(SignalingWebSocketHandler.class);

    private final ObjectMapper objectMapper;
    private final RoomService roomService;
    private final UserService userService;
    private final MediaSoupService mediaSoupService;

    // 인메모리 데이터 관리용 컬렉션들 (스레드 안전성을 위해 ConcurrentHashMap 사용)
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>(); // 세션 ID -> WebSocket 세션
    private final Map<String, SessionContext> contexts = new ConcurrentHashMap<>(); // 세션 ID -> 세션 컨텍스트
    private final Map<String, Set<String>> roomSessions = new ConcurrentHashMap<>(); // 방 ID -> 세션 ID 목록
    private final Map<String, Set<String>> roomProducers = new ConcurrentHashMap<>(); // 방 ID -> Producer ID 목록

    public SignalingWebSocketHandler(ObjectMapper objectMapper, RoomService roomService,
            UserService userService, MediaSoupService mediaSoupService) {
        this.objectMapper = objectMapper;
        this.roomService = roomService;
        this.userService = userService;
        this.mediaSoupService = mediaSoupService;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        // WebSocket 연결이 성공했을 때 호출되는 메서드
        // 클라이언트와의 실시간 통신을 위한 세션을 등록하고 컨텍스트를 초기화
        sessions.put(session.getId(), session);
        contexts.put(session.getId(), new SessionContext(session.getId()));
        log.debug("WebSocket connected: {}", session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws IOException {
        // 클라이언트로부터 WebSocket 메시지를 받았을 때 호출되는 핵심 메서드
        // JSON 메시지를 파싱하고 action에 따라 적절한 핸들러로 라우팅
        JsonNode payload = objectMapper.readTree(message.getPayload());
        String action = requiredText(payload, "action");
        log.debug("Incoming action {} from session {}", action, session.getId());
        try {
            switch (action) {
                case "createRoom" -> handleCreateRoom(session, payload); // 방 생성 (브로드캐스터)
                case "joinRoom" -> handleJoinRoom(session, payload); // 방 참여 (뷰어)
                case "leaveRoom" -> handleLeaveRoom(session, payload); // 방 나가기
                case "getRouterRtpCapabilities" -> handleRouterCapabilities(session, payload); // 라우터 RTP 능력 조회
                case "createTransport" -> handleCreateTransport(session, payload); // WebRTC Transport 생성
                case "connectTransport" -> handleConnectTransport(session, payload); // Transport 연결
                case "produce" -> handleProduce(session, payload); // 미디어 Producer 생성
                case "consume" -> handleConsume(session, payload); // 미디어 Consumer 생성
                case "resumeConsumer" -> handleResumeConsumer(session, payload); // Consumer 재개
                default -> sendError(session, action, "Unknown action: " + action);
            }
        } catch (IllegalArgumentException | MediaSoupException ex) {
            log.warn("Action {} failed: {}", action, ex.getMessage(), ex);
            sendError(session, action, ex.getMessage());
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        // 연결이 끊어지면 해당 세션과 사용자를 방에서 정리한다.
        SessionContext context = contexts.remove(session.getId());
        sessions.remove(session.getId());
        safeLeaveRoom(context);
    }

    private void handleCreateRoom(WebSocketSession session, JsonNode payload) {
        // 브로드캐스터가 방을 생성할 때 호출되는 핵심 메서드
        // 1. 방 생성 및 mediasoup 라우터 생성
        // 2. 브로드캐스터를 방에 등록
        // 3. 클라이언트에게 방 생성 완료 응답 전송
        SessionContext context = contexts.get(session.getId());
        String roomId = requiredText(payload, "roomId");
        String hostId = requiredText(payload, "hostId");
        String name = optionalText(payload, "name");

        // 방이 이미 존재하는지 확인
        if (roomService.roomExists(roomId)) {
            throw new IllegalArgumentException("Room already exists: " + roomId);
        }

        // 1. 방 생성 및 mediasoup 라우터 생성
        Room room = roomService.createRoom(roomId, hostId, name);
        RouterInfo routerInfo = mediaSoupService.createRouter(roomId); // mediasoup SFU 서버에 라우터 생성 요청
        roomService.saveRouterInfo(roomId, routerInfo);

        // 2. 브로드캐스터를 방에 등록
        UserRole role = UserRole.BROADCASTER;
        User host = new User(hostId, roomId, role, Instant.now());
        userService.addUser(host);
        roomService.addUserToRoom(roomId, hostId);

        // 세션 컨텍스트 업데이트
        context.roomId = roomId;
        context.userId = hostId;
        context.role = role;
        registerSession(roomId, session.getId());
        roomProducers.computeIfAbsent(roomId, key -> ConcurrentHashMap.newKeySet());

        // 3. 클라이언트에게 방 생성 완료 응답 전송
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
        // 뷰어가 방에 참여할 때 호출되는 핵심 메서드
        // 1. 방 존재 여부 확인
        // 2. 뷰어를 방에 등록
        // 3. 현재 방의 상태(참여자, Producer 목록)를 클라이언트에게 전송
        SessionContext context = contexts.get(session.getId());
        String roomId = requiredText(payload, "roomId");
        String userId = requiredText(payload, "userId");
        UserRole role = UserRole.fromValue(requiredText(payload, "role"));

        // 1. 방 존재 여부 확인
        Room room = roomService.getRoom(roomId)
                .orElseThrow(() -> new IllegalArgumentException("Room not found: " + roomId));
        RouterInfo routerInfo = roomService.getRouterInfo(roomId)
                .orElseThrow(() -> new IllegalArgumentException("Router info missing for room: " + roomId));

        // 2. 뷰어를 방에 등록
        User user = new User(userId, roomId, role, Instant.now());
        userService.addUser(user);
        roomService.addUserToRoom(roomId, userId);

        // 세션 컨텍스트 업데이트
        context.roomId = roomId;
        context.userId = userId;
        context.role = role;
        registerSession(roomId, session.getId());

        // 3. 현재 방의 상태를 클라이언트에게 전송
        ObjectNode response = objectMapper.createObjectNode();
        response.put("type", "roomJoined");
        response.put("roomId", room.getId());
        response.put("userId", userId);
        response.put("role", role.toValue());
        response.set("router", toRouterNode(routerInfo));
        response.set("participants", toParticipantsNode(roomService.getUsersInRoom(roomId)));
        response.set("producers", toProducersNode(roomId)); // 기존 Producer 목록 전송
        send(session, response);
    }

    // 사용자가 방을 떠날 때 호출. 명시된 roomId/userId가 없으면 세션 정보로 대체한다.
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

    // 클라이언트가 Router RTP 정보를 요청하면 캐시에서 조회하거나 새로 생성한다.
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

    // send/recv 방향에 맞는 transport를 생성하고 결과를 브라우저에 반환한다.
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

    // 브라우저에서 DTLS 파라미터를 전달하면 transport를 연결 상태로 전환한다.
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
        // 브로드캐스터가 미디어 스트림을 생성할 때 호출되는 핵심 메서드
        // 1. mediasoup SFU 서버에 Producer 생성 요청
        // 2. Producer ID를 방에 등록
        // 3. 같은 방의 다른 뷰어들에게 새 Producer 알림 전송
        String roomId = requiredText(payload, "roomId");
        SessionContext context = contexts.get(session.getId());
        JsonNode result = mediaSoupService.createProducer(roomId, payload); // mediasoup SFU 서버에 Producer 생성 요청
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
                context.producerIds.add(producerId); // 세션 컨텍스트에 Producer ID 추가
            }
            roomProducers.computeIfAbsent(roomId, key -> ConcurrentHashMap.newKeySet()).add(producerId); // 방의 Producer 목록에 추가
            // 같은 방의 다른 뷰어들에게 새 Producer 알림 전송
            ObjectNode notification = objectMapper.createObjectNode();
            notification.put("type", "newProducer");
            notification.put("roomId", roomId);
            notification.put("producerId", producerId);
            broadcastToRoom(roomId, session.getId(), notification);
        }
        send(session, response);
    }

    // 뷰어가 특정 producer를 소비하고자 할 때 호출된다.
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

    // consumer가 생성된 뒤 실제 스트림을 흘려보내기 위해 resume을 요청한다.
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
        // 사용자가 방을 나갈 때 호출되는 정리 메서드
        // 1. 사용자 정보 정리
        // 2. Producer 정리
        // 3. 방이 비어있으면 방 자체를 삭제
        if (context == null || context.roomId == null || context.userId == null) {
            return;
        }
        String roomId = context.roomId;
        String userId = context.userId;

        // 1. 사용자 정보 정리
        userService.removeUser(userId);
        roomService.removeUserFromRoom(roomId, userId);

        // 방 세션 목록에서 제거
        roomSessions.computeIfPresent(roomId, (key, set) -> {
            set.remove(context.sessionId);
            return set.isEmpty() ? null : set;
        });

        // 2. Producer 정리 (브로드캐스터가 나갈 때)
        if (!context.producerIds.isEmpty()) {
            context.producerIds.forEach(producerId -> removeProducer(roomId, producerId, context.sessionId));
            context.producerIds.clear();
        }

        // 3. 방이 비어있으면 방 자체를 삭제
        if (roomService.getUsersInRoom(roomId).isEmpty()) {
            try {
                mediaSoupService.closeRoom(roomId); // mediasoup SFU 서버에서 방 삭제
            } catch (MediaSoupException ex) {
                log.debug("Ignored mediasoup close error for room {}: {}", roomId, ex.getMessage());
            }
            roomService.deleteRoom(roomId);
            roomProducers.remove(roomId);
            roomSessions.remove(roomId);
            log.info("Room {} closed due to no participants", roomId);
        }
    }

    // Room 정보를 JSON 노드로 직렬화한다.
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
        // 방에 속한 WebSocket 세션 ID를 추적한다.
        roomSessions.computeIfAbsent(roomId, key -> ConcurrentHashMap.newKeySet()).add(sessionId);
    }

    private ArrayNode toProducersNode(String roomId) {
        // 방에 존재하는 Producer 목록을 JSON 배열로 만든다.
        ArrayNode arrayNode = objectMapper.createArrayNode();
        Set<String> producers = roomProducers.get(roomId);
        if (producers != null) {
            producers.stream().filter(Objects::nonNull).forEach(arrayNode::add);
        }
        return arrayNode;
    }

    private void broadcastToRoom(String roomId, String excludeSessionId, ObjectNode payload) {
        // 동일한 방의 다른 세션에게 알림을 전달한다.
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
        // Producer가 사라졌을 때 목록에서 제거하고 뷰어에게 알린다.
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
        // JSON 노드에서 필수 문자열 값을 추출한다.
        String value = optionalText(node, field);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value;
    }

    private String optionalText(JsonNode node, String field) {
        // 존재하지 않을 수도 있는 문자열 값을 읽어온다.
        JsonNode valueNode = node.get(field);
        if (valueNode == null || valueNode.isNull()) {
            return null;
        }
        return valueNode.asText();
    }

    private void send(WebSocketSession session, ObjectNode payload) {
        // 단일 세션에 JSON 메시지를 전송한다.
        try {
            session.sendMessage(new TextMessage(payload.toString()));
        } catch (IOException ex) {
            log.error("Failed to send message to session {}", session.getId(), ex);
        }
    }

    private void sendError(WebSocketSession session, String action, String message) {
        // 에러 응답을 표준 포맷으로 전송한다.
        ObjectNode error = objectMapper.createObjectNode();
        error.put("type", "error");
        error.put("action", action);
        error.put("message", message);
        send(session, error);
    }

    private static class SessionContext {
        // 각 WebSocket 세션이 어떤 방/사용자/producer와 연결되어 있는지를 추적한다.
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
