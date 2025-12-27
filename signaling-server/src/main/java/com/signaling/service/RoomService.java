package com.signaling.service;

import com.signaling.model.Room;
import com.signaling.model.RouterInfo;
import com.signaling.repository.ProducerRepository;
import com.signaling.repository.RoomRepository;
import com.signaling.repository.RouterInfoRepository;
import com.signaling.repository.UserRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 방 메타데이터와 참가자 목록, Router 정보를 인메모리로 관리한다.
 */
@Service
public class RoomService {

    private final RoomRepository roomRepository;
    private final RouterInfoRepository routerInfoRepository;
    private final UserRepository userRepository;
    private final ProducerRepository producerRepository;

    public RoomService(RoomRepository roomRepository, RouterInfoRepository routerInfoRepository,
            UserRepository userRepository, ProducerRepository producerRepository) {
        this.roomRepository = roomRepository;
        this.routerInfoRepository = routerInfoRepository;
        this.userRepository = userRepository;
        this.producerRepository = producerRepository;
    }

    /**
     * 새 방을 생성한다. 이미 존재하면 예외를 던진다.
     */
    @Transactional
    public Room createRoom(String roomId, String hostId, String name) {
        if (roomRepository.existsById(roomId)) {
            throw new IllegalStateException("Room already exists: " + roomId);
        }
        Room room = new Room(roomId, name, hostId, Instant.now());
        return roomRepository.save(room);
    }

    /**
     * roomId로 방을 조회한다.
     */
    public Optional<Room> getRoom(String roomId) {
        return roomRepository.findById(roomId);
    }

    /**
     * 현재 서버에 존재하는 모든 방을 반환한다.
     */
    public List<Room> getAllRooms() {
        return roomRepository.findAll();
    }

    /**
     * 방과 관련된 모든 상태를 제거한다.
     */
    @Transactional
    public void deleteRoom(String roomId) {
        routerInfoRepository.deleteById(roomId);
        producerRepository.deleteByRoomId(roomId);
        userRepository.deleteByRoomId(roomId);
        roomRepository.deleteById(roomId);
    }

    /**
     * 방의 참가자 목록에 사용자를 추가한다.
     */
    /**
     * 방에 참여 중인 사용자 ID 목록을 반환한다.
     */
    public List<String> getUsersInRoom(String roomId) {
        return userRepository.findByRoomId(roomId).stream()
                .map(user -> user.getId())
                .toList();
    }

    /**
     * SFU에서 생성한 Router 정보를 캐시에 저장한다.
     */
    @Transactional
    public void saveRouterInfo(String roomId, RouterInfo routerInfo) {
        routerInfoRepository.save(routerInfo);
        roomRepository.findById(roomId).ifPresent(room -> {
            room.setRouterId(routerInfo.getRouterId());
            roomRepository.save(room);
        });
    }

    /**
     * 미리 저장해둔 Router 정보를 조회한다.
     */
    public Optional<RouterInfo> getRouterInfo(String roomId) {
        return routerInfoRepository.findById(roomId);
    }

    /**
     * Router 정보만 별도로 삭제한다.
     */
    public void removeRouterInfo(String roomId) {
        routerInfoRepository.deleteById(roomId);
    }

    /**
     * 해당 방이 존재하는지 여부를 반환한다.
     */
    public boolean roomExists(String roomId) {
        return roomRepository.existsById(roomId);
    }
}
