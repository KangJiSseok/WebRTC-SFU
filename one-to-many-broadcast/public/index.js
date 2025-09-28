// 페이지 로드 완료 시 실행
window.onload = () => {
    // Start Stream 버튼 클릭 이벤트 등록
    document.getElementById('my-button').onclick = () => {
        console.log('[Broadcaster] Start button clicked');
        init(); // 브로드캐스트 초기화
    }
}

// 브로드캐스트 초기화 함수
async function init(){
    console.log('[Broadcaster] Requesting camera...');
    // 사용자 카메라 권한 요청 및 미디어 스트림 획득
    const stream = await navigator.mediaDevices.getUserMedia({video: true});
    console.log('[Broadcaster] Got camera stream', stream.getTracks().map(t => t.kind));
    
    // 비디오 요소에 카메라 스트림 연결
    document.getElementById("video").srcObject = stream;
    
    // WebRTC 피어 연결 생성
    const peer = createPeer();
    
    // 스트림의 모든 트랙을 피어 연결에 추가
    stream.getTracks().forEach(track => {
        console.log('[Broadcaster] Adding track', track.kind);
        peer.addTrack(track,stream) // 트랙과 스트림을 함께 추가
    });
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
    
    // 협상이 필요할 때 호출되는 이벤트 (트랙 추가 시 자동 발생)
    peer.onnegotiationneeded = () => {
        console.log('[Broadcaster] onnegotiationneeded');
        handleNegotiationNeededEvent(peer);
    };
    
    // ICE 연결 상태 변화 모니터링
    peer.oniceconnectionstatechange = () => console.log('[Broadcaster] ICE state:', peer.iceConnectionState);
    peer.onconnectionstatechange = () => console.log('[Broadcaster] Peer state:', peer.connectionState);
    peer.onicecandidate = (e) => console.log('[Broadcaster] icecandidate', !!e.candidate);
    peer.onicegatheringstatechange = () => console.log('[Broadcaster] iceGatheringState:', peer.iceGatheringState);

    return peer;
}

// ICE 수집 완료까지 대기하는 함수
function waitForIceGatheringComplete(peer, timeoutMs = 3000){
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

// WebRTC 협상 처리 함수 (서버와의 SDP 교환)
async function handleNegotiationNeededEvent(peer) {
    try {
        console.log('[Broadcaster] Creating offer...');
        // 오퍼 생성 (브로드캐스터 → 서버)
        const offer = await peer.createOffer();
        
        console.log('[Broadcaster] Setting local description...');
        // 로컬 설명 설정 (오퍼를 자신에게 설정)
        await peer.setLocalDescription(offer);
        
        console.log('[Broadcaster] Waiting ICE gathering complete...');
        // ICE 수집 완료까지 대기 (연결 정보 수집)
        await waitForIceGatheringComplete(peer);
        
        // 서버로 전송할 SDP 데이터
        const payload = {
            sdp: peer.localDescription
        };
        
        console.log('[Broadcaster] POST /broadcast');
        // 서버의 /broadcast 엔드포인트로 오퍼 전송
        const { data } = await axios.post('/broadcast', payload);
        
        // 서버로부터 받은 답변 SDP
        const desc = new RTCSessionDescription(data.sdp);
        
        console.log('[Broadcaster] Setting remote description (answer)...');
        // 원격 설명 설정 (서버의 답변을 자신에게 설정)
        await peer.setRemoteDescription(desc);
        
        console.log('[Broadcaster] Negotiation finished');
    } catch (e) {
        console.error('Broadcast negotiation failed:', e);
        alert('브로드캐스트 시작 중 오류가 발생했습니다. 콘솔 로그를 확인하세요.');
    }
}
