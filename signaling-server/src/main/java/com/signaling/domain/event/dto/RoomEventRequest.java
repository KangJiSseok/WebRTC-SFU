package com.signaling.domain.event.dto;

import com.signaling.domain.event.entity.RoomEventType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.Map;

public class RoomEventRequest {

    @NotBlank
    private String eventId;

    @NotNull
    private RoomEventType eventType;

    @NotNull
    private Instant occurredAt;

    @NotBlank
    private String roomId;

    private Map<String, Object> payload;

    public String getEventId() {
        return eventId;
    }

    public void setEventId(String eventId) {
        this.eventId = eventId;
    }

    public RoomEventType getEventType() {
        return eventType;
    }

    public void setEventType(RoomEventType eventType) {
        this.eventType = eventType;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public void setOccurredAt(Instant occurredAt) {
        this.occurredAt = occurredAt;
    }

    public String getRoomId() {
        return roomId;
    }

    public void setRoomId(String roomId) {
        this.roomId = roomId;
    }

    public Map<String, Object> getPayload() {
        return payload;
    }

    public void setPayload(Map<String, Object> payload) {
        this.payload = payload;
    }
}
