package com.signaling.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 사용자가 방에 참가할 때 전달하는 요청 정보를 담는다.
 */
public class JoinRoomRequest {

    @NotBlank
    private String roomId;

    @NotBlank
    private String userId;

    @NotNull
    private UserRole role;

    public String getRoomId() {
        return roomId;
    }

    public void setRoomId(String roomId) {
        this.roomId = roomId;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public UserRole getRole() {
        return role;
    }

    public void setRole(UserRole role) {
        this.role = role;
    }
}
