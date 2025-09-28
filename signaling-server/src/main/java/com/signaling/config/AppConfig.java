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

@Configuration
public class AppConfig {

	@Bean
	public RestTemplate restTemplate() {
		RequestConfig rc = RequestConfig.custom()
			.setConnectTimeout(Timeout.ofSeconds(3))
			.setResponseTimeout(Timeout.ofSeconds(5))
			.setExpectContinueEnabled(false)
			.build();

		CloseableHttpClient httpClient = HttpClients.custom()
			.setDefaultRequestConfig(rc)
			.disableAutomaticRetries()
			.build();

		var rf = new HttpComponentsClientHttpRequestFactory(httpClient);
		return new RestTemplate(rf);
	}

}
