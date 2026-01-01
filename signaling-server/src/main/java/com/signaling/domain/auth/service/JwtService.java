package com.signaling.domain.auth.service;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.signaling.global.config.JwtProperties;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.interfaces.RSAPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import org.springframework.stereotype.Service;

@Service
public class JwtService {

    private final JwtProperties properties;
    private Algorithm algorithm;

    public JwtService(JwtProperties properties) {
        this.properties = properties;
    }

    public String issueSfuToken(String subject, String role, String roomId) {
        Algorithm alg = getAlgorithm();
        Instant now = Instant.now();
        Instant exp = now.plusSeconds(properties.getTtlSeconds());
        return applyStandardClaims(JWT.create(), subject, now, exp)
                .withClaim("role", role)
                .withClaim("roomId", roomId)
                .withClaim("type", "SFU")
                .sign(alg);
    }

    private com.auth0.jwt.JWTCreator.Builder applyStandardClaims(
            com.auth0.jwt.JWTCreator.Builder builder,
            String subject,
            Instant now,
            Instant exp) {
        String issuer = properties.getIssuer();
        String audience = properties.getAudience();
        if (issuer == null || issuer.isBlank()) {
            throw new IllegalStateException("jwt.issuer is required");
        }
        if (audience == null || audience.isBlank()) {
            throw new IllegalStateException("jwt.audience is required");
        }
        return builder
                .withSubject(subject)
                .withIssuer(issuer)
                .withAudience(audience)
                .withIssuedAt(Date.from(now))
                .withExpiresAt(Date.from(exp));
    }

    private Algorithm getAlgorithm() {
        if (algorithm != null) {
            return algorithm;
        }
        RSAPrivateKey privateKey = loadPrivateKey();
        algorithm = Algorithm.RSA256(null, privateKey);
        return algorithm;
    }

    private RSAPrivateKey loadPrivateKey() {
        String inlineKey = properties.getPrivateKey();
        if (inlineKey != null && !inlineKey.isBlank()) {
            return parsePrivateKey(normalizeKey(inlineKey));
        }
        String path = properties.getPrivateKeyPath();
        if (path == null || path.isBlank()) {
            throw new IllegalStateException("jwt.private-key or jwt.private-key-path is required");
        }
        try {
            String pem = Files.readString(Path.of(path), StandardCharsets.UTF_8);
            return parsePrivateKey(pem);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to read private key", ex);
        }
    }

    private RSAPrivateKey parsePrivateKey(String pem) {
        try {
            String content = pem
                    .replace("-----BEGIN PRIVATE KEY-----", "")
                    .replace("-----END PRIVATE KEY-----", "")
                    .replaceAll("\\s+", "");
            byte[] decoded = Base64.getDecoder().decode(content);
            PKCS8EncodedKeySpec keySpec = new PKCS8EncodedKeySpec(decoded);
            KeyFactory keyFactory = KeyFactory.getInstance("RSA");
            return (RSAPrivateKey) keyFactory.generatePrivate(keySpec);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to parse private key", ex);
        }
    }

    private String normalizeKey(String key) {
        return key.replace("\\n", "\n");
    }
}
