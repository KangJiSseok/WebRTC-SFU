package com.signaling;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Spring Boot 진입점. 신호 서버 전체를 실행한다.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class SignalingServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(SignalingServerApplication.class, args);
    }
}
