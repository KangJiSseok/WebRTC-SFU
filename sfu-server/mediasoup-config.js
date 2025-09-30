// 이 파일은 SFU 서버가 사용할 mediasoup 설정 값을 모아둔 모듈이다.
// 환경 변수 문자열을 숫자로 안전하게 변환한다.
const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// NAT 환경에서 외부에 공개할 IP. 지정하지 않으면 로컬호스트로 처리한다.
const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1';

// mediasoup Worker/Router/Transport 설정을 한곳에서 정의한다.
module.exports = {
  workerSettings: {
    // RTP 포트를 제한하여 방화벽 설정을 단순화한다.
    rtcMinPort: parseNumber(process.env.MEDIASOUP_MIN_PORT, 10000),
    rtcMaxPort: parseNumber(process.env.MEDIASOUP_MAX_PORT, 10100)
  },
  routerOptions: {
    // SFU가 지원하는 기본 코덱 프로필 목록
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000
        }
      }
    ]
  },
  webRtcTransportOptions: {
    // WebRTC 트랜스포트의 네트워크 설정과 비트레이트 제한
    listenIps: [
      { ip: '0.0.0.0', announcedIp }
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1000000,
    maxIncomingBitrate: 1500000
  }
};
