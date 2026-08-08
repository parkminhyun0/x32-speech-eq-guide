# X32 Read-Only Bridge · macOS 현장 테스트

이 Bridge는 MacBook이 X32와 동일한 네트워크에 있을 때 X32의 OSC/UDP 상태를 읽어 현재 웹앱에 표시합니다. v0.3부터 iPhone·iPad·Mac 웹앱에서 저장한 **9개 회중석 위치 측정 JSON**을 MacBook이 iCloud Desktop에서 자동 수집하고, 여러 위치의 공통 편차를 X32 선택 채널의 현재 EQ와 비교합니다.

## 안전 범위

- 읽기 전용입니다.
- Scene Recall, Fader, Gain, EQ, Routing, Phantom Power를 X32로 보내는 API가 없습니다.
- `/info`, `/xinfo`, `/status`, `/xremote`, 채널 상태 조회와 Meter 구독만 사용합니다.
- 위치 종합 결과는 0.5dB 단위의 **시험 후보**만 제시합니다.
- 실제 반영은 X32 또는 X32-EDIT에서 사람이 수동으로 수행합니다.
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

`bridge:start`는 두 개의 로컬 서비스를 함께 시작합니다.

- `8765`: X32 Read-Only Bridge와 Mac용 웹앱
- `8766`: iCloud 위치 측정 자동 수집·다지점 분석 API

## 접속

터미널에 다음 주소들이 표시됩니다.

```text
http://localhost:8765/x32-speech-eq-guide/
http://192.168.x.x:8765/x32-speech-eq-guide/
```

- Mac에서는 localhost 주소를 엽니다.
- iPhone의 카메라·마이크 측정은 공개 HTTPS 앱을 사용합니다.
- 앱의 `MacBook X32 직접 연결 · 읽기 전용` 패널에서 X32 IP를 입력합니다.

## 9개 위치 측정 저장

웹앱의 `9개 회중석 위치 · 누적 측정` 영역에서 다음 위치를 고정 ID로 사용합니다.

```text
회중석 앞      왼쪽 · 중앙 · 오른쪽
회중석 가운데  왼쪽 · 중앙 · 오른쪽
회중석 뒤      왼쪽 · 중앙 · 오른쪽
```

각 측정은 다음 값을 포함한 JSON으로 생성됩니다.

- 세션 ID·측정 고유 ID
- X32 채널·프로필
- A 변경 전 / B 변경 후
- 고정 위치 ID·위치별 반복 횟수
- 30초 평균 RMS·최대 Peak·8대역 평균
- 신뢰도·측정 시각·기기 ID·메모

파일명에는 날짜·세션·채널·A/B·위치 코드·횟수·시각·고유 ID가 포함되므로 기존 파일을 덮어쓰지 않습니다.

## iCloud 자동 수집 폴더

측정 JSON의 Safari 다운로드 위치를 다음 폴더로 지정합니다.

```text
iCloud Drive/Desktop/X32 Measurements
```

Mac Archive는 아래 후보 폴더를 2초 간격으로 확인합니다.

```text
~/Desktop/X32 Measurements
~/Library/Mobile Documents/com~apple~CloudDocs/Desktop/X32 Measurements
~/Library/Mobile Documents/com~apple~CloudDocs/X32 Measurements
```

다른 위치를 사용할 때는 실행 전에 환경 변수를 지정합니다.

```bash
X32_MEASUREMENTS_DIR="/원하는/폴더" npm run bridge:start
```

## 다지점 분석 규칙

- 위치별 전체 레벨 차이를 줄이기 위해 각 측정의 대역 분포를 상대 정규화합니다.
- 같은 위치의 반복 측정은 중앙값으로 안정화합니다.
- 신뢰도 55 미만, 5초 미만, Peak 96 이상 기록은 공통 분석에서 제외합니다.
- 서로 다른 신뢰 위치가 3곳 이상일 때만 EQ 시험 후보를 만듭니다.
- 60% 이상의 위치에서 같은 방향으로 반복되는 대역만 공통 편차로 분류합니다.
- X32 선택 채널과 측정 채널이 다르면 EQ 제안을 차단합니다.
- 현재 EQ가 같은 방향으로 이미 6dB 이상 조정됐다면 추가 변경을 차단합니다.
- 최초 후보는 한 밴드 `±0.5dB`로 제한합니다.
- B 측정에서 30% 이상의 위치가 악화되면 전체 적용 확정을 보류합니다.

## 현장 검증 순서

1. `시뮬레이션`으로 UI와 실시간 Meter 표시를 확인합니다.
2. 실제 X32 IP를 입력하고 `X32 연결`을 누릅니다.
3. Console 이름·모델·Firmware와 채널 이름·Meter를 확인합니다.
4. 설교자 채널의 Low Cut·EQ 4밴드·Dynamics·Fader가 X32-EDIT와 같은지 비교합니다.
5. iPhone에서 A 단계로 9개 위치를 측정하고 각 JSON을 iCloud에 저장합니다.
6. Mac 화면에서 JSON 수집 수·위치 수·공통 편차를 확인합니다.
7. 제안이 차단되지 않았을 때 한 밴드 0.5dB만 X32-EDIT에서 수동 변경합니다.
8. 동일 위치에서 B 단계로 재측정합니다.
9. 위치별 개선·악화 결과를 보고 유지 또는 원상복구합니다.

## 연결 실패 시

- Mac과 X32가 같은 서브넷인지 확인합니다.
- 게스트 Wi-Fi, AP 격리, 클라이언트 격리를 확인합니다.
- macOS 방화벽에서 Node의 로컬 네트워크 접근을 허용합니다.
- X32 IP와 UDP 포트 10023을 확인합니다.
- X32 원격 클라이언트 수가 많으면 일부 앱을 종료하고 다시 시험합니다.
- JSON이 보이지 않으면 Safari 다운로드 위치와 iCloud 동기화 상태를 확인합니다.

## 프로토콜 참고

X32 OSC는 UDP 10023을 사용합니다. `/xremote` 등록은 약 10초 동안 변경 이벤트를 전달하므로 Bridge가 8초마다 갱신합니다. Meter는 `/meters/0`을 읽기 전용으로 구독합니다.
