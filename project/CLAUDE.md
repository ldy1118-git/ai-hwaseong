# 화성 경영동행 AI — 프로젝트 메모리

## 프로젝트 개요
화성시 소상공인 대상 AI 경영동행 서비스. 세무일정·지원사업 안내 + 챗봇.
현재 1차: 프론트엔드 완성(목업 데이터) + LLM/RAG 벤치마크 진행 중.
2차 예정: 백엔드(FastAPI+PostgreSQL), 실제 API 연동, RAG(Chroma+BGE-M3) 고도화.

## 디렉토리 구조
```
/home/jovyan/work/project/
├── src/
│   ├── App.jsx, main.jsx          # 라우터(HashRouter), 엔트리포인트
│   ├── components/Sidebar.jsx, Chatbot.jsx, BottomNav.jsx
│   ├── pages/Landing, Onboarding, Dashboard, TaxSchedule,
│   │         SupportPrograms, District, ServiceMap
│   └── data/mockData.js           # 모든 데이터 현재 하드코딩
├── dist/                          # 빌드 결과물 (정적 서빙 대상)
├── .env                           # VITE_GEMINI_API_KEY (git 제외, 절대 커밋 금지)
└── vite.config.js                 # allowedHosts: true, base: './'
```

## ⚠️ 반드시 지킬 것 (실수 반복 방지)

- **`npm run dev` 쓰지 말 것.** JupyterHub 프록시와 충돌해서 안 됨. 코드 수정 후엔 반드시:
  ```
  npm run build
  fuser -k 3002/tcp
  python3 -m http.server 3002 --directory dist &
  ```
- 라우터는 **HashRouter 유지** (일반 BrowserRouter로 바꾸면 프록시 환경에서 깨짐)
- `.env`의 API 키는 빌드 시 번들에 그대로 포함됨 — 민감정보 넣지 말 것
- **Gemini 모델명은 별칭(`gemini-flash-latest`) 대신 정확한 버전명을 고정해서 쓸 것.** 별칭은 시점에 따라 실제 가리키는 모델이 바뀌어서, 벤치마크 결과 추적이 안 됨.
  - 현재 실사용 버전: `gemini-3.6-flash` (2026-07-21 출시. `gemini-2.5-flash`는 이 API 키 형식으로 404)

## LLM+RAG 벤치마크 (별도 트랙, 위 프론트와는 독립적으로 진행)

- 비교 대상 LLM 4종: Gemini 2.5 Flash, Gemini 2.5 Flash-Lite, EEVE-Korean-10.8B(로컬), Qwen2.5 7B(로컬)
- 비교 대상 임베딩 4종: BGE-M3, KURE-v1, KoSimCSE-RoBERTa, KR-SBERT
- 기능 구분 (반드시 구분해서 다룰 것):
  - 기능1 조건 줄글 해석 — LLM 단독
  - 기능2-a 공고문 요약 — LLM 단독
  - 기능2-b 신청동행/서류체크리스트 — LLM+RAG, 매칭엔진 출력이 RAG 입력에 포함
  - 기능3 챗봇 — LLM+RAG
- 모든 LLM 호출: temperature=0, JSON 강제 출력, run_manifest.json에 실행 로그 기록
- golden_answer는 후보 답변 생성 프롬프트에 절대 섞지 않기
- 참고 문서: `@docs/테스트케이스_설계_가이드.md`, `@docs/매칭엔진_출력스키마_제안서.md`

## 작업 방식
- 한 세션에 한 기능만 진행. 끝나면 테스트로 검증 → 결과 보고 → 여기서 멈춤 (다음 기능으로 임의 진행 금지)
- 진행 상황은 `PROGRESS.md` 체크박스로 추적, 새 세션 시작 시 이 파일부터 확인
