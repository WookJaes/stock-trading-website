# AWS Lightsail 배포 절차

> 대상: `STOCK-WEB`
>
> 구성: Lightsail Distribution HTTPS → Caddy HTTP → Vinext standalone
>
> 기준일: 2026-09-11

## 1. 운영 구조

```text
사용자 브라우저
  │ HTTPS
  ▼
Lightsail Distribution 기본 도메인
  │ HTTP 80
  ▼
Caddy 컨테이너
  │ HTTP 3000
  ▼
Vinext 앱 컨테이너
  │ 고정 아웃바운드 IPv4
  ▼
키움 REST API
```

- Distribution이 사용자 구간의 HTTPS를 담당한다.
- Caddy는 HTTP 80 요청을 앱의 3000 포트로 전달한다.
- 이 프로젝트는 Nginx와 systemd 앱 서비스를 사용하지 않는다.
- 앱 키, 시크릿, 비밀번호는 서버의 `.env`에만 저장한다.
- 실투자에서는 조회만 제공하며 매수·매도는 화면과 서버에서 차단한다.

## 2. 인스턴스와 Static IP

1. [Lightsail 콘솔](https://lightsail.aws.amazon.com/)에서 서울 리전의 Ubuntu 24.04 LTS 인스턴스를 만든다.
2. **Networking → Create static IP**에서 같은 리전의 Static IP를 만든다.
3. Static IP를 인스턴스에 연결한다.
4. 키움에 등록할 공인 IP로 이 Static IP를 사용한다.

동적 IP는 중지·시작 후 바뀔 수 있으므로 키움에 등록하지 않는다. [Static IP 생성 안내](https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-create-static-ip.html)

## 3. 방화벽

| 용도 | 프로토콜 | 포트 | 허용 대상 |
|---|---|---:|---|
| Distribution 원본 | TCP | 80 | 모든 IPv4 및 IPv6 |
| SSH | TCP | 22 | 관리자 현재 IP 및 Lightsail browser SSH |

- 앱 포트 3000은 외부에 열지 않는다.
- Distribution만 사용하면 인스턴스의 443 포트는 필요하지 않다.
- SSH 22는 가능한 한 모든 IP에 공개하지 않는다.

## 4. Docker 설치

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

SSH를 종료하고 다시 접속한 뒤 확인한다.

```bash
docker version
docker compose version
```

## 5. 1GB 인스턴스 Swap 설정

1GB 인스턴스에서는 빌드 중 메모리가 부족할 수 있으므로 2GB Swap을 권장한다.

```bash
free -h
swapon --show
ls -lh /swapfile
```

`/swapfile`이 이미 있으면 활성화만 한다.

```bash
sudo chmod 600 /swapfile
sudo swapon /swapfile
grep -qF '/swapfile none swap sw 0 0' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

파일이 없을 때만 생성한다.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
grep -qF '/swapfile none swap sw 0 0' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

```bash
free -h
swapon --show
```

`Swap`이 약 `2.0Gi`로 표시되어야 한다. Swap은 실제 RAM 증설이 아니라 보조 디스크 메모리다.

## 6. 프로젝트 배치

```bash
sudo mkdir -p /opt/stock-web
sudo chown "$USER":"$USER" /opt/stock-web
git clone https://github.com/WookJaes/stock-trading-website.git /opt/stock-web
cd /opt/stock-web
```

## 7. 환경변수

```bash
cd /opt/stock-web
cp .env.example .env
chmod 600 .env
nano .env
```

Distribution 구성에서는 Caddy가 HTTP 원본 역할만 하도록 설정한다.

```dotenv
DOMAIN=:80

PASSWORD=<사이트 로그인 비밀번호>
SESSION_SECRET=<충분히 긴 임의 문자열>

TELEGRAM_BOT_TOKEN=<Telegram 봇 토큰>
TELEGRAM_CHAT_ID=<알림을 받을 채팅 ID>

KIS_REAL_APP_KEY=<실투자 앱 키>
KIS_REAL_APP_SECRET=<실투자 시크릿>
KIS_MOCK_DOMESTIC_APP_KEY=<국내 모의투자 앱 키>
KIS_MOCK_DOMESTIC_APP_SECRET=<국내 모의투자 시크릿>
KIS_MOCK_OVERSEAS_APP_KEY=<해외 모의투자 앱 키>
KIS_MOCK_OVERSEAS_APP_SECRET=<해외 모의투자 시크릿>
```

```bash
openssl rand -base64 48
```

위 명령으로 `SESSION_SECRET`을 생성할 수 있다.

- `DOMAIN`에 `http://`, IP 또는 Distribution 주소를 넣지 않는다.
- 이 프로젝트는 `SITE_URL`을 사용하지 않는다.
- `.env`를 Git이나 Docker 이미지에 포함하지 않는다.
- 비밀번호, 세션 비밀키 및 키움 인증정보를 화면이나 로그에 출력하지 않는다.
- Telegram 봇 토큰과 채팅 ID도 서버의 `.env`에만 저장하고 저장소에 커밋하지 않는다.
- Nano 저장은 `Control+O`, `Enter`, 종료는 `Control+X`다.

## 8. 최초 빌드와 실행

```bash
cd /opt/stock-web
docker compose build
docker compose up -d
docker compose ps
```

정상 상태:

```text
app      Up ... (healthy)
caddy    Up ...
```

```bash
curl -I http://127.0.0.1
```

로그인 전에는 `307 Temporary Redirect`, `Location: /login?next=%2F`, `Via: 1.1 Caddy` 응답이 정상이다.

## 9. Lightsail Distribution 생성

1. Lightsail 홈의 **Networking**으로 이동한다.
2. **CDN distributions → Create distribution**을 선택한다.
3. Origin으로 현재 인스턴스와 연결된 Static IP를 선택한다.
4. Origin protocol은 **HTTP only**로 둔다.
5. Caching behavior는 반드시 **Best for dynamic content**를 선택한다.
6. 필요한 전송량의 플랜을 선택한다.
7. 이름을 입력하고 **Create**를 누른다.
8. 상태가 **Active**가 될 때까지 기다린다.

로그인 쿠키, API 쿼리 및 사용자별 계좌 응답이 있으므로 **Best for static content**를 사용하지 않는다. 가격과 무료 크레딧은 생성 화면과 [Lightsail 요금 안내](https://aws.amazon.com/lightsail/pricing/)를 최종 기준으로 확인한다.

## 10. HTTPS 접속 확인

Distribution 상세 화면의 Default domain을 사용한다.

```text
https://xxxxxxxxxxxx.cloudfront.net
```

시크릿 창에서 다음을 확인한다.

- HTTPS 연결 및 로그인 화면
- 비밀번호 로그인 후 계좌 화면 이동
- 새로고침 후 로그인 유지
- 국내·해외 모의투자 및 실투자 조회

직접 IP의 `http://` 주소에서는 `Secure` 세션 쿠키가 저장되지 않으므로 로그인할 수 없다.

## 11. 캐시 문제 해결

로그인 후 계좌 화면이 계속 로딩되거나 이전 응답이 표시되는 경우:

1. Distribution의 **Caching** 설정을 연다.
2. **Best for dynamic content**인지 확인한다.
3. **Reset cache** 또는 **Clear cache**를 실행한다.
4. 상태가 다시 **Active**가 될 때까지 기다린다.
5. 시크릿 창에서 다시 로그인한다.

맥북 강력 새로고침은 `Command+Shift+R`이다.

## 12. 로그인 및 API 진단

비밀 값 없이 환경변수 존재 여부를 확인한다.

```bash
cd /opt/stock-web
docker compose exec app node -e "console.log({PASSWORD: Boolean(process.env.PASSWORD), SESSION_SECRET: Boolean(process.env.SESSION_SECRET)})"
```

`.env`를 수정했다면 앱을 재생성한다.

```bash
docker compose up -d --force-recreate app
docker compose ps
```

서버 내부 인증과 계좌 API를 확인한다. 비밀번호와 쿠키 값은 출력하지 않는다.

```bash
docker compose exec app node -e "
(async () => {
  const login = await fetch('http://127.0.0.1:3000/api/auth/login', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({password: process.env.PASSWORD})
  });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const account = await fetch('http://127.0.0.1:3000/api/account?environment=domestic-mock', {
    headers: {cookie},
    signal: AbortSignal.timeout(20000)
  });
  console.log({loginStatus: login.status, cookieIssued: Boolean(cookie), accountStatus: account.status});
})().catch(error => console.log({error: error.name, message: error.message}));
"
```

로그인 `200`, 쿠키 `true`, 계좌 API `200`이면 서버는 정상이다. 브라우저만 실패하면 Distribution 설정과 캐시를 확인한다.

## 13. 고정 아웃바운드 IP 검증

```bash
cd /opt/stock-web
docker compose exec app node -e "fetch('https://checkip.amazonaws.com').then(r => r.text()).then(v => console.log(v.trim()))"
```

출력값이 Lightsail Static IP와 같은지 확인하고 이 주소만 키움에 등록한다. Distribution 주소는 사용자 접속 주소이며 키움 API의 출발지 IP가 아니다.

## 14. 업데이트 배포

코드 변경 시:

```bash
cd /opt/stock-web
git pull --ff-only
docker compose build
docker compose up -d
docker compose ps
```

`.env` 값만 바뀐 경우 빌드하지 않는다.

```bash
cd /opt/stock-web
nano .env
docker compose up -d --force-recreate app
docker compose ps
```

`DOMAIN` 변경 시 Caddy도 재생성한다.

```bash
docker compose up -d --force-recreate caddy
```

## 15. 운영 점검

- `.env`와 비밀정보를 GitHub에 올리지 않는다.
- 로그 공유 전 비밀번호, 쿠키, 앱 키, 시크릿 및 계좌 데이터 포함 여부를 확인한다.
- SSH 22 포트를 가능한 한 관리자 IP로 제한한다.
- Lightsail 스냅샷과 암호화된 `.env` 백업을 별도로 유지한다.
- 실투자 주문 차단 코드를 제거하지 않는다.
- 앱 키 변경 후 `docker compose up -d --force-recreate app`으로 토큰 캐시를 갱신한다.
