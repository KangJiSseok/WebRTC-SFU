package com.signaling.domain.room.controller;

import com.signaling.domain.room.dto.RoomListResponse;
import com.signaling.domain.room.service.RoomQueryService;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rooms")
public class RoomQueryController {

    private final RoomQueryService roomQueryService;

    public RoomQueryController(RoomQueryService roomQueryService) {
        this.roomQueryService = roomQueryService;
    }

    @GetMapping
    public ResponseEntity<List<RoomListResponse>> listRooms() {
        return ResponseEntity.ok(roomQueryService.listActiveRooms());
    }
}
