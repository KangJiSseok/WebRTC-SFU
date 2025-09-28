package com.signaling.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.signaling.config.MediasoupProperties;
import com.signaling.model.RouterInfo;
import java.net.URI;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

@Service
public class MediaSoupService {

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private static final Logger log = LoggerFactory.getLogger(MediaSoupService.class);

    private final RestTemplate restTemplate;
    private final MediasoupProperties properties;
    private final ObjectMapper objectMapper;

    public MediaSoupService(RestTemplate restTemplate, MediasoupProperties properties, ObjectMapper objectMapper) {
        this.restTemplate = restTemplate;
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public RouterInfo createRouter(String roomId) {
        Map<String, Object> payload = Map.of("roomId", roomId);
        log.debug("Requesting mediasoup router for room {}", roomId);
        JsonNode response = postForJson("/rooms", payload);
        if (response == null) {
            throw new MediaSoupException("Empty response when creating router for room " + roomId);
        }
        RouterInfo routerInfo = new RouterInfo();
        routerInfo.setRoomId(roomId);
        routerInfo.setRouterId(response.path("routerId").asText());
        routerInfo.setRtpCapabilities(objectMapper.convertValue(response.path("rtpCapabilities"), MAP_TYPE));
        routerInfo.setCreatedAt(Instant.now());
        log.debug("Mediasoup router created for room {} with id {}", roomId, routerInfo.getRouterId());
        return routerInfo;
    }

    public JsonNode getRouterRtpCapabilities(String roomId) {
        return exchangeForJson(HttpMethod.GET, "/rooms/" + roomId + "/rtp-capabilities", null);
    }

    public JsonNode createTransport(String roomId, String direction) {
        Map<String, Object> payload = Map.of("direction", direction);
        return postForJson("/rooms/" + roomId + "/transports", payload);
    }

    public JsonNode connectTransport(String roomId, String transportId, JsonNode dtlsParameters) {
        Map<String, Object> payload = Map.of("dtlsParameters", dtlsParameters);
        return postForJson("/rooms/" + roomId + "/transports/" + transportId + "/connect", payload);
    }

    public JsonNode createProducer(String roomId, JsonNode payload) {
        return postForJson("/rooms/" + roomId + "/producers", payload);
    }

    public JsonNode createConsumer(String roomId, JsonNode payload) {
        return postForJson("/rooms/" + roomId + "/consumers", payload);
    }

    public JsonNode resumeConsumer(String roomId, String consumerId) {
        return postForJson("/rooms/" + roomId + "/consumers/" + consumerId + "/resume", Map.of());
    }

    public void closeRoom(String roomId) {
        exchangeForJson(HttpMethod.DELETE, "/rooms/" + roomId, null);
    }

    private JsonNode postForJson(String path, Object body) {
        return exchangeForJson(HttpMethod.POST, path, body);
    }

	private JsonNode exchangeForJson(HttpMethod method, String path, Object body) {
		try {
			URI uri = properties.getBaseUri().resolve(path);
			log.debug("Calling mediasoup {} {} with body {}", method, uri, body);

			HttpHeaders headers = new HttpHeaders();
			headers.setContentType(MediaType.APPLICATION_JSON);
			// 필요시: headers.setConnection("close");

			HttpEntity<Object> entity = new HttpEntity<>(body, headers);
			ResponseEntity<JsonNode> response = restTemplate.exchange(uri, method, entity, JsonNode.class);

			log.debug("Mediasoup response status {} body {}", response.getStatusCode(), response.getBody());
			return response.getBody();
		} catch (RestClientException ex) {
			log.error("Mediasoup call failed for {} {}: {}", method, path, ex.getMessage(), ex);
			throw new MediaSoupException("Failed to call mediasoup SFU at path " + path + ": " + ex.getMessage(), ex);
		}
	}




}
