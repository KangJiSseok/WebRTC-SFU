package com.signaling.global.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.signaling.domain.member.dto.MemberResponse;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

@Component
public class RestAuthenticationSuccessHandler implements AuthenticationSuccessHandler {

    private final ObjectMapper objectMapper;
    private final SecurityContextRepository securityContextRepository;

    public RestAuthenticationSuccessHandler(ObjectMapper objectMapper,
            SecurityContextRepository securityContextRepository) {
        this.objectMapper = objectMapper;
        this.securityContextRepository = securityContextRepository;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
            Authentication authentication) throws IOException, ServletException {
        MemberUserDetails principal = (MemberUserDetails) authentication.getPrincipal();
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);

        MemberResponse payload = new MemberResponse();
        payload.setId(principal.getId());
        payload.setUsername(principal.getUsername());
        payload.setRole(principal.getRole());
        response.setStatus(HttpStatus.OK.value());
        response.setContentType("application/json");
        objectMapper.writeValue(response.getWriter(), payload);
    }
}
