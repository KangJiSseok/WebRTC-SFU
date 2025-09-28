package com.signaling.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum UserRole {
    BROADCASTER,
    VIEWER;

    @JsonCreator
    public static UserRole fromValue(String value) {
        if (value == null) {
            return null;
        }
        for (UserRole role : values()) {
            if (role.name().equalsIgnoreCase(value)) {
                return role;
            }
        }
        throw new IllegalArgumentException("Unknown user role: " + value);
    }

    @JsonValue
    public String toValue() {
        return name();
    }
}
