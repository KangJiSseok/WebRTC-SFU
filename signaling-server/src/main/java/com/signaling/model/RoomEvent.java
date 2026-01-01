package com.signaling.model;

import com.signaling.persistence.MapToJsonConverter;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Collections;
import java.util.Map;
import java.util.Objects;

@Entity
@Table(name = "room_events")
public class RoomEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "event_id", nullable = false, unique = true, length = 100)
    private String eventId;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 40)
    private RoomEventType eventType;

    @Column(name = "room_id", nullable = false, length = 100)
    private String roomId;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Lob
    @Convert(converter = MapToJsonConverter.class)
    @Column(name = "payload", columnDefinition = "json")
    private Map<String, Object> payload = Collections.emptyMap();

    protected RoomEvent() {
    }

    public RoomEvent(String eventId, RoomEventType eventType, String roomId, Instant occurredAt,
            Map<String, Object> payload) {
        this.eventId = Objects.requireNonNull(eventId, "eventId must not be null");
        this.eventType = Objects.requireNonNull(eventType, "eventType must not be null");
        this.roomId = Objects.requireNonNull(roomId, "roomId must not be null");
        this.occurredAt = Objects.requireNonNull(occurredAt, "occurredAt must not be null");
        this.payload = payload == null ? Collections.emptyMap() : payload;
    }

    public Long getId() {
        return id;
    }

    public String getEventId() {
        return eventId;
    }

    public RoomEventType getEventType() {
        return eventType;
    }

    public String getRoomId() {
        return roomId;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public Map<String, Object> getPayload() {
        return payload;
    }
}
