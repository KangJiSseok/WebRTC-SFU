package com.signaling.domain.auth.service;

import com.signaling.global.config.SfuTokenAuthProperties;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class SfuTokenAuthService {

    private final SfuTokenAuthProperties properties;
    private final PasswordEncoder passwordEncoder;

    public SfuTokenAuthService(SfuTokenAuthProperties properties, PasswordEncoder passwordEncoder) {
        this.properties = properties;
        this.passwordEncoder = passwordEncoder;
    }

    public void assertAuthorized(String token) {
        if (!properties.isEnabled()) {
            return;
        }
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("Missing access token");
        }
        if (!passwordEncoder.matches(token, properties.getTokenHash())) {
            throw new IllegalArgumentException("Invalid access token");
        }
    }
}
