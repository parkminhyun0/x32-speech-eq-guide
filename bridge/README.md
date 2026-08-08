# X32 Read-Only Bridge · macOS 현장 테스트

이 Bridge는 MacBook이 X32와 동일한 네트워크에 있을 때 X32의 OSC/UDP 상태를 읽어 현재 웹앱에 표시합니다.

## 안전 범위

- 읽기 전용입니다.
- Scene Recall, Fader, Gain, EQ, Routing, Phantom Power를 X32로 보내는 API가 없습니다.
- `/info`, `/xinfo`, `/status`, `/xremote`, 채널 상태 조회와 Meter 구독만 사용합니다.
- 실제 예배 중이 아니라 리허설 또는 비예배 시간에 먼저 시험하세요.

## 준비

1. MacBook을 iPad X32 앱과 같은 Wi-Fi에 연결합니다.
2. X32 IP를 기록합니다.
3. Mac에 Node.js 22 이상이 있어야 합니다.
4. 저장소를 내려받은 뒤 프로젝트 폴더에서 실행합니다.

```bash
npm install
npm run bridge:start
```

또는 Finder에서 `bridge/start.command`를 실행합니다. macOS가 실행을 막으면 터미널에서 한 번 실행 권한을 부여하세요.

```bash
chmod +x bridge/start.command
./bridge/start.command
```

## 접속

터미널에 다음 주소들이 표시됩니다.

```text
http://localhost:8765/x32-speech-eq-guide/
http://192.168.x.x:8765/x32-speech-eq-guide/
```

- Mac에서는 localhost 주소를 엽니다.
- iPhone은 Mac과 같은 Wi-Fi에 연결한 뒤 `192.168.x.x` 주소를 엽니다.
- 앱의 `MacBook X32 직접 연결 · 읽기 전용` 패널에서 X32 IP를 입력합니다.

## 내일 P0 테스트

1. `시뮬레이션`으로 UI와 실시간 Meter 표시를 확인합니다.
2. 시뮬레이션을 해제합니다.
3. X32 IP를 입력하고 `X32 연결`을 누릅니다.
4. Console 이름·모델·Firmware가 표시되는지 확인합니다.
5. 채널 목록 이름과 Meter가 갱신되는지 확인합니다.
6. 채널을 바꾸고 Low Cut·EQ 4밴드·Dynamics·Fader 상태가 표시되는지 확인합니다.
7. X32-EDIT와 실제 콘솔 값이 같은지 비교합니다.

## 연결 실패 시

- Mac과 X32가 같은 서브넷인지 확인합니다.
- 게스트 Wi-Fi, AP 격리, 클라이언트 격리를 확인합니다.
- macOS 방화벽에서 Node의 로컬 네트워크 접근을 허용합니다.
- X32 IP와 UDP 포트 10023을 확인합니다.
- X32 원격 클라이언트 수가 많으면 일부 앱을 종료하고 다시 시험합니다.

## 프로토콜 참고

X32 OSC는 UDP 10023을 사용합니다. `/xremote` 등록은 약 10초 동안 변경 이벤트를 전달하므로 Bridge가 8초마다 갱신합니다. Meter는 `/meters/0`을 읽기 전용으로 구독합니다.
