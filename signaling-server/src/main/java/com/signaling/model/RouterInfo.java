package com.signaling.model;

import java.time.Instant;
import java.util.Collections;
import java.util.Map;
import java.util.Objects;

/**
 * mediasoup Router의 식별자와 RTP 정보, 생성 시각을 저장한다.
 */
public class RouterInfo {

    private String roomId;
    private String routerId;
    private Map<String, Object> rtpCapabilities = Collections.emptyMap();
    private Instant createdAt = Instant.now();

    public RouterInfo() {
    }

    public RouterInfo(String roomId, String routerId, Map<String, Object> rtpCapabilities, Instant createdAt) {
        this.roomId = roomId;
        this.routerId = routerId;
        this.rtpCapabilities = rtpCapabilities == null ? Collections.emptyMap() : rtpCapabilities;
        this.createdAt = createdAt == null ? Instant.now() : createdAt;
    }

    public String getRoomId() {
        return roomId;
    }

    public void setRoomId(String roomId) {
        this.roomId = roomId;
    }

    public String getRouterId() {
        return routerId;
    }

    public void setRouterId(String routerId) {
        this.routerId = routerId;
    }

    public Map<String, Object> getRtpCapabilities() {
        return rtpCapabilities;
    }

    public void setRtpCapabilities(Map<String, Object> rtpCapabilities) {
        this.rtpCapabilities = Objects.requireNonNullElse(rtpCapabilities, Collections.emptyMap());
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt == null ? Instant.now() : createdAt;
    }
}
