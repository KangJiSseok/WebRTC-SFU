package com.signaling.config;

import java.net.URI;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * application.yml의 mediasoup 설정 값을 바인딩하기 위한 POJO.
 */
@ConfigurationProperties(prefix = "mediasoup")
public class MediasoupProperties {

    private URI sfuServerUrl = URI.create("http://localhost:3001");
    private WorkerSettings workerSettings = new WorkerSettings();

    public URI getSfuServerUrl() {
        return sfuServerUrl;
    }

    public void setSfuServerUrl(URI sfuServerUrl) {
        this.sfuServerUrl = sfuServerUrl;
    }

    public WorkerSettings getWorkerSettings() {
        return workerSettings;
    }

    public void setWorkerSettings(WorkerSettings workerSettings) {
        this.workerSettings = workerSettings;
    }

    /**
     * 후행 슬래시를 제거한 SFU 서버 URI를 반환한다.
     */
    public URI getBaseUri() {
        if (sfuServerUrl == null) {
            throw new IllegalStateException("mediasoup.sfu-server-url must be configured");
        }
        String base = sfuServerUrl.toString();
        if (base.endsWith("/")) {
            return URI.create(base.substring(0, base.length() - 1));
        }
        return sfuServerUrl;
    }

    /**
     * mediasoup Worker가 사용할 RTP 포트 범위를 나타낸다.
     */
    public static class WorkerSettings {
        private int rtcMinPort = 10000;
        private int rtcMaxPort = 10100;

        public int getRtcMinPort() {
            return rtcMinPort;
        }

        public void setRtcMinPort(int rtcMinPort) {
            this.rtcMinPort = rtcMinPort;
        }

        public int getRtcMaxPort() {
            return rtcMaxPort;
        }

        public void setRtcMaxPort(int rtcMaxPort) {
            this.rtcMaxPort = rtcMaxPort;
        }
    }
}
