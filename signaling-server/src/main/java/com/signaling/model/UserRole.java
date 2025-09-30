package com.signaling.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * 사용자의 역할(브로드캐스터/뷰어)을 구분한다.
 */
public enum UserRole {
    BROADCASTER,
    VIEWER;

    /**
     * 직렬화된 문자열을 열거형으로 변환한다.
     */
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

    /**
     * 열거형을 문자열로 직렬화할 때 사용된다.
     */
    @JsonValue
    public String toValue() {
        return name();
    }
}
