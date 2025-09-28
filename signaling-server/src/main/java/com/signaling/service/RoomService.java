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

@Service
public class RoomService {

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Map<String, Set<String>> roomParticipants = new ConcurrentHashMap<>();
    private final Map<String, RouterInfo> routerInfos = new ConcurrentHashMap<>();

    public Room createRoom(String roomId, String hostId, String name) {
        Room room = new Room(roomId, name, hostId, Instant.now());
        Room previous = rooms.putIfAbsent(roomId, room);
        if (previous != null) {
            throw new IllegalStateException("Room already exists: " + roomId);
        }
        roomParticipants.put(roomId, new CopyOnWriteArraySet<>());
        return room;
    }

    public Optional<Room> getRoom(String roomId) {
        return Optional.ofNullable(rooms.get(roomId));
    }

    public List<Room> getAllRooms() {
        return new ArrayList<>(rooms.values());
    }

    public void deleteRoom(String roomId) {
        rooms.remove(roomId);
        roomParticipants.remove(roomId);
        routerInfos.remove(roomId);
    }

    public void addUserToRoom(String roomId, String userId) {
        roomParticipants.computeIfAbsent(roomId, key -> new CopyOnWriteArraySet<>()).add(userId);
    }

    public void removeUserFromRoom(String roomId, String userId) {
        roomParticipants.computeIfPresent(roomId, (key, set) -> {
            set.remove(userId);
            return set;
        });
    }

    public List<String> getUsersInRoom(String roomId) {
        return roomParticipants.containsKey(roomId)
                ? new ArrayList<>(roomParticipants.get(roomId))
                : Collections.emptyList();
    }

    public void saveRouterInfo(String roomId, RouterInfo routerInfo) {
        routerInfos.put(roomId, routerInfo);
        rooms.computeIfPresent(roomId, (key, room) -> {
            room.setRouterId(routerInfo.getRouterId());
            return room;
        });
    }

    public Optional<RouterInfo> getRouterInfo(String roomId) {
        return Optional.ofNullable(routerInfos.get(roomId));
    }

    public void removeRouterInfo(String roomId) {
        routerInfos.remove(roomId);
    }

    public boolean roomExists(String roomId) {
        return rooms.containsKey(roomId);
    }
}
