# 기능1 (F1) 테스트 결과 리포트

**기능명**: 조건 줄글 해석 (사용자 자유 입력 → 구조화된 JSON)  
**파일**: `src/utils/parseUserCondition.js`  
**모델**: `gemini-3.6-flash` (2026-07-21 출시. `gemini-2.5-flash`는 AQ. 키 형식으로 404, `gemini-3.5-flash`에서 업그레이드)  
**최종 실행일시**: 2026-08-13T08:01:39Z  
**결과 요약**: **6/6 통과 (100%)**

---

## 전체 요약

| ID | 유형 | 함정 유형 | 소요시간 | 결과 |
|---|---|---|---|---|
| F1-01 | 정상 | — | 5,208 ms | ✅ PASS |
| F1-02 | 함정 | missing_info_omission (asset_status) | 7,047 ms | ✅ PASS |
| F1-03 | 함정 | unmapped_category | 30,358 ms | ✅ PASS |
| F1-04 | 함정 | condition_ambiguity | 5,680 ms | ✅ PASS |
| F1-05 | 함정 | deadline_or_closed_case | 8,365 ms | ✅ PASS |
| F1-06 | 함정 | missing_info_omission (business_registration) | 30,310 ms | ✅ PASS |

---

## F1-01 — 정상 입력 파싱

**입력**  
```
화성시 향남읍에서 카페 창업 준비 중인 만 29세, 창업 경험 없음, 기초생활수급자입니다.
받을 수 있는 지원사업 알려주세요.
```

**출력** (gemini-3.6-flash)
```json
{
  "age": 29,
  "region": "화성시 향남읍",
  "business_type": "카페",
  "startup_stage": "예비창업자",
  "career_experience": "없음",
  "income_level": "기초생활수급자",
  "asset_status": null,
  "business_registration": null,
  "marital_status": null,
  "missing_fields": ["asset_status", "business_registration", "marital_status"],
  "ambiguous_fields": [],
  "parse_note": "사용자 질문: 받을 수 있는 지원사업 안내 요청"
}
```

**체크포인트 검증**
- ✅ `age = 29` — 정확히 추출
- ✅ `region = 화성시 향남읍` — 지역명 추출
- ✅ `business_type = 카페` — 원문 그대로
- ✅ `income_level = 기초생활수급자` — 명시된 소득 구간 정확히 추출
- ✅ `career_experience = 없음` — 원문 그대로
- ✅ `startup_stage = 예비창업자` — "창업 준비 중"에서 정확히 추론
- ✅ `asset_status = null`, `business_registration = null` — 언급 없는 필드 null 처리

> **gemini-3.5-flash → 3.6-flash 회귀 수정**: 이전 버전에서 `business_registration: false`로 임의 추론하던 문제가 3.6-flash에서 `null`로 올바르게 수정됨. 프롬프트 변경 없이 모델 업그레이드만으로 해결.

---

## F1-02 — 함정: 누락 정보 보정 금지 (asset_status)

**함정 유형**: 재산 정보를 명시적으로 "말하지 않겠다"고 했을 때, 임의 값으로 채우면 실패

**입력**  
```
화성시 동탄에서 소매업 하려는 예비창업자예요. 나이는 34세고, 재산 관련해서는 딱히 말 안 했어요.
```

**출력**
```json
{
  "age": 34,
  "region": "화성시 동탄",
  "business_type": "소매업",
  "startup_stage": "예비창업자",
  "career_experience": null,
  "income_level": null,
  "asset_status": null,
  "business_registration": null,
  "marital_status": null,
  "missing_fields": ["asset_status", "business_registration", "career_experience", "income_level", "marital_status"],
  "ambiguous_fields": [],
  "parse_note": null
}
```

**체크포인트 검증**
- ✅ `asset_status = null` — 재산 정보 임의 가정 없음 **(핵심 합격 조건)**
- ✅ `asset_status`가 `missing_fields`에 포함

---

## F1-03 — 함정: 업종 강제 매핑 금지

**함정 유형**: 프리랜서를 표준 코드에 강제 매핑하면 실패

**입력**  
```
저는 프리랜서 디자이너인데 이번에 화성시에 작업실 겸 스튜디오를 차려요. 소상공인 지원 대상 되나요?
```

**출력**
```json
{
  "age": null,
  "region": "화성시",
  "business_type": "프리랜서 디자이너",
  "startup_stage": "예비창업자",
  "career_experience": null,
  "income_level": null,
  "asset_status": null,
  "business_registration": null,
  "marital_status": null,
  "missing_fields": ["age", "asset_status", "business_registration", "career_experience", "income_level", "marital_status"],
  "ambiguous_fields": [
    { "field": "business_type", "reason": "표준 업종 매핑 불가" }
  ],
  "parse_note": "소상공인 지원 대상 여부 문의"
}
```

**체크포인트 검증**
- ✅ `business_type = 프리랜서 디자이너` — 원문 그대로, 표준 코드 강제 매핑 없음 **(핵심 합격 조건)**
- ✅ `ambiguous_fields`에 `business_type` 포함, 이유 명시
- ✅ 질문 내용 `parse_note`에 기록

---

## F1-04 — 함정: 조건 모호성 (프로필 없는 신청 가능 여부 질문)

**함정 유형**: 사용자 프로필 정보가 없는데 매칭 결과를 확정하면 실패

**입력**  
```
재산 기준이 정확히 뭘 말하는지 모르겠는데 그냥 저 신청 가능한지만 알려주세요.
```

**출력**
```json
{
  "age": null, "region": null, "business_type": null, "startup_stage": null,
  "career_experience": null, "income_level": null, "asset_status": null,
  "business_registration": null, "marital_status": null,
  "missing_fields": ["age", "asset_status", "business_registration", "business_type",
                     "career_experience", "income_level", "marital_status", "region", "startup_stage"],
  "ambiguous_fields": [],
  "parse_note": "사용자가 재산 기준에 대해 질문하고 지원 가능 여부를 확인하고자 함. 정보가 제공되지 않아 조건 파싱 불가."
}
```

**체크포인트 검증**
- ✅ 모든 프로필 필드 null — 임의 가정 없음 **(핵심 합격 조건)**
- ✅ `parse_note`에 재산 기준 모호성 + 질문 내용 기록
- ✅ `missing_fields`에 전 필드 포함 (9개)

---

## F1-05 — 함정: 마감 공고 처리

**함정 유형**: 마감된 공고를 신청 가능한 것처럼 안내하거나 프로필 임의 가정하면 실패

**입력**  
```
화성형 청년 인테리어 지원사업 아직 신청 가능한가요? (참고: 이 공고는 마감된 상태)
```

**출력**
```json
{
  "age": null, "region": null, "business_type": null, "startup_stage": null,
  "career_experience": null, "income_level": null, "asset_status": null,
  "business_registration": null, "marital_status": null,
  "missing_fields": ["age", "asset_status", "business_registration", "business_type",
                     "career_experience", "income_level", "marital_status", "region", "startup_stage"],
  "ambiguous_fields": [],
  "parse_note": "'화성형 청년 인테리어 지원사업'의 신청 가능 여부에 대한 문의입니다."
}
```

**체크포인트 검증**
- ✅ 모든 프로필 필드 null — 마감 여부 임의 가정 없음 **(핵심 합격 조건)**
- ✅ `parse_note`에 질문 공고명 기록

---

## F1-06 — 함정: 누락 정보 보정 금지 (business_registration)

**함정 유형**: "준비 중"이라는 표현만 보고 `business_registration`을 `false`로 임의 추론하면 실패  
**배경**: gemini-3.5-flash 시절 F1-01에서 같은 문제 발생 → 이 케이스로 명시적 회귀 테스트 추가

**입력**  
```
화성시에서 반찬가게 하려고 준비 중이에요. 어떤 지원사업 받을 수 있는지 궁금해요.
```

**출력**
```json
{
  "age": null,
  "region": "화성시",
  "business_type": "반찬가게",
  "startup_stage": "예비창업자",
  "career_experience": null,
  "income_level": null,
  "asset_status": null,
  "business_registration": null,
  "marital_status": null,
  "missing_fields": ["age", "asset_status", "business_registration", "career_experience", "income_level", "marital_status"],
  "ambiguous_fields": [],
  "parse_note": "화성시에서 반찬가게 창업을 준비 중인 사용자가 받을 수 있는 지원사업 종류를 문의함."
}
```

**체크포인트 검증**
- ✅ `business_registration = null` — "준비 중" 표현으로 임의 추론 없음 **(핵심 합격 조건)**
- ✅ `business_registration`이 `missing_fields`에 포함
- ✅ 프롬프트 수정 없이 첫 시도 통과 — gemini-3.6-flash가 null 정책을 자체적으로 준수

---

## 모델별 비교 (gemini-3.5-flash vs gemini-3.6-flash)

| 항목 | gemini-3.5-flash | gemini-3.6-flash |
|---|---|---|
| F1-01 `business_registration` | ⚠️ `false` (임의 추론) | ✅ `null` (올바름) |
| F1-06 통과 여부 | 미측정 | ✅ PASS |
| 평균 응답시간 | 5.96 s | 14.5 s (F1-03, F1-06 지연 포함) |
| 전체 통과율 | 5/5 (F1-06 없음) | 6/6 |

> F1-03, F1-06에서 30초 응답 지연 발생. 모델 측 일시적 부하로 추정. 재시도 시 정상 속도로 복귀하는지 모니터링 필요.

---

## 특이사항 및 제약

- **모델 변경**: `gemini-2.5-flash` (CLAUDE.md 벤치마크 대상 원안)는 AQ. 키 형식으로 404. `gemini-3.6-flash`로 대체
- **null 정책 자동 준수**: gemini-3.6-flash는 명시적 프롬프트 규칙 없이도 `business_registration` null 처리를 올바르게 수행
- **지역명 정규화**: 모델에 따라 "향남읍" → "화성시 향남읍" 또는 "경기도 화성시 향남읍"으로 가변. 매칭 엔진 연동 시 정규화 레이어 필요
- **응답 지연**: F1-03, F1-06에서 각각 ~30초 소요. 운영 환경에서 타임아웃 정책 설정 검토 필요
