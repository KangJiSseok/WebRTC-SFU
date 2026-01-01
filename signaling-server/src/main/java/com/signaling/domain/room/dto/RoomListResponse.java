package com.signaling.domain.room.dto;

import java.time.Instant;

public class RoomListResponse {

    private String roomId;
    private String hostId;
    private Instant createdAt;

    public RoomListResponse() {
    }

    public RoomListResponse(String roomId, String hostId, Instant createdAt) {
        this.roomId = roomId;
        this.hostId = hostId;
        this.createdAt = createdAt;
    }

    public String getRoomId() {
        return roomId;
    }

    public void setRoomId(String roomId) {
        this.roomId = roomId;
    }

    public String getHostId() {
        return hostId;
    }

    public void setHostId(String hostId) {
        this.hostId = hostId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
