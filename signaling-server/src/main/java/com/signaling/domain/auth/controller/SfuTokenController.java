package com.signaling.domain.auth.controller;

import com.signaling.domain.auth.dto.TokenResponse;
import com.signaling.domain.auth.service.JwtService;
import com.signaling.domain.auth.service.SfuTokenAuthService;
import com.signaling.global.security.MemberUserDetails;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.core.annotation.AuthenticationPrincipal;

@RestController
@RequestMapping("/api/rooms/{roomId}/sfu-token")
public class SfuTokenController {

    private final JwtService jwtService;
    private final SfuTokenAuthService sfuTokenAuthService;

    public SfuTokenController(JwtService jwtService, SfuTokenAuthService sfuTokenAuthService) {
        this.jwtService = jwtService;
        this.sfuTokenAuthService = sfuTokenAuthService;
    }

    @PostMapping
    public ResponseEntity<TokenResponse> issueSfuToken(@PathVariable String roomId,
            @RequestHeader(value = "X-Access-Token", required = false) String accessToken,
            @RequestParam(value = "role", required = false, defaultValue = "VIEWER") String roleParam,
            @AuthenticationPrincipal MemberUserDetails principal) {
        try {
            sfuTokenAuthService.assertAuthorized(accessToken);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        String role = roleParam.toUpperCase();
        if (!ALLOWED_ROLES.contains(role)) {
            return ResponseEntity.badRequest().build();
        }
        String token = jwtService.issueSfuToken(principal.getId().toString(), role, roomId);
        return ResponseEntity.ok(new TokenResponse(token));
    }

    private static final Set<String> ALLOWED_ROLES = Set.of("BROADCASTER", "VIEWER");
}
