package com.signaling.domain.room.service;

import com.signaling.domain.event.repository.RoomEventRepository;
import com.signaling.domain.event.entity.RoomEventType;
import com.signaling.domain.event.entity.RoomEvent;
import com.signaling.domain.room.dto.RoomListResponse;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class RoomQueryService {

    private final RoomEventRepository roomEventRepository;

    public RoomQueryService(RoomEventRepository roomEventRepository) {
        this.roomEventRepository = roomEventRepository;
    }

    public List<RoomListResponse> listActiveRooms() {
        List<RoomEvent> events = roomEventRepository.findAll();
        Map<String, RoomEvent> created = events.stream()
                .filter(event -> event.getEventType() == RoomEventType.ROOM_CREATED)
                .collect(Collectors.toMap(RoomEvent::getRoomId, event -> event, (a, b) -> a));
        events.stream()
                .filter(event -> event.getEventType() == RoomEventType.ROOM_CLOSED)
                .forEach(event -> created.remove(event.getRoomId()));
        return created.values().stream()
                .sorted(Comparator.comparing(RoomEvent::getOccurredAt).reversed())
                .map(event -> new RoomListResponse(
                        event.getRoomId(),
                        valueOf(event.getPayload().get("hostId")),
                        event.getOccurredAt()
                ))
                .collect(Collectors.toList());
    }

    private String valueOf(Object value) {
        return value == null ? null : value.toString();
    }
}
