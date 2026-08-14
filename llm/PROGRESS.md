# 화성 경영동행 AI — 진행 현황

새 세션 시작 시 이 파일부터 확인할 것 (CLAUDE.md 규칙).

---

## 프론트엔드

- [x] 6개 화면 구현 (Landing, Onboarding, Dashboard, TaxSchedule, SupportPrograms, District, ServiceMap)
- [x] 사이드바 + 챗봇 FAB (웹 레이아웃)
- [x] Gemini API 챗봇 연동 (`gemini-3.6-flash`, 멀티턴) → Groq RAG 챗봇으로 교체 완료
- [x] RAG 챗봇 프론트엔드 연결 (`generateChatbotResponseV1`, Groq + 키워드 RAG, followup 버튼 UI)
- [x] JupyterHub 프록시 환경 서빙 (HashRouter + python http.server 3002)

---

## LLM+RAG 벤치마크 트랙

### 기능1 — 조건 줄글 해석 (LLM 단독)
- [x] `src/utils/parseUserCondition.js` 구현
  - 모델: `gemini-3.6-flash`, temperature=0, JSON 강제 출력
- [x] F1-01~F1-06 테스트 통과 (6/6)
  - F1-01: 정상 입력
  - F1-02: missing_info_omission (asset_status)
  - F1-03: unmapped_category (프리랜서)
  - F1-04: condition_ambiguity
  - F1-05: deadline_or_closed_case
  - F1-06: missing_info_omission (business_registration) ← 신규 추가
- [x] `report/f1_test_result.md`, `report/f1_raw_output.json` 작성

### 기능2-a — 공고문 요약 (LLM 단독)
- [x] `src/utils/summarizeNotice.js` 구현 (baseline + v1)
  - baseline: zero-shot, 시스템 프롬프트 없음
  - v1: JSON 스키마 강제 + 시스템 프롬프트 + null 규칙 + terms glossary
- [x] F2A-01~F2A-05 테스트 (baseline 4/5, v1 5/5)
  - F2A-04 핵심 실패 확인: baseline은 만료 공고 판정 불가 → v1은 오늘 날짜 주입으로 해결
- [x] `report/f2a_test_result.md`, `report/f2a_raw_output.json` 작성

### 기능1 → 매칭엔진 연결 레이어
- [x] `src/utils/mapToUserProfile.js` 구현 (MAP-01~07 테스트 7/7 통과)
  - parseUserCondition() 출력 → matching.py user_profile 변환
  - business_type → category (카페/음식점/소매업/기타, ambiguous → null)
  - region → 화성시 부분일치 판정
  - career_experience 정규화 ("없음" / "있음")
  - asset_group: income_level·asset_status 통합 정규화
  - 매핑 불가 필드 warnings/unmapped/uncollected 반환

### 기능2-b — 신청동행/서류 체크리스트 (LLM+RAG)
- [x] `src/utils/generateChecklist.js` 구현 (baseline + v1)
  - buildDocumentRAG(): terms.json documents[] 조회 (서류명·alias 매칭)
  - v1: JSON 스키마 강제 + 시스템 프롬프트 + RAG 문서 발급정보 주입
  - pending_conditions: 확인필요 조건 → 사용자 재질문 생성
- [x] 픽스처 작성: f2b-01~03 (notice + matching output JSON)
- [x] F2B-01, F2B-02, F2B-03 모두 PASS (Groq llama-3.3-70b-versatile)
  - RAG 매칭 100% (15/15 서류 모두 매칭)
  - URL 포함: baseline 0개 → v1 4개 (RAG 효과 확인)
- [x] `report/f2b_raw_output.json` 작성

### 기능3 — 챗봇 (LLM+RAG)
- [x] `src/utils/generateChatbotResponse.js` 구현 (baseline + v1)
  - retrieveContext(): 키워드 기반 terms.json 검색 (terms[] + documents[])
  - v1: RAG 컨텍스트 주입 + JSON 강제 + confidence/followup 출력
  - 시스템 프롬프트: URL·caution·미검증 경고 포함 지시
- [x] 픽스처: `scripts/fixtures/f3/f3_questions.json` (F3-01~05)
- [x] F3 테스트 완료 (Groq): 4/5 PASS
  - F3-03 FAIL (의도적): llama-3.3-70b-versatile이 금리 "1.5%" 환각 생성 — 중요한 벤치마크 발견
  - F3-01~02, F3-04~05 PASS
- [x] 벤치마크 완료: `report/benchmark_chatbot.md`, `report/benchmark_chatbot_raw.json`
  - BM-01~05 5/5 완료: URL baseline 0 → v1 4케이스, 환각 억제 1케이스 확인

### 공용 LLM 레이어
- [x] `src/utils/llmProvider.js` 구현 (Gemini/Groq 공용 래퍼)
  - Groq: llama-3.3-70b-versatile, 14,400req/day 무료, temperature=0
  - generateChecklist/generateChatbotResponse 모두 `provider` 파라미터로 전환

---

## 최종 채택 스택

| 구성 요소 | 채택 | 근거 |
|---|---|---|
| LLM | Groq llama-3.3-70b-versatile | 무료 14,400req/day, 성능 동등 이상 |
| RAG 검색 | 키워드 substring | Hit@1 1.0 (임베딩 0.8), F3 환각 억제 우수 |
| 임베딩 (2차 예정) | BGE-M3 | 임베딩 중 Hit@3=1.0으로 최고 |

## 메모

- Groq llama-3.3-70b-versatile: 현재 모든 기능에 적용됨 (`src/utils/llmProvider.js`)
- 키워드 RAG vs BGE-M3 임베딩 실험 완료 → 키워드 채택 (F3 4/5 vs 3/5)
- F3-03 핵심 발견: 임베딩 RAG는 "소상공인 금리" 질문에 미소금융을 검색 → 금리 환각 발생. 키워드는 억제
- Qwen2.5-7B Ollama 결과: `report/ollama_results.json` 업로드 완료 → `report/llm_rag_analysis.md` 5절에 반영
- Gemma3-4B: 노트북 Ollama 실행 중 응답 없음 — 결과 없음 (Qwen만 완료)
- EEVE-Korean-10.8B: Ollama 레지스트리에 없어 평가 불가 (gemma3:4b로 대체 시도했으나 응답 없음)
- KURE-v1: HuggingFace 비공개로 평가 불가
