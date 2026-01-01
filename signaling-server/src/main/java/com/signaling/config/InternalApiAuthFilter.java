package com.signaling.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class InternalApiAuthFilter extends OncePerRequestFilter {

    private static final Pattern EVENTS_PATH = Pattern.compile("^/api/rooms/[^/]+/events.*");

    private final InternalApiProperties internalApiProperties;

    public InternalApiAuthFilter(InternalApiProperties internalApiProperties) {
        this.internalApiProperties = internalApiProperties;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        if (!requiresAuth(request) || internalApiProperties.isAuthDisabled()) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = request.getHeader("X-Server-Token");
        if (!internalApiProperties.isTokenValid(token)) {
            writeError(response, HttpStatus.UNAUTHORIZED, "Invalid server token");
            return;
        }

        String clientIp = extractClientIp(request);
        if (!internalApiProperties.isIpAllowed(clientIp)) {
            writeError(response, HttpStatus.FORBIDDEN, "IP not allowed");
            return;
        }

        filterChain.doFilter(request, response);
    }

    private boolean requiresAuth(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path != null && EVENTS_PATH.matcher(path).matches();
    }

    private String extractClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private void writeError(HttpServletResponse response, HttpStatus status, String message)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"" + message + "\"}");
    }
}
