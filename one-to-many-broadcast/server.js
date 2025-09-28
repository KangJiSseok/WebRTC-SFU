// 간단한 Express 서버: 브로드캐스터와 뷰어 사이의 WebRTC 시그널 교환/중계를 담당
const express= require('express');
const app = express();
const bodyParser = require('body-parser');
const webrtc = require("@roamhq/wrtc");

// 정적 파일 제공 및 바디 파서 설정
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true}));

// 현재 활성 브로드캐스터 피어와 수신한 트랙/스트림을 보관
let broadcasterPeer = null;
let broadcastTracks = [];
let broadcastStreams = [];

// ICE 후보 수집 완료까지 대기 (마지막 null candidate 또는 state 'complete' 대기)
function waitForIceGatheringComplete(peer, timeoutMs = 3000) {
    if (peer.iceGatheringState === 'complete') {
        return Promise.resolve();
    }

    return new Promise(resolve => {
        let resolved = false;
        let timer;

        const finish = () => {
            if (resolved) return;
            resolved = true;
            peer.removeEventListener('icegatheringstatechange', checkState);
            peer.removeEventListener('icecandidate', checkCandidate);
            clearTimeout(timer);
            resolve();
        };

        const checkState = () => {
            if (peer.iceGatheringState === 'complete') {
                finish();
            }
        };

        const checkCandidate = (event) => {
            if (!event.candidate) {
                finish();
            }
        };

        timer = setTimeout(finish, timeoutMs);

        peer.addEventListener('icegatheringstatechange', checkState);
        peer.addEventListener('icecandidate', checkCandidate);
    });
}

// 브로드캐스터 트랙 준비 대기 (뷰어가 너무 빨리 접속하는 경우 대비)
async function waitForBroadcastTracks(timeoutMs = 5000) {
    if (broadcastTracks.length > 0) {
        return true;
    }
    return new Promise(resolve => {
        const startedAt = Date.now();
        const check = () => {
            if (broadcastTracks.length > 0) {
                return resolve(true);
            }
            if (Date.now() - startedAt >= timeoutMs) {
                return resolve(false);
            }
            setTimeout(check, 100);
        };
        check();
    });
}

// 브로드캐스터: offer 수신 → answer 생성/반환, 트랙 수집
app.post('/broadcast', async (req, res) => {
    try {
        const { body } = req;
        const peer = new webrtc.RTCPeerConnection({
            iceServers: [
                {
                    urls : "stun:stun.stunprotocol.org"
                }
            ]
        });

        broadcasterPeer = peer;
        broadcastTracks = [];
        broadcastStreams = [];

        // 브로드캐스터에서 들어오는 트랙/스트림 저장
        peer.ontrack = (event) => {
            broadcastTracks.push(event.track);
            if (event.streams && event.streams[0]) {
                broadcastStreams.push(event.streams[0]);
            }
        };

        // 브로드캐스터 SDP(offer) 설정 후 answer 반환
        const desc = new webrtc.RTCSessionDescription(body.sdp);
        await peer.setRemoteDescription(desc);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await waitForIceGatheringComplete(peer);
        const payload = {
            sdp: peer.localDescription
        };
        res.json(payload);
    } catch (err) {
        res.status(500).json({ error: String(err && err.message ? err.message : err) });
    }
});

// 뷰어: offer 수신 → 브로드캐스터 트랙 중계 → answer 생성/반환
app.post('/consumer', async (req, res) => {
    try {
        const ready = await waitForBroadcastTracks(5000);
        if (!ready) {
            return res.status(503).json({ error: 'No active broadcast available' });
        }

        const { body } = req;
        const peer = new webrtc.RTCPeerConnection({
            iceServers: [
                {
                    urls : "stun:stun.stunprotocol.org"
                }
            ]
        });

        // 브로드캐스터 트랙을 clone하여 이 피어에 addTrack (호환성/자원관리 목적)
        const clonesForCleanup = [];

        const ensureSenders = async () => {
            if (broadcastStreams.length > 0) {
                broadcastStreams.forEach(sourceStream => {
                    const clonedStream = new webrtc.MediaStream();
                    sourceStream.getTracks().forEach(originalTrack => {
                        const clonedTrack = originalTrack.clone();
                        clonesForCleanup.push(clonedTrack);
                        clonedStream.addTrack(clonedTrack);
                        peer.addTrack(clonedTrack, clonedStream);
                    });
                });
            } else {
                broadcastTracks.forEach(originalTrack => {
                    const clonedTrack = originalTrack.clone();
                    clonesForCleanup.push(clonedTrack);
                    peer.addTrack(clonedTrack);
                });
            }
        };

        // 연결 종료 시 clone한 트랙 자원 정리
        peer.onconnectionstatechange = () => {
            if (['disconnected', 'failed', 'closed'].includes(peer.connectionState)) {
                clonesForCleanup.forEach(track => track.stop());
            }
        };

        // 뷰어 SDP(offer) 설정 → 트랙 연결 → answer 반환
        const desc = new webrtc.RTCSessionDescription(body.sdp);
        await peer.setRemoteDescription(desc);
        await ensureSenders();
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await waitForIceGatheringComplete(peer);
        const payload = {
            sdp: peer.localDescription
        };
        res.json(payload);
    } catch (err) {
        res.status(500).json({ error: String(err && err.message ? err.message : err) });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
