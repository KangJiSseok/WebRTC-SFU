package com.signaling.controller;

import com.signaling.model.CreateRoomRequest;
import com.signaling.model.Room;
import com.signaling.model.RoomResponse;
import com.signaling.service.MediaSoupService;
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

@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomService roomService;
    private final MediaSoupService mediaSoupService;

    public RoomController(RoomService roomService, MediaSoupService mediaSoupService) {
        this.roomService = roomService;
        this.mediaSoupService = mediaSoupService;
    }

    @PostMapping
    public ResponseEntity<RoomResponse> createRoom(@Valid @RequestBody CreateRoomRequest request) {
        Room room = roomService.createRoom(request.getRoomId(), request.getHostId(), request.getName());
        var routerInfo = mediaSoupService.createRouter(room.getId());
        roomService.saveRouterInfo(room.getId(), routerInfo);
        RoomResponse response = toResponse(room);
        return ResponseEntity.created(URI.create("/api/rooms/" + room.getId())).body(response);
    }

    @GetMapping("/{roomId}")
    public ResponseEntity<RoomResponse> getRoom(@PathVariable String roomId) {
        Optional<Room> roomOptional = roomService.getRoom(roomId);
        return roomOptional.map(room -> ResponseEntity.ok(toResponse(room)))
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{roomId}")
    public ResponseEntity<Void> deleteRoom(@PathVariable String roomId) {
        if (!roomService.roomExists(roomId)) {
            return ResponseEntity.notFound().build();
        }
        mediaSoupService.closeRoom(roomId);
        roomService.deleteRoom(roomId);
        return ResponseEntity.noContent().build();
    }

    private RoomResponse toResponse(Room room) {
        RoomResponse response = new RoomResponse();
        response.setId(room.getId());
        response.setName(room.getName());
        response.setHostId(room.getHostId());
        response.setRouterId(room.getRouterId());
        response.setCreatedAt(room.getCreatedAt());
        response.setParticipants(roomService.getUsersInRoom(room.getId()));
        return response;
    }
}
