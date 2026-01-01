package com.signaling.controller;

import com.signaling.model.RoomEvent;
import com.signaling.model.RoomEventPageResponse;
import com.signaling.model.RoomEventRequest;
import com.signaling.model.RoomEventResponse;
import com.signaling.model.RoomEventType;
import com.signaling.service.RoomEventService;
import jakarta.validation.Valid;
import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/rooms/{roomId}/events")
public class RoomEventController {

    private final RoomEventService roomEventService;

    public RoomEventController(RoomEventService roomEventService) {
        this.roomEventService = roomEventService;
    }

    @GetMapping
    public ResponseEntity<RoomEventPageResponse> listEvents(
            @PathVariable String roomId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(required = false) List<RoomEventType> types,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false, defaultValue = "next") String direction) {
        int safeLimit = clamp(limit, 1, 500, 100);
        Cursor parsedCursor = parseCursor(cursor);
        boolean forward = !"prev".equalsIgnoreCase(direction);
        List<RoomEvent> raw = roomEventService.search(
                roomId,
                from,
                to,
                types,
                parsedCursor != null ? parsedCursor.time : null,
                parsedCursor != null ? parsedCursor.id : null,
                forward,
                safeLimit + 1
        );
        boolean hasMore = raw.size() > safeLimit;
        if (hasMore) {
            raw.remove(raw.size() - 1);
        }
        if (!forward) {
            List<RoomEvent> reversed = new ArrayList<>(raw);
            Collections.reverse(reversed);
            raw = reversed;
        }

        List<RoomEventResponse> items = raw.stream()
                .map(this::toResponse)
                .toList();

        long total = roomEventService.count(roomId, from, to, types);
        RoomEventPageResponse response = new RoomEventPageResponse();
        response.setItems(items);
        response.setTotal(total);
        response.setHasNext(hasMore);
        response.setNextCursor(items.isEmpty() ? null : encodeCursor(raw.get(raw.size() - 1)));
        response.setPrevCursor(items.isEmpty() ? null : encodeCursor(raw.get(0)));
        return ResponseEntity.ok(response);
    }

    @PostMapping
    public ResponseEntity<RoomEventResponse> createEvent(@PathVariable String roomId,
            @Valid @RequestBody RoomEventRequest request) {
        if (!roomId.equals(request.getRoomId())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }

        RoomEvent event = new RoomEvent(
                request.getEventId(),
                request.getEventType(),
                request.getRoomId(),
                request.getOccurredAt(),
                request.getPayload()
        );
        var result = roomEventService.saveIfNotExists(event);
        RoomEventResponse response = toResponse(result.getEvent());
        if (result.isCreated()) {
            return ResponseEntity.created(URI.create("/api/rooms/" + roomId + "/events/" + response.getId()))
                    .body(response);
        }
        return ResponseEntity.ok(response);
    }

    private int clamp(Integer value, int min, int max, int defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        if (value < min) {
            return min;
        }
        return Math.min(value, max);
    }

    private RoomEventResponse toResponse(RoomEvent event) {
        RoomEventResponse response = new RoomEventResponse();
        response.setId(event.getId());
        response.setEventId(event.getEventId());
        response.setEventType(event.getEventType());
        response.setOccurredAt(event.getOccurredAt());
        response.setRoomId(event.getRoomId());
        response.setPayload(event.getPayload());
        return response;
    }

    private String encodeCursor(RoomEvent event) {
        return event.getOccurredAt().toEpochMilli() + ":" + event.getId();
    }

    private Cursor parseCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return null;
        }
        String[] parts = cursor.split(":", 2);
        if (parts.length != 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid cursor format");
        }
        try {
            long millis = Long.parseLong(parts[0]);
            long id = Long.parseLong(parts[1]);
            return new Cursor(Instant.ofEpochMilli(millis), id);
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid cursor format");
        }
    }

    private static class Cursor {
        private final Instant time;
        private final long id;

        private Cursor(Instant time, long id) {
            this.time = time;
            this.id = id;
        }
    }
}
