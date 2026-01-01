package com.signaling.global.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "sfu-token-auth")
public class SfuTokenAuthProperties {

    private String tokenHash;

    public String getTokenHash() {
        return tokenHash;
    }

    public void setTokenHash(String tokenHash) {
        this.tokenHash = tokenHash;
    }

    public boolean isEnabled() {
        return tokenHash != null && !tokenHash.isBlank();
    }
}
