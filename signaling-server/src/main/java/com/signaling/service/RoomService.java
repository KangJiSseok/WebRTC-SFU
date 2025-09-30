package com.signaling.service;

import com.signaling.model.Room;
import com.signaling.model.RouterInfo;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;
import org.springframework.stereotype.Service;

/**
 * 방 메타데이터와 참가자 목록, Router 정보를 인메모리로 관리한다.
 */
@Service
public class RoomService {

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Map<String, Set<String>> roomParticipants = new ConcurrentHashMap<>();
    private final Map<String, RouterInfo> routerInfos = new ConcurrentHashMap<>();

    /**
     * 새 방을 생성한다. 이미 존재하면 예외를 던진다.
     */
    public Room createRoom(String roomId, String hostId, String name) {
        Room room = new Room(roomId, name, hostId, Instant.now());
        Room previous = rooms.putIfAbsent(roomId, room);
        if (previous != null) {
            throw new IllegalStateException("Room already exists: " + roomId);
        }
        roomParticipants.put(roomId, new CopyOnWriteArraySet<>());
        return room;
    }

    /**
     * roomId로 방을 조회한다.
     */
    public Optional<Room> getRoom(String roomId) {
        return Optional.ofNullable(rooms.get(roomId));
    }

    /**
     * 현재 서버에 존재하는 모든 방을 반환한다.
     */
    public List<Room> getAllRooms() {
        return new ArrayList<>(rooms.values());
    }

    /**
     * 방과 관련된 모든 상태를 제거한다.
     */
    public void deleteRoom(String roomId) {
        rooms.remove(roomId);
        roomParticipants.remove(roomId);
        routerInfos.remove(roomId);
    }

    /**
     * 방의 참가자 목록에 사용자를 추가한다.
     */
    public void addUserToRoom(String roomId, String userId) {
        roomParticipants.computeIfAbsent(roomId, key -> new CopyOnWriteArraySet<>()).add(userId);
    }

    /**
     * 방의 참가자 목록에서 사용자를 제거한다.
     */
    public void removeUserFromRoom(String roomId, String userId) {
        roomParticipants.computeIfPresent(roomId, (key, set) -> {
            set.remove(userId);
            return set;
        });
    }

    /**
     * 방에 참여 중인 사용자 ID 목록을 반환한다.
     */
    public List<String> getUsersInRoom(String roomId) {
        return roomParticipants.containsKey(roomId)
                ? new ArrayList<>(roomParticipants.get(roomId))
                : Collections.emptyList();
    }

    /**
     * SFU에서 생성한 Router 정보를 캐시에 저장한다.
     */
    public void saveRouterInfo(String roomId, RouterInfo routerInfo) {
        routerInfos.put(roomId, routerInfo);
        rooms.computeIfPresent(roomId, (key, room) -> {
            room.setRouterId(routerInfo.getRouterId());
            return room;
        });
    }

    /**
     * 미리 저장해둔 Router 정보를 조회한다.
     */
    public Optional<RouterInfo> getRouterInfo(String roomId) {
        return Optional.ofNullable(routerInfos.get(roomId));
    }

    /**
     * Router 정보만 별도로 삭제한다.
     */
    public void removeRouterInfo(String roomId) {
        routerInfos.remove(roomId);
    }

    /**
     * 해당 방이 존재하는지 여부를 반환한다.
     */
    public boolean roomExists(String roomId) {
        return rooms.containsKey(roomId);
    }
}
