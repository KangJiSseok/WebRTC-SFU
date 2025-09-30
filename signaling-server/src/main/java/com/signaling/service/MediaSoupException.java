package com.signaling.service;

/**
 * mediasoup REST 호출 실패를 표현하는 런타임 예외.
 */
public class MediaSoupException extends RuntimeException {

    public MediaSoupException(String message) {
        super(message);
    }

    public MediaSoupException(String message, Throwable cause) {
        super(message, cause);
    }
}
