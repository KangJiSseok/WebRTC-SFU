// 페이지 로드 완료 시 실행
window.onload = () => {
    console.log('[Viewer] Page loaded');
    // View Stream 버튼 클릭 이벤트 등록
    document.getElementById('my-button').onclick = () => {
        console.log('[Viewer] View Stream button clicked');
        init(); // 뷰어 초기화
    }
}

// 뷰어 초기화 함수
async function init() {
    console.log('[Viewer] Initializing...');
    // WebRTC 피어 연결 생성
    const peer = createPeer();
    
    console.log('[Viewer] Adding video transceiver...');
    // 비디오 수신 전용 트랜시버 추가 (서버로부터 영상 수신)
    peer.addTransceiver("video", {direction: "recvonly"});
    
    console.log('[Viewer] Transceiver added, waiting for negotiation...');
}

// WebRTC 피어 연결 생성 함수
function createPeer(){
    // STUN 서버를 사용한 피어 연결 설정
    const peer = new RTCPeerConnection({
        iceServers: [
            {
                urls: "stun:stun.stunprotocol.org" // NAT 통과를 위한 STUN 서버
            }
        ]
    });
    
    // 서버로부터 트랙(영상/음성) 수신 시 호출
    peer.ontrack = handleTrackEvent;
    
    // 협상이 필요할 때 호출되는 이벤트 (트랜시버 추가 시 자동 발생)
    peer.onnegotiationneeded = () => {
        console.log('[Viewer] onnegotiationneeded triggered');
        handleNegotiationNeededEvent(peer);
    };
    
    // ICE 연결 상태 변화 모니터링
    peer.oniceconnectionstatechange = () => console.log('[Viewer] ICE state:', peer.iceConnectionState);
    peer.onconnectionstatechange = () => console.log('[Viewer] Peer state:', peer.connectionState);
    peer.onicecandidate = (e) => console.log('[Viewer] icecandidate', !!e.candidate);
    peer.onicegatheringstatechange = () => console.log('[Viewer] iceGatheringState:', peer.iceGatheringState);

    return peer;
}

// WebRTC 협상 처리 함수 (서버와의 SDP 교환)
async function handleNegotiationNeededEvent(peer) {
    console.log('[Viewer] Creating offer...');
    // 오퍼 생성 (뷰어 → 서버)
    const offer = await peer.createOffer();
    
    console.log('[Viewer] Setting local description...');
    // 로컬 설명 설정 (오퍼를 자신에게 설정)
    await peer.setLocalDescription(offer);
    
    console.log('[Viewer] Waiting ICE gathering complete...');
    // ICE 수집 완료까지 대기 (연결 정보 수집)
    await waitForIceGatheringComplete(peer);
    
    // 서버로 전송할 SDP 데이터
    const payload = {
        sdp: peer.localDescription
    };

    try {
        console.log('[Viewer] POST /consumer');
        // 서버의 /consumer 엔드포인트로 오퍼 전송
        const {data} = await axios.post('/consumer', payload);
        
        console.log('[Viewer] Got response, setting remote description...');
        // 서버로부터 받은 답변 SDP
        const desc = new RTCSessionDescription(data.sdp);
        
        // 원격 설명 설정 (서버의 답변을 자신에게 설정)
        await peer.setRemoteDescription(desc);
        
        console.log('[Viewer] Negotiation completed');
    } catch (e) {
        console.error('[Viewer] Failed to subscribe to broadcast:', e);
        alert('No active broadcast. 먼저 브로드캐스터 페이지에서 Start Stream을 눌러주세요.');
    }
}

// 서버로부터 트랙(영상/음성) 수신 시 호출되는 함수
function handleTrackEvent(e){
    console.log('[Viewer] Track received!', e.streams[0]);
    // 비디오 요소에 수신된 스트림 연결
    document.getElementById("video").srcObject = e.streams[0];
};

// ICE 수집 완료까지 대기하는 함수
function waitForIceGatheringComplete(peer, timeoutMs = 3000) {
    // 이미 완료된 경우 즉시 반환
    if (peer.iceGatheringState === 'complete') return Promise.resolve();

    return new Promise(resolve => {
        let resolved = false; // 중복 해결 방지 플래그
        let timer; // 타임아웃 타이머

        // 완료 처리 함수 (중복 실행 방지)
        const finish = () => {
            if (resolved) return;
            resolved = true; // 플래그 설정
            peer.removeEventListener('icegatheringstatechange', checkState);
            peer.removeEventListener('icecandidate', checkCandidate);
            clearTimeout(timer); // 타이머 정리
            resolve(); // Promise 해결
        };

        // ICE 수집 상태 변화 감지
        const checkState = () => {
            if (peer.iceGatheringState === 'complete') {
                finish();
            }
        };

        // ICE 후보 수집 완료 감지 (null candidate가 마지막)
        const checkCandidate = (event) => {
            if (!event.candidate) {
                finish();
            }
        };

        // 타임아웃 설정 (기본 3초)
        timer = setTimeout(finish, timeoutMs);
        
        // 이벤트 리스너 등록
        peer.addEventListener('icegatheringstatechange', checkState);
        peer.addEventListener('icecandidate', checkCandidate);
    });
}
