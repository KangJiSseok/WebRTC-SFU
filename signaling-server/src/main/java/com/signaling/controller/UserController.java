package com.signaling.controller;

import com.signaling.model.JoinRoomRequest;
import com.signaling.model.User;
import com.signaling.model.UserResponse;
import com.signaling.service.RoomService;
import com.signaling.service.UserService;
import jakarta.validation.Valid;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rooms/{roomId}/users")
public class UserController {

    private final UserService userService;
    private final RoomService roomService;

    public UserController(UserService userService, RoomService roomService) {
        this.userService = userService;
        this.roomService = roomService;
    }

    @PostMapping
    public ResponseEntity<UserResponse> joinRoom(@PathVariable String roomId, @Valid @RequestBody JoinRoomRequest request) {
        if (!roomService.roomExists(roomId)) {
            return ResponseEntity.notFound().build();
        }
        User user = new User(request.getUserId(), roomId, request.getRole(), Instant.now());
        userService.addUser(user);
        roomService.addUserToRoom(roomId, user.getId());
        UserResponse response = toResponse(user);
        return ResponseEntity.created(URI.create("/api/rooms/" + roomId + "/users/" + user.getId())).body(response);
    }

    @GetMapping
    public ResponseEntity<List<UserResponse>> listUsers(@PathVariable String roomId) {
        if (!roomService.roomExists(roomId)) {
            return ResponseEntity.notFound().build();
        }
        List<UserResponse> users = userService.getUsersByRoom(roomId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
        return ResponseEntity.ok(users);
    }

    @DeleteMapping("/{userId}")
    public ResponseEntity<Void> leaveRoom(@PathVariable String roomId, @PathVariable String userId) {
        if (!roomService.roomExists(roomId)) {
            return ResponseEntity.notFound().build();
        }
        Optional<User> userOptional = userService.getUser(userId);
        if (userOptional.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        userService.removeUser(userId);
        roomService.removeUserFromRoom(roomId, userId);
        return ResponseEntity.noContent().build();
    }

    private UserResponse toResponse(User user) {
        UserResponse response = new UserResponse();
        response.setId(user.getId());
        response.setRoomId(user.getRoomId());
        response.setRole(user.getRole());
        response.setJoinedAt(user.getJoinedAt());
        return response;
    }
}
