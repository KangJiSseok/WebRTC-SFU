package com.signaling.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * 방에 참가한 사용자의 식별자와 역할, 참가 시각을 보관한다.
 */
@Entity
@Table(name = "users")
public class User {

    @Id
    @Column(name = "id", nullable = false, length = 100)
    private String id;

    @Column(name = "room_id", nullable = false, length = 100)
    private String roomId;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 20)
    private UserRole role;

    @Column(name = "joined_at", nullable = false)
    private Instant joinedAt;

    protected User() {
    }

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
