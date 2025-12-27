package com.signaling.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "producers")
public class Producer {

    @Id
    @Column(name = "id", nullable = false, length = 200)
    private String id;

    @Column(name = "room_id", nullable = false, length = 100)
    private String roomId;

    @Column(name = "user_id", length = 100)
    private String userId;

    @Column(name = "kind", length = 20)
    private String kind;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Producer() {
    }

    public Producer(String id, String roomId, String userId, String kind, Instant createdAt) {
        this.id = id;
        this.roomId = roomId;
        this.userId = userId;
        this.kind = kind;
        this.createdAt = createdAt == null ? Instant.now() : createdAt;
    }

    public String getId() {
        return id;
    }

    public String getRoomId() {
        return roomId;
    }

    public String getUserId() {
        return userId;
    }

    public String getKind() {
        return kind;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
