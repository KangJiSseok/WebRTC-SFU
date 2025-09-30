package com.signaling.model;

import java.time.Instant;

/**
 * 사용자 정보를 노출하기 위한 응답 DTO.
 */
public class UserResponse {

    private String id;
    private String roomId;
    private UserRole role;
    private Instant joinedAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getRoomId() {
        return roomId;
    }

    public void setRoomId(String roomId) {
        this.roomId = roomId;
    }

    public UserRole getRole() {
        return role;
    }

    public void setRole(UserRole role) {
        this.role = role;
    }

    public Instant getJoinedAt() {
        return joinedAt;
    }

    public void setJoinedAt(Instant joinedAt) {
        this.joinedAt = joinedAt;
    }
}
