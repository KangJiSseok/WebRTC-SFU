package com.signaling.repository;

import com.signaling.model.RoomEvent;
import com.signaling.model.RoomEventType;
import java.time.Instant;
import java.util.List;

public interface RoomEventRepositoryCustom {
    List<RoomEvent> search(String roomId, Instant from, Instant to, List<RoomEventType> types,
            Instant cursorTime, Long cursorId, boolean forward, int limitPlusOne);
    long count(String roomId, Instant from, Instant to, List<RoomEventType> types);
}
