package com.signaling.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;

/**
 * 방송 방 메타 정보를 캡슐화한다.
 */
@Entity
@Table(name = "rooms")
public class Room {

    @Id
    @Column(name = "id", nullable = false, length = 100)
    private String id;

    @Column(name = "name", length = 200)
    private String name;

    @Column(name = "host_id", length = 100)
    private String hostId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "router_id", length = 200)
    private volatile String routerId;

    protected Room() {
    }

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
