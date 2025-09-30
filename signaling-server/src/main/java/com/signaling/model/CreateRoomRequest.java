package com.signaling.model;

import jakarta.validation.constraints.NotBlank;

/**
 * 방 생성 REST 요청 바디를 표현한다.
 */
public class CreateRoomRequest {

    @NotBlank
    private String roomId;

    @NotBlank
    private String hostId;

    private String name;

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

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }
}
