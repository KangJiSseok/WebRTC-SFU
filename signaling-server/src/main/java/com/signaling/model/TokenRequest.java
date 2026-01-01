package com.signaling.model;

import jakarta.validation.constraints.NotBlank;

public class TokenRequest {

    @NotBlank
    private String subject;

    @NotBlank
    private String role;

    public String getSubject() {
        return subject;
    }

    public void setSubject(String subject) {
        this.subject = subject;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }
}
