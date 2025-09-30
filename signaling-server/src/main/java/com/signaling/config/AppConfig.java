package com.signaling.config;

import java.time.Duration;

import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.core5.util.Timeout;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

/**
 * 공용 Bean 정의를 담고 있는 설정 클래스.
 */
@Configuration
public class AppConfig {

	/**
	 * mediasoup REST 호출에 사용할 RestTemplate을 생성한다.
	 * 연결/응답 타임아웃을 짧게 설정하여 백엔드 지연이 서비스에 미치는 영향을 줄인다.
	 */
	@Bean
	public RestTemplate restTemplate() {
		RequestConfig rc = RequestConfig.custom()
			// 연결 및 응답 타임아웃을 명확히 지정하여 실패를 빠르게 감지한다.
			.setConnectTimeout(Timeout.ofSeconds(3))
			.setResponseTimeout(Timeout.ofSeconds(5))
			.setExpectContinueEnabled(false)
			.build();

		CloseableHttpClient httpClient = HttpClients.custom()
			// mediasoup 호출은 재시도 시 상태 꼬임이 생기므로 자동 재시도를 비활성화한다.
			.setDefaultRequestConfig(rc)
			.disableAutomaticRetries()
			.build();

		var rf = new HttpComponentsClientHttpRequestFactory(httpClient);
		return new RestTemplate(rf);
	}

}
