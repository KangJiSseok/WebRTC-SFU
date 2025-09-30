package com.signaling.model;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * 방에 참가한 사용자의 식별자와 역할, 참가 시각을 보관한다.
 */
public class User {

    private final String id;
    private final String roomId;
    private final UserRole role;
    private final Instant joinedAt;

    public User(String id, String roomId, UserRole role, Instant joinedAt) {
        // id가 비어 있을 경우 서버에서 UUID를 생성해 고유성을 확보한다.
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
