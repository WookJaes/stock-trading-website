# Portfolio Desk

Codex와 함께 개발한 키움 REST API 기반 개인 투자 관리 웹 애플리케이션입니다.

국내·해외 계좌 조회, 종목 검색, 시장 순위 확인과 모의투자 주문 기능을 하나의 반응형 대시보드에서 제공합니다.

> 실투자 환경에서는 조회 기능만 제공하며, 실투자 매수·매도 주문은 화면과 서버에서 모두 차단됩니다.

## 주요 기능

- 국내·해외 실투자 및 모의투자 계좌 조회
- 예수금, 평가금액, 평가손익 및 보유 종목 확인
- 종목명과 종목코드 검색
- 거래대금·상승률·거래량·인기검색 순위 조회
- 재사용 가능한 종목 상세 및 거래 패널
- 모의투자 매수·매도, 주문 확인 및 중복 주문 방지
- 로그인 및 모의투자 매수·매도 전량 체결 Telegram 알림
- 로그인·매수 체결·매도 체결 알림 종류별 설정
- SL/TP, 트레일링 스탑, 데드크로스 모의 자동매도 전략
- 종목별 영구 주문 잠금, 부분체결·재시작 복구 및 외부 매도 감지
- 비밀번호 로그인, 8시간 세션 만료 및 로그인 시도 제한
- 데스크톱·모바일 반응형 UI

## 기술 스택

- React, TypeScript
- Vinext, Vite
- Tailwind CSS
- TanStack Query
- Lucide React
- Node.js, SQLite, Docker Compose, Caddy
- AWS Lightsail, Lightsail Distribution

## 로컬 실행

### 요구사항

- Node.js 22.13 이상
- npm

### 설치

```bash
git clone https://github.com/WookJaes/stock-trading-website.git
cd stock-trading-website
npm ci
```

### 환경변수

```bash
cp .env.example .env
```

`.env.example`에 정의된 환경변수를 서버 환경에 맞게 설정합니다.

```dotenv
PASSWORD=<사이트 로그인 비밀번호>
SESSION_SECRET=<충분히 긴 임의 문자열>

TELEGRAM_BOT_TOKEN=<Telegram 봇 토큰>
TELEGRAM_CHAT_ID=<알림을 받을 채팅 ID>

# false: 신호 기록만, true: 모의투자 자동매도 실행
ENABLE_MOCK_STRATEGY_ORDERS=false

KIS_REAL_APP_KEY=<실투자 앱 키>
KIS_REAL_APP_SECRET=<실투자 앱 시크릿>

KIS_MOCK_DOMESTIC_APP_KEY=<국내 모의투자 앱 키>
KIS_MOCK_DOMESTIC_APP_SECRET=<국내 모의투자 앱 시크릿>

KIS_MOCK_OVERSEAS_APP_KEY=<해외 모의투자 앱 키>
KIS_MOCK_OVERSEAS_APP_SECRET=<해외 모의투자 앱 시크릿>
```

`SESSION_SECRET`은 다음 명령으로 생성할 수 있습니다.

```bash
openssl rand -base64 48
```

실제 `.env`는 Git에 커밋하지 않습니다.

Telegram 환경변수는 로그인 및 모의투자 매수·매도 전량 체결 알림에 사용됩니다. 별도 전략 워커가 주문 접수 후 5초 간격으로 최대 24시간 동안 체결 상태를 확인하므로 거래 패널이나 브라우저를 닫아도 감시가 유지됩니다. 알림 종류는 로그인 후 `알림 설정` 메뉴에서 각각 켜거나 끌 수 있습니다.

자동매도는 기본적으로 신호만 기록합니다. 국내·해외 모의투자에서 설정과 종목을 충분히 확인한 뒤에만 `ENABLE_MOCK_STRATEGY_ORDERS=true`로 변경하세요. 이 값으로도 실투자 주문은 활성화되지 않습니다.

### 개발 서버

첫 번째 터미널에서 웹 앱을 실행합니다.

```bash
npm run dev
```

두 번째 터미널에서 전략 워커를 실행합니다.

```bash
npm run dev:worker
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## 검증

```bash
npm test
npm run lint
npm run build
```

## 배포

운영 환경은 다음 구조로 배포합니다.

```text
브라우저
  │ HTTPS
  ▼
Lightsail Distribution
  │ HTTP 80
  ▼
Caddy
  │ HTTP 3000
  ▼
Vinext 애플리케이션
  │ 공유 SQLite·전략 JSON
  ▼
Strategy Worker
  │ Static IP
  ▼
키움 REST API
```

Swap 설정, Docker 설치, 환경변수 구성, Distribution 생성, 업데이트 및 문제 해결 명령은 별도 문서를 참고하세요.

- [AWS Lightsail 배포 절차](docs/aws-lightsail-deployment.md)

## 보안 원칙

- 앱 키, 시크릿과 접근 토큰은 서버에서만 사용합니다.
- 비밀번호와 세션 비밀키를 클라이언트나 로그에 노출하지 않습니다.
- 실제 `.env`를 저장소와 Docker 이미지에 포함하지 않습니다.
- 투자 환경별 인증정보와 API 도메인을 분리합니다.
- 개발 및 테스트 과정에서 실투자 주문을 실행하지 않습니다.
- 실투자 주문 요청은 서버에서도 거부합니다.

## 주의사항

이 프로젝트는 개인 투자 관리와 개발 학습을 위한 도구입니다. 투자 판단과 주문 결과에 대한 책임은 사용자에게 있으며, 실제 운영 전 키움 REST API 이용 조건과 계좌 설정을 확인해야 합니다.

전략 설정과 실행 상태는 Docker의 `strategy_data` 볼륨에 저장됩니다. 컨테이너를 다시 만들더라도 같은 Compose 프로젝트의 볼륨을 유지하면 주문 잠금, 체결 감시와 트레일링 고점이 복구됩니다. 부분체결 후 취소·실패하거나 주문 결과가 불명확하면 자동 재주문하지 않고 화면에 사용자 확인 필요 상태로 표시합니다.

## Codex 활용

OpenAI Codex와 협업하여 다음 작업을 진행했습니다.

- React 및 TypeScript 애플리케이션 구현
- 키움 REST API 명세 확인과 서버 연동
- 비밀번호 및 세션 인증 구현
- Docker와 AWS Lightsail 배포 구성
- 테스트, 린트, 빌드 및 배포 문서 검증
