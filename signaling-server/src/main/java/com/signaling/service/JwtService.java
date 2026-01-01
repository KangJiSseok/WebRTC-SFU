package com.signaling.service;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.signaling.config.JwtProperties;
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

    public String issueToken(String subject, String role) {
        Algorithm alg = getAlgorithm();
        Instant now = Instant.now();
        Instant exp = now.plusSeconds(properties.getTtlSeconds());
        return JWT.create()
                .withSubject(subject)
                .withIssuer(properties.getIssuer())
                .withAudience(properties.getAudience())
                .withClaim("role", role)
                .withIssuedAt(Date.from(now))
                .withExpiresAt(Date.from(exp))
                .sign(alg);
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
