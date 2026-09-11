# AWS Lightsail 배포 절차

> 대상 프로젝트: `STOCK-WEB`  
> 기준일: 2026-09-11  
> 목표: 서울 리전의 고정 공인 IPv4에서 Vinext 서버와 키움 REST API 호출을 운영

## 1. 배포 구조

```text
사용자 브라우저
    │ HTTPS 443
    ▼
Caddy 컨테이너 ── HTTP 3000 ── Vinext Node 컨테이너
                                      │
                                      │ 고정 아웃바운드 IPv4
                                      ▼
                                키움 REST API
```

- Caddy가 HTTPS 인증서 발급·갱신과 리버스 프록시를 담당한다.
- Vinext는 `output: 'standalone'`으로 빌드한 Node 서버를 실행한다.
- 키움 앱 키와 시크릿은 Lightsail 서버의 `.env`에만 저장한다.
- Docker 이미지와 Git 저장소에는 `.env`가 포함되지 않는다.
- Lightsail Static IP가 웹 접속 주소이자 키움 API 호출의 출발지 IPv4가 된다.

## 2. 프로젝트에 반영된 변경 사항

- Sites 및 Cloudflare Worker 전용 Vite 플러그인 제거
- `.openai/hosting.json` 제거
- `npm start`를 `vinext start`로 변경
- Vinext standalone Node 빌드 활성화
- 다단계 `Dockerfile` 추가
- 애플리케이션과 Caddy를 실행하는 `compose.yaml` 추가
- 자동 HTTPS와 보안 헤더를 적용하는 `Caddyfile` 추가
- `.env`가 이미지에 들어가지 않도록 `.dockerignore` 추가
- 서버 환경변수의 이름만 제공하는 `.env.example` 추가

실투자 환경에서는 계좌·종목·순위 조회만 제공한다. 실투자 매수·매도와 주문 상태 조회는 화면과 서버 API 양쪽에서 차단되어 있다.

## 3. 준비물

- AWS 계정
- 사용할 도메인 또는 서브도메인(예: `stocks.example.com`)
- Git 저장소 접근 권한 또는 프로젝트 파일을 서버로 전송할 방법
- 실투자 및 국내·해외 모의투자 앱 키와 시크릿
- 키움에 등록할 공인 IPv4

HTTPS 없이 앱 키와 계좌 정보를 다루지 않는다. Caddy의 자동 인증서 발급에는 도메인의 DNS가 서버를 가리키고 80·443 포트가 외부에 열려 있어야 한다.

## 4. Lightsail 인스턴스 생성

1. [AWS Lightsail 콘솔](https://lightsail.aws.amazon.com/)에 접속한다.
2. **Create instance**를 선택한다.
3. 리전을 **Seoul (`ap-northeast-2`)**로 선택한다.
4. 플랫폼은 **Linux/Unix**, 이미지는 **Ubuntu 24.04 LTS**를 선택한다.
5. 최소 1GB 메모리 플랜을 권장한다. 빌드 중 메모리가 부족하면 2GB 플랜을 사용하거나 로컬/CI에서 이미지를 빌드해 레지스트리로 배포한다.
6. 인스턴스 이름을 정하고 생성한다.

Lightsail의 기본 동적 IP는 인스턴스를 중지·시작하면 바뀔 수 있으므로 그대로 키움에 등록하면 안 된다. AWS의 [Static IP 생성 안내](https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-create-static-ip.html)에 따라 고정 주소를 연결해야 한다.

## 5. Static IP 연결

1. Lightsail 콘솔의 **Networking**으로 이동한다.
2. **Create static IP**를 선택한다.
3. 인스턴스와 동일한 서울 리전을 선택한다.
4. 앞에서 생성한 인스턴스를 지정하고 Static IP를 생성한다.
5. 표시된 IPv4를 별도로 기록한다.

인스턴스에 연결된 Static IP에는 추가 요금이 없지만, 연결하지 않은 상태로 보유하면 요금이 발생할 수 있다. 자세한 내용은 [Lightsail 요금 안내](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-frequently-asked-questions-faq-billing-and-account-management.html)를 확인한다.

## 6. 방화벽 설정

인스턴스의 **Networking → IPv4 Firewall**에서 다음 규칙만 둔다.

| 용도 | 프로토콜 | 포트 | 허용 대상 |
|---|---|---:|---|
| SSH | TCP | 22 | 관리자 본인의 고정 IP 또는 현재 IP `/32` |
| HTTP | TCP | 80 | 모든 IPv4 |
| HTTPS | TCP | 443 | 모든 IPv4 |

- 애플리케이션 포트 3000은 외부에 열지 않는다.
- SSH 22번을 모든 IP에 공개하지 않는다.
- Lightsail 웹 서버의 표준 인바운드 규칙은 AWS의 [방화벽 규칙 참고 문서](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-firewall-rules-reference.html)에서 확인할 수 있다.

## 7. DNS 연결

도메인 관리 화면에서 사용할 호스트의 A 레코드를 Static IP로 지정한다.

```text
종류: A
이름: stocks
값: <LIGHTSAIL_STATIC_IP>
TTL: 300 또는 공급자 기본값
```

DNS 전파 확인:

```bash
dig +short stocks.example.com A
```

출력이 Lightsail Static IP와 같아야 한다. Lightsail DNS를 사용할 경우 [AWS Lightsail DNS 안내](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-dns-in-amazon-lightsail.html)를 참고한다.

## 8. 서버 접속 및 Docker 설치

Lightsail 브라우저 SSH 또는 로컬 SSH 키로 접속한다. Ubuntu에서 Docker 공식 저장소를 설정한 뒤 Docker Engine과 Compose 플러그인을 설치한다. 아래 명령은 Docker의 [Ubuntu 설치 문서](https://docs.docker.com/engine/install/ubuntu/)에 있는 저장소 방식의 요약이다. 실행 전 공식 문서의 최신 지원 버전을 확인한다.

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"${UBUNTU_CODENAME:-$VERSION_CODENAME}\") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

그룹 변경을 적용하려면 SSH 연결을 종료했다가 다시 접속한다.

```bash
docker version
docker compose version
```

## 9. 프로젝트 배치

Git 저장소를 사용하는 경우:

```bash
sudo mkdir -p /opt/stock-web
sudo chown "$USER":"$USER" /opt/stock-web
git clone <REPOSITORY_URL> /opt/stock-web
cd /opt/stock-web
```

비공개 저장소라면 배포 전용 SSH 키 또는 최소 권한의 액세스 토큰을 사용한다. 개인 암호나 장기 토큰을 Git 원격 URL에 저장하지 않는다.

## 10. 서버 환경변수 설정

예시 파일을 복사하고 서버에서만 값을 입력한다.

```bash
cd /opt/stock-web
cp .env.example .env
chmod 600 .env
nano .env
```

형식:

```dotenv
DOMAIN=stocks.example.com

PASSWORD=<사이트 로그인 비밀번호>
SESSION_SECRET=<충분히 긴 임의 문자열>

KIS_REAL_APP_KEY=<실투자 앱 키>
KIS_REAL_APP_SECRET=<실투자 시크릿>
KIS_MOCK_DOMESTIC_APP_KEY=<국내 모의투자 앱 키>
KIS_MOCK_DOMESTIC_APP_SECRET=<국내 모의투자 시크릿>
KIS_MOCK_OVERSEAS_APP_KEY=<해외 모의투자 앱 키>
KIS_MOCK_OVERSEAS_APP_SECRET=<해외 모의투자 시크릿>
```

주의사항:

- `.env`를 Git에 추가하거나 Docker 이미지에 복사하지 않는다.
- 앱 키, 시크릿, 접근 토큰을 명령행 인수나 로그로 출력하지 않는다.
- `SESSION_SECRET`은 `openssl rand -base64 48` 등으로 생성해 `PASSWORD`와 다른 값으로 설정한다.
- 로그인 세션은 8시간 동안 유지되며, 비밀번호나 세션 비밀키를 바꾼 뒤에는 `docker compose restart app`을 실행한다.
- 실투자 인증정보는 조회 기능에만 사용한다. 화면에 주문 버튼이 보이지 않더라도 서버의 실투자 주문 차단 코드를 제거하지 않는다.
- 키움에 Lightsail Static IP를 등록하기 전에는 실투자 인증이나 조회를 시험하지 않는다.

## 11. 빌드 및 실행

```bash
cd /opt/stock-web
docker compose build
docker compose up -d
docker compose ps
```

상태 확인:

```bash
docker compose logs --tail=100 app
docker compose logs --tail=100 caddy
curl -I https://stocks.example.com
```

로그를 공유하기 전 인증정보나 계좌 데이터가 포함되지 않았는지 확인한다.

## 12. 고정 아웃바운드 IP 검증 및 키움 등록

애플리케이션 컨테이너에서 보이는 출발지 IPv4를 확인한다.

```bash
docker compose exec app node -e "fetch('https://checkip.amazonaws.com').then(r => r.text()).then(v => console.log(v.trim()))"
```

출력값이 Lightsail Static IP와 같은지 확인한다. 인스턴스와 컨테이너를 재시작한 뒤에도 같은지 한 번 더 검증한다.

```bash
docker compose restart
docker compose exec app node -e "fetch('https://checkip.amazonaws.com').then(r => r.text()).then(v => console.log(v.trim()))"
```

검증된 IPv4 하나만 키움 서비스의 공인 IP 등록 화면에 입력한다. IP 등록이 끝나기 전에는 실투자 인증이나 주문을 시험하지 않는다.

## 13. 업데이트 배포

```bash
cd /opt/stock-web
git pull --ff-only
docker compose build
docker compose up -d
docker compose ps
```

업데이트 직후 다음을 확인한다.

- 홈페이지 HTTPS 응답
- 국내·해외 실투자 계좌 조회
- 국내·해외 모의투자 계좌 조회
- 종목 검색과 순위 조회
- 모의투자 주문 확인 절차
- 컨테이너 재시작 후 고정 아웃바운드 IP 유지

## 14. 백업과 복구

- 코드와 `.env`를 서로 분리해 관리한다.
- `.env`는 암호화된 비밀 저장소에 별도 백업한다.
- Lightsail 스냅샷을 정기적으로 생성한다.
- Caddy 인증서 상태는 `caddy_data` Docker 볼륨에 저장된다.
- 장애 시 새 인스턴스를 만들고 기존 Static IP를 새 인스턴스에 다시 연결할 수 있다.

## 15. 실투자 전 추가 개발 체크리스트

고정 IP 배포가 완료되어도 현재 앱에서는 실투자를 활성화하면 안 된다. 다음 기능을 먼저 구현하고 별도로 검증해야 한다.

- 앱 자체 로그인 및 세션 보호
- 실투자 주문 서버 측 기본 차단과 명시적 활성화 스위치
- CSRF 방어와 요청 빈도 제한
- 주문별 idempotency key 영구 저장
- 주문 직전 잔고·주문가능수량 재검증
- 민감정보·접근 토큰 로그 마스킹
- 주문 감사 로그와 비정상 접근 알림
- 실투자와 각 모의투자 인증정보·도메인의 완전한 분리

## 16. 문제 해결

### Caddy가 인증서를 발급하지 못함

- DNS A 레코드가 Static IP를 가리키는지 확인한다.
- Lightsail 방화벽에서 80과 443이 열렸는지 확인한다.
- `DOMAIN`에 프로토콜이나 경로 없이 호스트명만 입력했는지 확인한다.

### 앱 컨테이너가 unhealthy 상태임

```bash
docker compose ps
docker compose logs --tail=200 app
```

- `.env`의 변수 이름이 `.env.example`과 일치하는지 확인한다.
- 1GB 인스턴스에서 빌드가 종료됐다면 메모리 부족 여부를 확인하고 2GB 플랜을 고려한다.

### 키움 API 인증 실패

- 앱 키가 해당 국내·해외 및 실투자·모의투자 환경과 일치하는지 확인한다.
- 키움에 등록한 IPv4와 컨테이너의 실제 아웃바운드 IPv4가 같은지 확인한다.
- 키를 변경한 뒤에는 `docker compose restart app`으로 토큰 캐시와 프로세스 환경을 갱신한다.
- 키나 시크릿의 실제 값을 로그나 화면에 출력하지 않는다.
