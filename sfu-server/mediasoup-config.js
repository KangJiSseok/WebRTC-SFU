const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1';

module.exports = {
  workerSettings: {
    rtcMinPort: parseNumber(process.env.MEDIASOUP_MIN_PORT, 10000),
    rtcMaxPort: parseNumber(process.env.MEDIASOUP_MAX_PORT, 10100)
  },
  routerOptions: {
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
