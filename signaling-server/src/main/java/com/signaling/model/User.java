package com.signaling.model;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public class User {

    private final String id;
    private final String roomId;
    private final UserRole role;
    private final Instant joinedAt;

    public User(String id, String roomId, UserRole role, Instant joinedAt) {
        this.id = Objects.requireNonNullElseGet(id, () -> UUID.randomUUID().toString());
        this.roomId = roomId;
        this.role = role;
        this.joinedAt = joinedAt == null ? Instant.now() : joinedAt;
    }

    public String getId() {
        return id;
    }

    public String getRoomId() {
        return roomId;
    }

    public UserRole getRole() {
        return role;
    }

    public Instant getJoinedAt() {
        return joinedAt;
    }
}
