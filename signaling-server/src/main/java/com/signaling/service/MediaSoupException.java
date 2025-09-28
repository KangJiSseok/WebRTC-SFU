package com.signaling.service;

public class MediaSoupException extends RuntimeException {

    public MediaSoupException(String message) {
        super(message);
    }

    public MediaSoupException(String message, Throwable cause) {
        super(message, cause);
    }
}
