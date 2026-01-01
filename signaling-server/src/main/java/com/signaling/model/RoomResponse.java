package com.signaling.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 방 조회 API 응답에 사용되는 DTO.
 */
public class RoomResponse {

    private String id;
    private String name;
    private String hostId;
    private Instant createdAt;
    private List<String> participants = new ArrayList<>();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
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

    public List<String> getParticipants() {
        return Collections.unmodifiableList(participants);
    }

    public void setParticipants(List<String> participants) {
        this.participants = participants == null ? new ArrayList<>() : new ArrayList<>(participants);
    }
}
