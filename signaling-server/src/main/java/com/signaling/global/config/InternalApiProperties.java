package com.signaling.global.config;

import java.net.InetAddress;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "internal-api")
public class InternalApiProperties {

    private String token;
    private List<String> allowedIps = new ArrayList<>();

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public List<String> getAllowedIps() {
        return allowedIps;
    }

    public void setAllowedIps(List<String> allowedIps) {
        if (allowedIps == null) {
            this.allowedIps = new ArrayList<>();
            return;
        }
        List<String> flattened = new ArrayList<>();
        for (String entry : allowedIps) {
            if (entry == null) {
                continue;
            }
            if (entry.contains(",")) {
                for (String part : entry.split(",")) {
                    flattened.add(part);
                }
            } else {
                flattened.add(entry);
            }
        }
        this.allowedIps = flattened.stream()
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .collect(Collectors.toList());
    }

    public boolean isAuthDisabled() {
        boolean tokenMissing = token == null || token.isBlank();
        boolean ipMissing = allowedIps == null || allowedIps.isEmpty();
        return tokenMissing && ipMissing;
    }

    public boolean isTokenValid(String providedToken) {
        if (token == null || token.isBlank()) {
            return true;
        }
        return Objects.equals(token, providedToken);
    }

    public boolean isIpAllowed(String clientIp) {
        if (allowedIps == null || allowedIps.isEmpty()) {
            return true;
        }
        if (clientIp == null || clientIp.isBlank()) {
            return false;
        }
        for (String allowed : allowedIps) {
            if (allowed.equals(clientIp)) {
                return true;
            }
            if (allowed.contains("/") && matchesCidr(clientIp, allowed)) {
                return true;
            }
        }
        return false;
    }

    private boolean matchesCidr(String clientIp, String cidr) {
        String[] parts = cidr.split("/", 2);
        if (parts.length != 2) {
            return false;
        }
        try {
            InetAddress address = InetAddress.getByName(clientIp);
            InetAddress network = InetAddress.getByName(parts[0]);
            if (address.getClass() != network.getClass()) {
                return false;
            }
            int prefix = Integer.parseInt(parts[1]);
            byte[] addressBytes = address.getAddress();
            byte[] networkBytes = network.getAddress();
            int maxBits = addressBytes.length * 8;
            if (prefix < 0 || prefix > maxBits) {
                return false;
            }
            int fullBytes = prefix / 8;
            int remainingBits = prefix % 8;
            for (int i = 0; i < fullBytes; i++) {
                if (addressBytes[i] != networkBytes[i]) {
                    return false;
                }
            }
            if (remainingBits == 0) {
                return true;
            }
            int mask = 0xFF << (8 - remainingBits);
            return (addressBytes[fullBytes] & mask) == (networkBytes[fullBytes] & mask);
        } catch (Exception ex) {
            return false;
        }
    }
}
