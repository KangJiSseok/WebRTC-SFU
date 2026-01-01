package com.signaling.controller;

import com.signaling.model.CreateRoomRequest;
import com.signaling.model.Room;
import com.signaling.model.RoomResponse;
import com.signaling.service.RoomService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.Optional;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 방 생성/조회/삭제 REST API를 제공한다.
 */
@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomService roomService;
    public RoomController(RoomService roomService) {
        this.roomService = roomService;
    }

    /**
     * 새로운 방송 방을 생성하고 SFU에 Router 생성도 위임한다.
     */
    @PostMapping
    public ResponseEntity<RoomResponse> createRoom(@Valid @RequestBody CreateRoomRequest request) {
        Room room = roomService.createRoom(request.getRoomId(), request.getHostId(), request.getName());
        RoomResponse response = toResponse(room);
        return ResponseEntity.created(URI.create("/api/rooms/" + room.getId())).body(response);
    }

    /**
     * 방 정보를 조회한다.
     */
    @GetMapping("/{roomId}")
    public ResponseEntity<RoomResponse> getRoom(@PathVariable String roomId) {
        Optional<Room> roomOptional = roomService.getRoom(roomId);
        return roomOptional.map(room -> ResponseEntity.ok(toResponse(room)))
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * 방을 제거하고 SFU 리소스도 정리한다.
     */
    @DeleteMapping("/{roomId}")
    public ResponseEntity<Void> deleteRoom(@PathVariable String roomId) {
        if (!roomService.roomExists(roomId)) {
            return ResponseEntity.notFound().build();
        }
        roomService.deleteRoom(roomId);
        return ResponseEntity.noContent().build();
    }

    /**
     * 내부 Room 도메인을 외부 응답 DTO로 변환한다.
     */
    private RoomResponse toResponse(Room room) {
        RoomResponse response = new RoomResponse();
        response.setId(room.getId());
        response.setName(room.getName());
        response.setHostId(room.getHostId());
        response.setCreatedAt(room.getCreatedAt());
        response.setParticipants(roomService.getUsersInRoom(room.getId()));
        return response;
    }
}
