package com.signaling.service;

import com.signaling.model.RoomEvent;
import com.signaling.model.RoomEventType;
import com.signaling.repository.RoomEventRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RoomEventService {

    private final RoomEventRepository roomEventRepository;

    public RoomEventService(RoomEventRepository roomEventRepository) {
        this.roomEventRepository = roomEventRepository;
    }

    @Transactional
    public SaveResult saveIfNotExists(RoomEvent event) {
        Optional<RoomEvent> existing = roomEventRepository.findByEventId(event.getEventId());
        if (existing.isPresent()) {
            return new SaveResult(existing.get(), false);
        }
        RoomEvent saved = roomEventRepository.save(event);
        return new SaveResult(saved, true);
    }

    @Transactional(readOnly = true)
    public List<RoomEvent> search(String roomId, Instant from, Instant to, List<RoomEventType> types,
            Instant cursorTime, Long cursorId, boolean forward, int limitPlusOne) {
        return roomEventRepository.search(roomId, from, to, types, cursorTime, cursorId, forward, limitPlusOne);
    }

    @Transactional(readOnly = true)
    public long count(String roomId, Instant from, Instant to, List<RoomEventType> types) {
        return roomEventRepository.count(roomId, from, to, types);
    }

    public static class SaveResult {
        private final RoomEvent event;
        private final boolean created;

        public SaveResult(RoomEvent event, boolean created) {
            this.event = event;
            this.created = created;
        }

        public RoomEvent getEvent() {
            return event;
        }

        public boolean isCreated() {
            return created;
        }
    }
}
