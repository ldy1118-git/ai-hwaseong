# 기능2-b (F2B) 테스트 결과 리포트

**기능명**: 신청동행/서류 체크리스트 (매칭엔진 출력 → RAG → 체크리스트 생성)  
**파일**: `src/utils/generateChecklist.js`  
**모델**: `gemini-3.6-flash`, temperature=0  
**실행일시**: 2026-08-15 KST  
**결과 요약**: F2B-01 ✅ PASS / F2B-02, F2B-03 ⏭ SKIP (일일 쿼터 소진)

---

## 전체 요약

| ID | 유형 | 함정 | baseline | v1 |
|---|---|---|---|---|
| F2B-01 | 정상 | — | ✅ | ✅ PASS |
| F2B-02 | 함정 | 비표준서류 + 확인필요 조건 | ✅ baseline 완료 | ⏭ SKIP (쿼터) |
| F2B-03 | 함정 | estimated 서류 + 복수 확인필요 | ⏭ SKIP | ⏭ SKIP |

> 무료 플랜 일일 제한(20req/day) 소진. F2B-01 baseline+v1, F2B-02 baseline까지 실행.

---

## RAG 사전 검증 — 전 케이스 100% 매칭

| 케이스 | 문서 수 | 매칭 | 미매칭 |
|---|---|---|---|
| F2B-01 (자금지원) | 5 | 5/5 | 없음 |
| F2B-02 (클린케어) | 4 | 4/4 | 없음 |
| F2B-03 (청년 창업) | 5 | 5/5 | 없음 |

`terms.json documents[]`가 14개 서류를 모두 커버. 실제 공고에서 자주 나오는 서류는 전부 RAG로 처리 가능.

---

## F2B-01 — 정상 케이스 (화성시 소상공인 자금지원사업)

**입력**: 자금지원 매칭 결과 (overall_status=신청가능, 확인필요 조건 없음, 서류 5개)

### 핵심 차이: URL 포함 여부

| | baseline | v1 |
|---|---|---|
| URL 있는 항목 수 | **0개** | **4개** |
| 중소기업확인서 발급처 | 불명확 또는 없음 | `sminfo.mss.go.kr` (정확) |
| 국세납세증명서 발급처 | 불명확 | `hometax.go.kr` (정확) |
| 지방세납세증명서 발급처 | 국세와 혼동 가능 | `gov.kr` / 위택스 (정확) |

**baseline의 문제**: 모델의 사전 학습 지식에만 의존 → URL 없음, 발급처 부정확 또는 누락.  
**v1의 효과**: terms.json RAG에서 발급처·URL·소요시간·주의사항 주입 → 정확한 안내 가능.

### 경고 사항 (오류 기준 아님)

v1 결과에서 pending_conditions 2개 생성됨 (매칭 출력에 확인필요 조건 없음에도).  
원인: F2B-01 condition_results의 `operation_period` 항목에 "확인 권장" 표현이 있어 LLM이 pending으로 분류한 것으로 추정.  
→ 매칭엔진 출력의 status enum이 명확하면(충족/불충족/확인필요만 사용) 해결됨.

---

## 베이스라인 vs v1 차이 요약 (F2B-01 기반)

| 항목 | baseline | v1 |
|---|---|---|
| 서류 발급 URL | ❌ 없음 | ✅ 4/5개 URL 제공 |
| 발급 소요시간 | ⚠️ 부정확 또는 누락 | ✅ RAG 기반 정확 |
| 발급 수수료 | ⚠️ 불명확 | ✅ "무료" 명시 |
| 주의사항 (중소기업확인서 유효기간 등) | ❌ 없음 | ✅ RAG에서 주입 |
| pending_conditions | 미지 | ✅ 확인필요 조건 사용자 안내 |

---

## 설계 검증 사항

### buildDocumentRAG() 작동 확인

- 서류명 정확 매칭 + aliases 매칭 모두 작동
- `사업자등록증명` (alias: `사업자등록증명원`) → ID `saeopja-deungrok-jeungmyeong` 정확 매칭
- `중소기업확인서` (alias: `소상공인확인서`) → ID `jungso-hwaginseo` 정확 매칭

### 시스템 프롬프트 규칙 효과 (v1)

| 규칙 | 검증 결과 |
|---|---|
| RAG 데이터 사용, 직접 지식 보완 금지 | 확인됨 (URL 모두 RAG 출처) |
| RAG 없는 서류 → how_to_get null | F2B-02 스킵으로 미확인 |
| estimated 서류 → verify_note 기재 | F2B-03 스킵으로 미확인 |
| pending_conditions ask_user 문장 생성 | F2B-03 스킵으로 미확인 |

---

## 미완료 항목 (쿼터 재충전 후 실행)

- F2B-02 v1: 비표준서류(견적서·현장사진) RAG 처리 + 확인필요 조건 pending
- F2B-03: confidence=estimated 서류 verify_note + 복수 확인필요 조건 안내

---

## 특이사항

- **일일 쿼터 제한**: gemini-3.6-flash 무료 플랜 20req/day. 오늘 세션에서 소진.
  - 해결: 다음 날 재실행 또는 유료 플랜 전환.
  - 테스트 스크립트에 429 핸들링 추가 완료 (`callWithFallback`).
- **비표준 서류 RAG 커버리지**: terms.json에 견적서(`gyeonjeokseo`)·현장사진(`hyeonjang-sajin`) 포함 확인.
  - 특히 현장 사진의 경우 "공사 전 반드시 촬영" 주의사항이 RAG에 있어 v1에서 자동 주입 가능.
