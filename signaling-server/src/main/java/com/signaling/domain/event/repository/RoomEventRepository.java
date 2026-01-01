package com.signaling.domain.event.repository;

import com.signaling.domain.event.entity.RoomEvent;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RoomEventRepository extends JpaRepository<RoomEvent, Long>, RoomEventRepositoryCustom {
    Optional<RoomEvent> findByEventId(String eventId);
}
