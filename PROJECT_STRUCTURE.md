# Mars-Fit 프로젝트 전체 구조

화성시 소상공인이 지원사업을 찾고 **신청 완료까지** 안내받는 AI 경영동행 서비스.
2026 AI화성 챌린지 출품작.

배포: https://ai-hwaseong-ten.vercel.app

---

## 기술 스택

| 구분 | 기술 |
|---|---|
| 프론트엔드 | React 18, Vite 6, Tailwind CSS, Framer Motion |
| 라우터 | HashRouter (`/#/home`) — 새로고침 404 방지 |
| 지도 | Leaflet (상권분석) |
| 아이콘 | Lucide React |
| 백엔드 | Python Serverless (Vercel Functions) |
| DB | Supabase (PostgREST HTTP API, 표준 라이브러리만 사용) |
| LLM | Groq → xAI → Gemini 자동 폴백 (`/api/llm` 프록시) |
| 인증 | 카카오 OAuth 2.0 → JWT (HS256, 유효기간 2주) |
| OCR | easyocr (외부 서버 pjrx.kr — Vercel 250MB 한도 초과) |
| 배포 | Vercel Hobby (Serverless Function 최대 12개) |

---

## 저장소 루트 구조

```
ai-hwaseong/
├── project/          프론트엔드 (React + Vite)
├── api/              Vercel Serverless Functions (Python)
├── backend/          로컬 개발 서버 + 매칭 엔진
├── policy_data/      공고 데이터 수집·가공 스크립트
├── server_data/      외부 서버(pjrx.kr) 코드
├── scripts/          운영 스크립트 (cron, 시연 도구)
├── docs/             Supabase 스키마 등 문서
├── vercel.json       Vercel 빌드·라우팅 설정
└── .github/workflows/ CI (빌드 검사, 공고 갱신 수동 트리거)
```

---

## 프론트엔드 (`project/src/`)

### 색상 토큰 (tailwind.config.js)

| 토큰 | 값 | 용도 |
|---|---|---|
| `primary-bg` | `#fafaf5` | 전체 배경 |
| `navy` | `#2a3c77` | 주요 텍스트·버튼 |
| `star-yellow` | `#fbe281` | 강조·별 |
| `sunset-orange` | `#cb6b3d` | CTA 버튼·행성 |
| `warm-gray` | `#c1af9b` | 구분선·보조 요소 |
| `warm-text` | `#7a6a58` | 본문 텍스트 (명암비 4.98:1) |
| `burgundy` | `#402b38` | 다크 배경 |

### 라우팅 (`App.jsx`)

| 경로 | 컴포넌트 | 설명 |
|---|---|---|
| `/` | `Landing` | 서비스 소개 랜딩 |
| `/auth` | `Auth` | 카카오 로그인 |
| `/onboarding` | `Onboarding` | 온보딩 설문 |
| `/home` | `Home` | 메인 대시보드 |
| `/notice` | `NoticeDetail` | 공고 상세 |
| `/apply` | `ApplicationGuide` | 서류 준비 + 신청 동행 |
| `/district` | `District` | 내 매장 현황 / 상권분석 |
| `/schedule` | `Schedule` | 달력·세무일정 |
| `/mission` | `MissionControl` | 마이다 챗봇 |

> 화면 전환은 Framer Motion (0.12초 fade+slide). 카카오 OAuth redirect는
> App.jsx 최상단에서 가로채 처리한다 (`consumeKakaoRedirect`).

---

### pages/

#### `Landing.jsx` — 서비스 소개 랜딩
- 히어로: 우주 배경(별·성운·유성·궤도 링) + 마이다 이미지 3장 순환 (search → find → mars, 3초 fade)
- "Mars-Fit이 함께해요" 문구 + "마이다" 강조
- 이용 방법 3단계 (내 조건 입력 → AI 매칭 → 신청 동행)
- 로그인 여부에 따라 CTA 버튼 전환 (카카오 시작 / 내 지원사업 보러가기)

#### `Auth.jsx` — 카카오 로그인
- 이미 로그인됐으면 `/home` 또는 `/onboarding` 자동 이동
- 카카오 인가 URL 요청 → 리다이렉트 처리

#### `Onboarding.jsx` — 온보딩 설문 (10단계)
- **WelcomeScreen**: 신규 로그인 시 마이다 캐릭터 + 환영 메시지 → "입력하러 가기"
- 상황(예비창업/운영중) → 업종 → 기본정보(나이·성별·지역·가구원수 등)
- 직원 유무에 따라 원천세 납부 주기 질문 추가 (단계 동적 변화)
- 소득 분위 기준금액 카드 (2026 기준 중위소득, 가구원 수별)
- OCR: 사업자등록증 사진 → `/api/ocr` → 필드 자동 채움 (서버 꺼지면 직접 입력으로 전환)
- LLM: 창업 희망 업종 텍스트 → 5개 업종 분류
- 완료 시 DoneScreen: search.png 로딩 → find.png 말풍선 + OrbitProgressBar

#### `Home.jsx` — 메인 대시보드
- MarsGreeting (인사 배너)
- OrbitDashboard (공고 목록 — 긴급마감 1건 + 지원사업 탐색 3건 + 더보기)
- DeadlineCalendar (간략 달력)
- FavoriteNotices (관심공고 목록)
- 인앱 알림 동기화 (`syncNoticeAlerts`)

#### `NoticeDetail.jsx` — 공고 상세
- localStorage 경유 (`mars-fit-current-notice`) — URL 파라미터 없음
- "쉽게 보기" LLM 요약: 뭘 주나요 / 얼마나 / 주의할 점
- 행정용어 노란 버튼 → 팝업 뜻풀이 (terms.json + `/api/terms/lookup`)
- 관심공고 ★ 버튼
- 접수처·신청 방법·기간 정보

#### `ApplicationGuide.jsx` — 서류 준비 + 신청 동행
- OrbitProgressBar (서류 준비 → 신청 완료 단계 추적)
- LLM 서류 체크리스트 생성 (`generateChecklist`)
- ChecklistSection (항목 탭 → DocumentStepDrawer)
- "🚀 신청 동행 시작하기" → ApplyStepDrawer
- 신청 완료 시 `markApplied()` 기록, OrbitProgressBar 신청 완료 단계로 이동

#### `District.jsx` — 내 매장 현황 / 상권분석
- **운영중 사장님**: 세무일정 목록(TaxRow) + 매칭 공고 + 신청 완료 기록
- **예비창업자**: Leaflet 지도 기반 상권분석 (CommercialAnalysisView)
- `useState(() => JSON.parse(localStorage...))` — 첫 렌더에 프로필 읽어 화면 분기

#### `Schedule.jsx` — 달력·세무일정
- DeadlineCalendar (레이어 3개: 전체 공고·관심공고·세무일정 껐다 켜기)
- 오른쪽 패널: 날짜별 DayPanel (세무일정·공고·메모)
- CollapsibleSection: "세무 신고기한" + "상시 접수" 접기/펴기 (`grid-template-rows` 애니메이션)
- 날짜별 한 줄 메모 (`calendarNotes.js`)

#### `MissionControl.jsx` — 마이다 챗봇
- 마이다 캐릭터 아바타 + 말풍선 UI
- RAG 키워드 스코어링 → 컨텍스트 공고 첨부
- 행정용어 하이라이트·팝업 (ChatBubble)
- 추천 칩 (빠른 질문 입력)
- LLM 응답: `{answer, retrieved_terms, followup}` 스키마

---

### components/

#### layout/
| 파일 | 역할 |
|---|---|
| `Header.jsx` | 상단 탭 내비게이션. 사업자 여부에 따라 "내 매장"/"상권분석" 레이블 전환. NotificationBell 포함 |
| `BottomNav.jsx` | 사용 안 함 (레거시, `return null`) |
| `PageWrapper.jsx` | 최대 너비 4xl 중앙 정렬 컨테이너 |

#### sections/
| 파일 | 역할 |
|---|---|
| `MarsGreeting.jsx` | 홈 최상단 네이비 배너. 마이다 캐릭터 + 인사말 |
| `OrbitDashboard.jsx` | 매칭 공고 카드 목록. 긴급마감 1건 고정, 지원사업 3건 + 더보기, 스크롤 위치 복원, 방문 공고 흐리기 |
| `ChecklistSection.jsx` | 서류 체크리스트. 항목 탭 → DocumentStepDrawer |
| `CommercialAnalysisView.jsx` | Leaflet 지도 + POI 마커(학교·음식점·카페·역·아파트). 반경 필터, LLM 자연어 요약 |
| `FavoriteNotices.jsx` | 관심공고 목록. 마감순, 서류 진행률 표시, 5건 + 더보기 |

#### ui/
| 파일 | 역할 |
|---|---|
| `Button.jsx` | 공용 버튼. navy / sunset-orange / outline / ghost, sm/md/lg |
| `Card.jsx` | 공용 카드 컨테이너. plain / urgent |
| `ChatBubble.jsx` | 챗봇 말풍선. 행정용어 하이라이트 + 클릭 팝업 |
| `MarsAvatar.jsx` | 마이다 캐릭터 아바타. sm/md/lg/xl |
| `FloatingChatButton.jsx` | 챗봇 진입 FAB. 별 애니메이션 |
| `KakaoButton.jsx` | 카카오 공식 로그인 버튼 (`#FEE500`) |
| `KakaoNotifyCard.jsx` | 카카오톡 알림 켜기/끄기 카드 |
| `NotificationBell.jsx` | 인앱 알림 종. 알림 없으면 숨김 |
| `NotifySettings.jsx` | 알림 설정 UI (새 공고·마감·세무·점수 필터) |
| `OrbitProgressBar.jsx` | 4단계 SVG 궤도 진행 표시 (정책 매칭→서류 준비→정책 신청→신청 완료). `applied=true` 시 로켓이 완료 행성으로 이동 |
| `DeadlineCalendar.jsx` | 월별 달력. 공고 마감·세무 점 표시. `onSelectDay` prop 있으면 DayPanel 연동 |
| `DayPanel.jsx` | 선택 날짜의 세무일정·공고·메모 패널 |
| `DocumentStepDrawer.jsx` | 서류 발급 단계 안내 드로어 (사이드바 + iframe 뷰어) |
| `ApplyStepDrawer.jsx` | 신청 접수 단계 안내 드로어. LLM 생성 단계 체크리스트 + 신청 사이트 iframe |
| `FavoriteButton.jsx` | 관심공고 ★ 버튼 (멀티 화면 동기화) |
| `SiteLaunchSheet.jsx` | 외부 사이트 이동 전 미리보기 바텀시트 (홈택스·정부24 등 12개 등록) |
| `TaxRow.jsx` | 세무 신고 한 줄. D-day·신고 방법·완료 체크·가산세 주의. District·Schedule·DayPanel 공용 |
| `TaxProfileHint.jsx` | 세무일정 과다 시 이유 설명 + 내 정보 수정 유도 |

#### dev/
| 파일 | 역할 |
|---|---|
| `DevTools.jsx` | 개발 전용 도구. 페이지 이동·API 상태·데모 프로필·mock 모드·첫 로그인 환영 화면 시뮬레이션 |

---

### utils/

#### API·인증
| 파일 | 역할 |
|---|---|
| `api.js` | 백엔드 HTTP 호출 단일 창구. JupyterHub 프록시 경로 보정, mock 분기. `fetchMatches`(결과가 아닌 Promise를 3분 캐싱) |
| `kakao.js` | 카카오 OAuth. `goToKakaoLogin` · `consumeKakaoRedirect` · 알림 켜기/끄기 |
| `userState.js` | localStorage(원본) ↔ Supabase `user_state` 동기화. 로그인 시에만. 관심공고·메모·진행도·신청완료·알림설정·세무완료 6종 |

#### 공고·관심·진행
| 파일 | 역할 |
|---|---|
| `favorites.js` | 관심공고 CRUD. 이벤트 기반 멀티 화면 동기화 |
| `appliedPrograms.js` | 신청 완료 기록 읽기. 삭제 없음 |
| `checklistProgress.js` | 공고별 서류 체크 진행 상태 (공고 번호를 키로 하는 맵) |
| `visitedNotices.js` | 열어본 공고 ID 기록 (최대 300건, 목록 흐리기용) |
| `openNotice.js` | 공고 번호 → 매칭 재호출 → `/notice` 이동 |
| `docName.js` | 공고 원문 서류 이름 정제 (글머리표·부연 제거) |

#### 세무
| 파일 | 역할 |
|---|---|
| `taxSchedule.js` | 프로필 기반 세무일정 필터링·법정기한 계산. `policy_data/tax_schedule.py`의 JS 사본 |
| `taxCalendar.js` | 연 1회·매월 반복 구조를 날짜별로 펼침 (달력 점 표시용) |
| `taxDone.js` | 신고 완료 체크. `{항목번호}::{기한날짜}` 키, 400일 보관 |

#### 알림
| 파일 | 역할 |
|---|---|
| `notifications.js` | 인앱 알림 생성. 관심공고 마감 D-7·D-3·D-1, 세무 신고기한, 새 공고 |
| `notifySettings.js` | 알림 설정 저장·읽기. 브라우저와 서버(카톡) 양쪽에서 사용 |

#### 기타
| 파일 | 역할 |
|---|---|
| `scrollMemory.js` | 화면 스크롤 위치 기억·복원 (sessionStorage) |
| `calendarNotes.js` | 날짜별 한 줄 메모. `noteKey`로 날짜 표준화 |
| `today.js` | 한국 시간(Asia/Seoul) 기준 오늘 날짜 |
| `demoMode.js` | 시연용 더미 프로필 2종 (운영중·예비창업) |

#### utils/llm/
| 파일 | 역할 |
|---|---|
| `llmProvider.js` | LLM 호출 단일 창구. `POST /api/llm` 경유 (API 키 서버 보관) |
| `generateChatbotResponse.js` | 챗봇 응답. RAG 키워드 스코어링 + 시스템 프롬프트 |
| `generateChecklist.js` | 서류 체크리스트 LLM 생성. 단계·발급방법·비용·소요시간·주의사항 |
| `summarizeNoticeEasy.js` | 공고 → 쉬운 설명 변환. `{what, benefits[], caution}` |

---

## 백엔드 API (`api/`)

### Vercel Serverless Functions (11개)

| 파일 | 엔드포인트 | 메서드 | 역할 |
|---|---|---|---|
| `health.py` | `/api/health` | GET | 서버 생존 확인, 공고 건수, OCR 서버 상태 |
| `auth_kakao.py` | `/api/auth/kakao` | GET·POST | 카카오 OAuth (인가 URL / code → JWT) |
| `match.py` | `/api/match` | POST | 프로필 → 공고 매칭 (notices JSON 콜드스타트 캐싱) |
| `onboarding.py` | `/api/users/me/onboarding` | GET·PUT·PATCH | 온보딩 프로필 저장·조회·부분수정. 허용 키 17개 화이트리스트 |
| `user_state.py` | `/api/users/me/state` | GET·PUT | 기기 간 동기화 저장소 (내용 투명 저장) |
| `llm.py` | `/api/llm` | POST | LLM 프록시. Groq → xAI → Gemini 자동 폴백 |
| `glossary.py` | `/api/terms`, `/api/terms/lookup` | GET·POST | 행정용어 사전 조회·공고 기반 용어 추출 (한 파일에 두 라우트) |
| `ocr.py` | `/api/ocr` | POST | 사업자등록증 OCR 중계 (외부 서버 pjrx.kr) |
| `commercial.py` | `/api/commercial` | POST | 상권 POI 데이터 중계 (외부 서버 pjrx.kr) |
| `foottraffic.py` | `/api/foottraffic` | POST | 유동인구 추정 + LLM 요약 중계 |
| `notify_kakao.py` | `/api/notify/kakao` | GET·POST·DELETE | 카카오톡 알림 구독 관리 |

### 내부 공용 모듈 (밑줄 파일 — Vercel 라우트 제외)

| 파일 | 역할 |
|---|---|
| `_shared.py` | BaseHTTPRequestHandler 서브클래스, CORS, JSON 입출력, sys.path 설정 |
| `_auth.py` | JWT 발급·검증 (HS256, 표준 라이브러리만, 타이밍 공격 방어) |
| `_store.py` | Supabase 클라이언트 (urllib만, psycopg 불필요). 사용자·프로필·user_state·카카오 알림 CRUD |
| `_ping.py` | 진단용 (`/api/ping`). 현재 비활성 (활성화 시 파일명에서 밑줄 제거) |

### vercel.json URL 재작성

```
/api/auth/kakao         → /api/auth_kakao
/api/users/me/onboarding → /api/onboarding
/api/users/me/state     → /api/user_state
/api/notify/kakao       → /api/notify_kakao
/api/terms              → /api/glossary
/api/terms/lookup       → /api/glossary
```

---

## 매칭 엔진 (`backend/`, `policy_data/`)

### backend/matching.py
- 공고 JSON 로드 → `is_sosang()` 필터 → `score_policy()` 스코어링
- 업종별 `CATEGORY_SIGNALS` 딕셔너리 (카페·음식점·소매업·제조업·기타 5종)
- `INDUSTRY_ONLY` 패턴 → 업종 고정 공고는 `확인필요`로 분류
- `classify_target()` 직접 사용 금지 (83건 중 76건 restricted 오류)

### policy_data/ — 공고 수집·가공

| 파일 | 역할 |
|---|---|
| `collect.py` | 기업마당 API 수집. `is_sosang()` 관문 하나로 통합 |
| `extract.py` | 수집된 raw 공고 → notices/ JSON 가공 |
| `fetch_docs.py` | 공고 첨부 문서 수집 |
| `hscity.py` | 화성시청 고시공고 수집 (기업마당에 안 올라오는 화성시 전용 사업) |
| `tax_schedule.py` | 세무일정 계산 (JS `taxSchedule.js`의 Python 원본) |
| `terms.py` | 행정용어 사전 처리 |
| `hscity_support.json` | 화성시청 지원사업 공고 (저장소에 커밋, gitignore 제외) |
| `tax_calendar.json` | 세무일정 데이터 (project/src/data/tax_calendar.json과 바이트 동일해야 함) |

### 공고 소스 2종

| 소스 | 수집 방법 | 특이사항 |
|---|---|---|
| 기업마당 API | `collect.py --raw` | 현재 열린 공고만 반환 |
| 화성시청 고시공고 | `hscity.py --support` | 앞 몇 장만 수집 (새 공고는 앞쪽), 만료 공고 직접 필터링 |

---

## 운영 스크립트 (`scripts/`)

| 파일 | 역할 |
|---|---|
| `cron_update_notices.sh` | 공고 자동 갱신 (연구실 서버 cron, 매일 06:11 KST) |
| `notify_kakao.py` | 카카오톡 알림 실제 발송 (cron이 공고 갱신 뒤 실행) |
| `preflight.py` | 시연 전 점검 6개 항목 (LLM·OCR·상권분석·Supabase 등) |
| `run_ocr.sh` | OCR 서버 로컬 실행 + 무료 터널 (주소 매번 바뀜) |
| `run_server.sh` | 로컬 개발 서버 실행 |

---

## 데이터 흐름

```
[인증]
브라우저 → /api/auth/kakao → 카카오 서버 → JWT 발급 → localStorage

[공고 매칭]
프로필(localStorage) → POST /api/match → backend/matching.py
→ policy_data/notices/ JSON → 스코어링 → 화면 (Promise 3분 캐싱)

[LLM]
프론트 llmProvider.js → POST /api/llm → Groq/xAI/Gemini
(API 키는 Vercel 환경변수에만 보관)

[OCR · 상권분석 · 유동인구]
브라우저 → api/{ocr·commercial·foottraffic}.py → 외부 서버(pjrx.kr) → 결과 반환
(easyocr는 1.4GB라 Vercel 250MB 한도 초과 → 외부 서버 분리)

[기기 간 동기화]
localStorage (원본) ←→ Supabase user_state (로그인 시에만, 나중이 이김)

[카카오톡 알림]
연구실 서버 cron → scripts/notify_kakao.py → Supabase (refresh_token 조회)
→ 카카오 API → 사장님 "나와의 채팅"
```

---

## 두 벌로 관리하는 로직 (반드시 양쪽 동시 수정)

| JS (프론트) | Python (서버) | 내용 |
|---|---|---|
| `utils/taxSchedule.js` | `policy_data/tax_schedule.py` | 세무일정 계산 |
| `src/data/tax_calendar.json` | `policy_data/tax_calendar.json` | 세무 데이터 (md5sum 일치 확인) |
| `utils/notifications.js` | `scripts/notify_kakao.py` | 알림 문턱·설정 |
| `utils/taxDone.js`의 `taxDoneKey()` | `scripts/notify_kakao.py`의 `pick_tax()` | 신고 완료 열쇠 형식 |

---

## 담당

| 사람 | 영역 |
|---|---|
| 전서희 | LLM 전부 — 챗봇, 체크리스트, 공고 요약, 온보딩 LLM, 서류준비 창 |
| 전성현 | 상권분석, 달력, OCR |
| 임대윤 | 세무일정, 관심공고, 알림, 데이터 수집, 배포 |

---

## 운영 제약

| 제약 | 내용 |
|---|---|
| Vercel 함수 한도 | 12개 (현재 11개 사용). 초과 시 빌드 전체 실패 |
| OCR 서버 | 꺼져 있으면 온보딩이 직접 입력으로 자동 전환 |
| 외부 서버(pjrx.kr) | 꺼지면 OCR + 상권분석 + 유동인구 동시 불능 |
| 공고 갱신 cron | 연구실 서버가 꺼지면 조용히 멈춤 (`last-run.txt` 날짜 주기적 확인) |
| 카카오 알림 | Vercel이 아닌 연구실 서버 cron이 발송 (서버리스는 요청 없이 실행 불가) |
| 브랜치 | 원칙적으로 main 직접 푸시. 하루 이상 걸리는 작업만 브랜치 |
