package com.signaling.model;

import java.time.Instant;
import java.util.Objects;

/**
 * 방송 방 메타 정보를 캡슐화한다.
 */
public class Room {

    private final String id;
    private final String name;
    private final String hostId;
    private final Instant createdAt;
    private volatile String routerId;

    public Room(String id, String name, String hostId, Instant createdAt) {
        this.id = Objects.requireNonNull(id, "room id must not be null");
        this.name = name;
        this.hostId = hostId;
        this.createdAt = createdAt == null ? Instant.now() : createdAt;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getHostId() {
        return hostId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public String getRouterId() {
        return routerId;
    }

    public void setRouterId(String routerId) {
        this.routerId = routerId;
    }
}
