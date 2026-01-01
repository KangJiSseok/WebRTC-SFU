package com.signaling.domain.event.repository;

import com.signaling.domain.event.entity.RoomEvent;
import com.signaling.domain.event.entity.RoomEventType;
import java.time.Instant;
import java.util.List;

public interface RoomEventRepositoryCustom {
    List<RoomEvent> search(String roomId, Instant from, Instant to, List<RoomEventType> types,
            Instant cursorTime, Long cursorId, boolean forward, int limitPlusOne);
    long count(String roomId, Instant from, Instant to, List<RoomEventType> types);
}
