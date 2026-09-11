# 키움 실투자용 고정 IP 배포 서비스 비교

> 조사 기준일: 2026-09-11  
> 대상: 현재 `STOCK-WEB` React·TypeScript·Vinext 애플리케이션  
> 전제: 키움 REST API에 등록할 수 있는 **고정 아웃바운드(egress) 공인 IPv4**가 필요함

## 결론

이 프로젝트에는 다음 두 선택지가 가장 현실적이다.

1. **AWS Lightsail 서울 리전 — 종합 추천**
   - 월 비용이 예측 가능하고, 인스턴스에 연결한 Static IP는 추가 요금이 없다.
   - 서울 리전을 선택할 수 있어 키움 API와의 네트워크 지연 측면에서 유리하다.
   - 단, Linux 서버, Docker, HTTPS, 방화벽, 프로세스 운영을 직접 관리해야 한다.
2. **Fly.io 서울 리전 + Static Egress IP — 운영 편의성 추천**
   - 외부 API의 IP 허용 목록을 위한 기능이 명확하게 제공된다.
   - 서버 관리 부담은 VPS보다 작지만 Docker와 Fly.io CLI 지식이 필요하며, 현재 Vinext의 Cloudflare Worker용 실행 결과를 컨테이너 서버 형태로 조정해야 한다.

서버 운영을 직접 할 수 있다면 **AWS Lightsail 1GB 플랜($7/월)**이 가장 균형이 좋다. 서버 관리를 줄이고 배포 편의성을 우선한다면 **Fly.io**가 적합하다.

## 서비스 비교

가격은 세금, 환율, 초과 트래픽, 백업, 도메인 비용을 제외한 대략적인 월 최소 비용이다. 실제 결제 전 공식 계산기에서 다시 확인해야 한다.

| 서비스 | 고정 아웃바운드 IP 방식 | 예상 가격 | 사용 난이도 | 필요한 개발·운영 지식 | 비교 |
|---|---|---:|---|---|---|
| **AWS Lightsail** | 인스턴스에 Static IPv4 연결 | **$7/월 권장**(1GB), $5/월부터. 연결된 Static IP는 무료 | 중간 | Linux, SSH, Docker, Nginx/Caddy, TLS, 방화벽, 백업 | **종합 추천.** 서울 리전과 예측 가능한 비용이 장점. OS 보안 업데이트와 장애 대응은 직접 해야 함 |
| **Fly.io** | 앱·리전 단위 Static Egress IPv4 | 머신 사용료 + **$3.60/월/IP** + 트래픽. 소형 머신 포함 시 대략 월 수 달러대부터 | 중간 | Docker, `flyctl`, 리전·머신 설정, 로그 확인 | **PaaS 추천.** IP 허용 목록 용도가 공식적으로 명확함. 현재 Worker 실행 구조를 Docker 서비스로 조정해야 함 |
| **DigitalOcean Droplet** | Droplet 자체 공인 IPv4를 유지하거나 Reserved IP 사용 | 1GB **$6/월**, 2GB $12/월. 연결된 Reserved IP는 무료 | 중간 | Linux, SSH, Docker, 리버스 프록시, 방화벽 | Lightsail과 유사하고 UI가 단순함. 한국 리전이 없고, Reserved IP가 실제 요청의 출발지로 보이는지는 배포 후 검증 필요 |
| **Railway Pro** | 서비스별 Static Outbound IP 활성화 | **최소 $20/월**, 포함 사용량 초과 시 RAM·CPU·트래픽 종량제 | 낮음~중간 | Git/Docker 배포, 환경변수, Railway 네트워크 설정 | 배포는 쉽지만 비용이 높음. 현재는 여러 고정 IP로 부하 분산될 수 있어 키움에 모든 IP를 등록할 수 있는지 먼저 확인해야 함 |
| **Google Cloud Run + Cloud NAT** | Direct VPC egress → Cloud NAT → 예약 IPv4 | Cloud Run 사용료 + NAT/IP 약 **$4.61/월부터** + $0.045/GiB 및 송신료 | 높음 | GCP IAM, VPC, Direct VPC egress, Cloud Router, Cloud NAT, 컨테이너 | 자동 확장과 관리형 운영이 강점. 개인용 단일 앱에는 설정 복잡도가 과도하고 비용 구조가 분산됨 |
| **Render Pro + Dedicated IPs** | 워크스페이스 전용 아웃바운드 IPv4 3개 | Pro 워크스페이스 비용 + **IP 세트 $100/월** + 서비스 사용료 | 낮음 | Git/Docker 배포, 환경변수, Render 네트워크 설정 | 사용은 쉽지만 이 프로젝트 규모에는 매우 비쌈. 3개 IP를 모두 허용 목록에 넣어야 함 |

## 현재 프로젝트에 미치는 영향

현재 프로젝트는 화면 디자인과 React 코드를 유지하면서 Vinext standalone Node 서버를 Docker로 실행하도록 변경되었다. 기존 Sites·Cloudflare Worker 전용 빌드 설정은 제거했으며, VPS나 일반 컨테이너 PaaS에서 같은 서버 API를 실행할 수 있다.

배포 시 필요한 작업 범위는 다음과 같다.

- Docker 기반 프로덕션 실행 환경 추가
- 키움 API를 호출하는 `/api/account`, `/api/stocks`, `/api/rankings`, `/api/trade` 서버 경로 유지
- 앱 키와 시크릿을 배포 서비스의 Secret/Environment Variables에만 설정
- 고정 아웃바운드 IPv4를 배정한 뒤 실제 외부 요청의 출발지 IP 확인
- 확인한 IPv4를 키움 서비스에 등록
- HTTPS 도메인 연결과 서버 방화벽 구성
- 배포 후 국내·해외 조회 API 검증

현재 `.env` 파일을 서버 이미지에 복사하거나 Git에 포함하면 안 된다. Docker를 사용할 경우 `.dockerignore`에도 `.env`와 `.env.*`를 반드시 포함해야 한다.

## 실투자 전 필수 보안 보완

현재 앱을 인터넷에 그대로 공개한 상태에서 실투자 주문을 활성화하면 안 된다. 고정 IP는 키움이 서버를 식별하기 위한 조건일 뿐, 웹 앱 사용자를 보호하는 인증 장치는 아니다.

실투자 활성화 전에 최소한 다음 항목이 필요하다.

- 웹 앱 자체 로그인과 접근 제어
- 실투자 환경의 매수·매도 주문을 서버에서 기본 거부하고, 별도의 명시적 활성화 설정 적용
- 주문 직전 계좌·종목·수량·가격 재검증
- 중복 주문 방지용 idempotency key와 서버 저장소
- CSRF 방어, 요청 빈도 제한, 세션 만료
- 앱 키·시크릿·접근 토큰의 로그 마스킹
- 주문 및 설정 변경에 대한 보안 감사 로그
- 운영 서버 SSH 키 인증, 최소 포트 개방, 자동 보안 업데이트 또는 정기 패치
- 테스트에서는 실투자 주문 호출을 차단하고 모의투자에서만 주문 검증

## 서비스별 주의점

### AWS Lightsail

- 서울 리전의 Linux/Unix 인스턴스와 public IPv4 포함 플랜을 선택한다.
- Static IP를 생성해 인스턴스에 연결한 후 그 IPv4를 키움에 등록한다.
- Static IP는 연결된 동안 추가 비용이 없지만, 연결하지 않은 채 보유하면 시간당 요금이 발생한다.
- 단일 인스턴스 장애 시 서비스도 중단되므로 스냅샷과 복구 절차가 필요하다.

### Fly.io

- 앱을 서울 리전 한 곳에서 운영하고 해당 리전에 app-scoped static egress IP를 할당한다.
- 키움에는 할당된 IPv4를 등록한다.
- 여러 리전이나 여러 egress IP를 할당하면 요청 출발지 후보가 늘어나므로 키움 등록 범위를 함께 확인해야 한다.
- 일반 Dedicated IPv4와 Static Egress IPv4는 목적이 다르다. 키움 등록에는 반드시 **Static Egress IP**가 필요하다.

### DigitalOcean

- Droplet의 공인 IPv4는 해당 Droplet을 삭제하지 않는 동안 유지된다.
- Reserved IP는 인스턴스 교체와 장애 조치에 유용하지만, 애플리케이션의 아웃바운드 요청이 어떤 IP로 나가는지 실제 배포 후 확인해야 한다.
- 한국 리전이 없으므로 일반적으로 Singapore 리전이 가까운 선택지다.

### Railway·Render

- 서버에 직접 접속해 운영할 필요가 적어 배포는 편리하다.
- 하나가 아닌 여러 아웃바운드 IP가 배정될 수 있다. 키움의 공인 IP 등록 개수 제한과 등록 방식을 먼저 확인해야 한다.
- Render의 전용 IP 세트는 개인 투자 도구 규모에 비해 비용이 높다.

### Google Cloud Run

- Cloud Run 기본 아웃바운드 주소는 고정이 아니다.
- 모든 외부 트래픽을 VPC로 보내고, 수동 예약 IP가 연결된 Cloud NAT를 통과하도록 구성해야 한다.
- 구성 요소가 많으므로 IAM이나 VPC 운영 경험이 없다면 초기 설정과 장애 분석이 어렵다.

## 권장 선택 절차

1. 월 예산이 약 $10이고 서버 관리를 감수할 수 있다면 **AWS Lightsail 서울 1GB**를 선택한다.
2. Docker 배포 편의성과 명시적인 static egress 기능을 우선하면 **Fly.io 서울 리전**을 선택한다.
3. 선택한 환경에 먼저 모의투자 키만 배포한다.
4. 서버에서 외부 IP 확인 서비스를 호출해 출발지 IPv4가 재시작·재배포 후에도 동일한지 검증한다.
5. 해당 IP를 키움에 등록하고 조회 API만 검증한다.
6. 웹 앱 인증과 주문 안전장치를 구현한 뒤에만 실투자 기능을 별도로 활성화한다.

## 공식 자료

- [AWS Lightsail 가격](https://aws.amazon.com/lightsail/pricing/)
- [AWS Lightsail Static IP 설명](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html)
- [AWS Lightsail 네트워킹](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-networking.html)
- [Fly.io Static Egress IP](https://fly.io/docs/networking/egress-ips/)
- [Fly.io 가격](https://fly.io/docs/about/pricing/)
- [DigitalOcean Droplet 가격](https://www.digitalocean.com/pricing/droplets)
- [DigitalOcean Reserved IP 가격](https://docs.digitalocean.com/products/networking/reserved-ips/details/pricing/)
- [Railway Static Outbound IP](https://docs.railway.com/networking/static-outbound-ips)
- [Railway 요금제](https://docs.railway.com/pricing/plans)
- [Google Cloud Run 고정 아웃바운드 IP 구성](https://docs.cloud.google.com/run/docs/configuring/static-outbound-ip)
- [Google Cloud NAT 가격](https://cloud.google.com/vpc/network-pricing)
- [Render Dedicated IPs](https://render.com/docs/dedicated-ips)
- [Render Dedicated IP 가격 공지](https://render.com/changelog/add-dedicated-outbound-ips-to-your-workspace)
