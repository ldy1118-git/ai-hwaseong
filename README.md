# 화성시 소상공인 지원사업 매칭 서비스

2026 화성시 AI 해커톤 출품작. 창업 준비자와 소상공인이 자기 조건에 맞는
지원사업을 찾고, **신청 완료까지** 안내받는 서비스.

차별점은 정보 나열이 아니라 신청 동행이다. 행정 용어를 쉽게 풀어주고,
필요 서류를 어디서 어떻게 발급받는지까지 알려준다.

---

## 폴더 구조

```
ai-hwaseong/
├── backend/             매칭 엔진 + API 서버 (담당: 성현·대윤)
│   ├── matching.py        조건 판정·점수화·HTTP 서버
│   ├── OCR.py             사업자등록증 OCR 및 필드 추출
│   ├── index.html         테스트용 화면 (버튼 문답식)
│   └── notices/           형식 참고용 샘플 19건
├── project/             React 화면 — Vercel 이 여기를 빌드한다 (담당: 서희)
│   ├── src/pages/         랜딩·로그인·온보딩·대시보드·공고상세·신청동행·챗봇
│   ├── src/utils/         api.js (서버 호출) · llm/ (LLM 호출)
│   └── design/            로고·캐릭터 이미지
├── api/                 Vercel 서버리스 함수 (담당: 대윤)
│   ├── match.py           매칭
│   ├── glossary.py        용어 사전
│   ├── llm.py             LLM 대리 호출 (API 키를 숨긴다)
│   ├── auth_kakao.py      카카오 로그인
│   └── onboarding.py      온보딩 저장
├── llm/                 LLM / RAG (담당: 서희)
│   ├── scripts/           모델 비교·평가 스크립트
│   └── report/            벤치마크 결과
├── policy_data/         공고 수집·요건 추출·용어 사전 (담당: 대윤)
│   ├── notices/           실제 공고 25건 ← 서버가 기본으로 읽는 곳
│   └── terms.json         행정용어 31개 + 서류 26종
├── scripts/
│   ├── run_server.sh      리눅스 서버 실행
│   └── test.bat           윈도우 실행
├── docs/
│   ├── meetings/          회의록 + 원본 녹취
│   └── 화성시_소상공인_서비스_기획안.docx
└── .venv/               가상환경 (git 제외)
```

개인정보(사업자등록증 이미지, 사용자 프로필)는 저장소에 두지 않는다.
실제 파일은 `../_private_hwaseong/users/` 에 있고 `.gitignore`로도 막아뒀다.
서버는 `backend/users/` 를 필요할 때 자동으로 다시 만든다.

---

## 실행

### 리눅스 (연구실 서버)

```bash
./scripts/run_server.sh          # http://127.0.0.1:8000/index.html
./scripts/run_server.sh 8123     # 포트 지정
```

`OMP_NUM_THREADS=4` 가 스크립트에 박혀 있다. **반드시 필요하다.**
이 서버는 코어가 80개라 제한하지 않으면 torch/OpenMP 스레드가 폭주해
easyocr 호출이 CPU 0%인 채로 멈춘다(SIGTERM도 안 먹는다).

### 윈도우

```
scripts\test.bat
```

easyocr가 없으면 자동으로 설치한 뒤 서버를 띄우고 브라우저를 연다.

### 최초 환경 구축

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision
.venv/bin/python -m pip install easyocr
```

OCR은 CPU로만 돌리므로(`gpu=False`) CPU 빌드 torch면 충분하다.
첫 실행 때 한국어 모델(약 95MB)이 `~/.EasyOCR/` 로 자동 다운로드된다.

---

## API

서버는 표준 라이브러리 `http.server` 기반이며 외부 의존성이 없다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/health` | 헬스체크 |
| POST | `/api/match` | 프로필로 공고 매칭, 점수순 정렬 |
| POST | `/api/user/load` | 기기별 프로필·채팅기록 조회 |
| POST | `/api/user/save` | 프로필·채팅기록 저장 |
| POST | `/api/business-registration` | 사업자등록증 업로드 → OCR → 프로필 자동 반영 |
| GET | `/api/terms` | 행정용어 사전 원본 (용어 31 + 서류 26) |
| POST | `/api/terms/lookup` | 공고문에 나온 용어만 + 서류 발급 방법 |

### 용어 사전은 복사하지 말 것

`terms.json` 을 프론트로 복사해 두면 사전을 고쳤을 때 복사본이 조용히
낡는다. `GET /api/terms` 로 받아 쓰면 원본 하나만 남는다.

`POST /api/terms/lookup` 은 공고문에 **실제로 등장한** 용어만 골라준다.
사전 전체를 LLM 프롬프트에 넣으면 토큰도 낭비고 엉뚱한 용어까지 끌어온다.

```js
const res = await fetch("http://127.0.0.1:8000/api/terms/lookup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: notice.summary,                              // 공고문
    documents: result.expected_documents.map(d => d.name),  // 매칭 결과의 서류명
  }),
})
const { terms, documents, glossary } = await res.json()
```

- `terms` — 등장한 용어. 쉬운 설명·주의사항이 붙어 있다
- `documents` — 서류별 발급처·비용·소요시간 (`issue` 필드)
- `glossary` — 위 내용을 LLM 프롬프트에 바로 넣을 수 있게 만든 문자열

### 배포 (Vercel)

`api/` 의 파이썬 서버리스 함수가 같은 도메인에서 API 를 서빙한다.
프론트는 `/api/match` 처럼 **상대경로**로 부르면 된다. 호스트를 박아두면
배포 주소가 바뀔 때마다 다시 빌드해야 한다.

| 경로 | 파일 | 비고 |
|---|---|---|
| `/api/health` | `api/health.py` | 배포 직후 여기부터 열어볼 것 |
| `/api/match` | `api/match.py` | 매칭. 외부 패키지 0개 |
| `/api/terms` | `api/glossary.py` | 사전 원본 |
| `/api/terms/lookup` | `api/glossary_lookup.py` | 공고에 나온 용어만 |
| `/api/llm` | `api/llm.py` | LLM 대리 호출 |

파일 이름이 `glossary` 인 이유는 `api/terms.py` 로 두면 `policy_data/terms.py`
를 가려서 `import terms` 가 자기 자신을 불러오기 때문이다. `vercel.json` 의
rewrites 가 경로를 이어준다.

**API 키는 프론트에 두지 않는다.** `VITE_` 로 시작하는 환경변수는 빌드
결과물에 그대로 박혀서, 배포하면 개발자도구를 여는 누구나 꺼낼 수 있다.
Vercel → Settings → Environment Variables 에 `GEMINI_API_KEY` 를 넣고
프론트는 `/api/llm` 을 부른다.

```js
const res = await fetch("/api/llm", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt, system, json: true }),
})
const { text } = await res.json()
```

**OCR 은 Vercel 에 안 올라간다.** torch 가 1.4GB 라 함수 용량 한도(250MB)를
넘는다. 사업자등록증 인식은 로컬 서버(`./scripts/run_server.sh`)로 시연한다.

배포된 함수는 매칭 이력을 남기지 않는다. 서버리스는 파일시스템이 읽기
전용이라 `backend/users/` 에 쓸 수 없다. 이력이 필요하면 로컬 서버를 쓸 것.

### 다른 포트에서 부를 때 (React 등)

CORS를 열어놨다. Vite(5173)에서 이 서버(8000)를 그대로 부르면 된다.
`Content-Type: application/json` 을 붙인 POST 는 브라우저가 OPTIONS 를
먼저 보내는데, 서버가 그것도 받는다.

```js
const res = await fetch("http://127.0.0.1:8000/api/match", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ device_id, user_profile }),
})
const { results } = await res.json()
```

`user_profile` 의 키 이름은 아래를 그대로 써야 한다. 다른 이름으로 보내면
**에러 없이 조용히 무시되고** 그 조건이 통째로 빠진다.

```
region  business_status  category  career_experience  asset_group
age  business_period_months  annual_revenue_krw  marital_status  living_with_parents
```

값 목록은 `policy_data/schema.md` 참고. 오타 하나면 아무도 매칭되지 않는다.

결과 1건에 실려오는 신청 안내 필드는 이렇다. 없을 수도 있으니 확인하고 쓸 것.

```
apply_url      실제 접수 사이트 (source_url 은 공고 페이지라 다르다)
apply_method   접수 방법
contact        문의처
organizer      소관기관    operator  수행기관
```

### 어느 공고를 읽는가

기본값은 `policy_data/notices/` — 기업마당에서 수집한 실제 공고다.
`backend/notices/` 는 형식 참고용 샘플이라 실제 공고가 아니다.
샘플로 돌려보려면 요청에 `notices_folder: "notices"` 를 넣으면 된다.

CLI로도 쓸 수 있다.

```bash
cd backend
python3 matching.py                 # 샘플 프로필로 추천 출력
python3 matching.py --interactive   # 조건 직접 입력
python3 matching.py --json          # 전체 결과 JSON
python3 OCR.py <이미지경로>          # OCR 단독 테스트
```

---

## 모듈 간 인터페이스

모듈은 **JSON 파일**로 주고받는다. 매칭 엔진의 출력이 LLM의 입력이 되므로,
출력 양식은 LLM 담당이 정의해서 매칭 담당에게 전달한다.

```
사용자 입력 ─┐
             ├─→ matching (점수화, 상위 3건) ─→ JSON ─→ llm (RAG) ─→ 화면
사업자등록증 ─┘                                  ↑
                                          policy_data (공고·요건·용어)
```

---

## 성능 참고

| 항목 | 소요 |
|---|---|
| 첫 OCR 요청 | 약 78초 (easyocr Reader 초기화 + 모델 로딩, 서버 프로세스당 1회) |
| 이후 OCR 요청 | 약 17초 (전역 Reader 캐시) |
| 공고 25건 매칭 | 1초 미만 |

---

## 알려진 이슈

- 업태 OCR에서 `종목`이 `종콩]`으로 오인식된다. 매칭에는 영향 없지만
  화면에 그대로 노출되므로 후처리가 필요하다.
- PDF 업로드는 미지원. 이미지 파일만 받는다.
- easyocr 미설치 시 크래시 없이 `ocr_status: not_configured` 를 반환한다.

---

## 일정

| 날짜 | 내용 |
|---|---|
| 8/15 (토) | 각자 담당 모듈 완료 |
| 8/16 (일) | 다음 전체 회의 |
| 8/18 (화) | 전체 통합 및 최종 마무리 |
| 8/19 (수) | 발표자료 제작 + 발표 연습 |
| 8/20 (목) | 1차 예선 발표 |

제출물: 시연 영상 / 웹 주소 / Git 주소

자세한 배경과 결정 사항은 `docs/meetings/20260809_회의록.txt` 참고.
