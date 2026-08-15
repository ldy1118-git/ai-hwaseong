# 공고 JSON 규격

수집한 공고를 이 형식으로 저장하면 `matching.py`가 그대로 읽는다.

**이 문서는 추측이 아니라 `matching.py`의 `normalize_policy()` 코드에서 뽑았다.**
여기 없는 키를 쓰면 **에러 없이 조용히 무시된다.** 조건이 빠진 채로 매칭이 돌아가서
알아채기 어렵다. 반드시 `validate.py`로 확인할 것.

파일 위치: `policy_data/notices/<notice_id>_<짧은설명>.json`
인코딩: UTF-8 (BOM 있어도 됨)

---

## 전체 구조

```json
{
  "notice_id": "PBLN_000000000120801",
  "policy_id": "HS_CLEAN_CARE_2026",
  "title": "[경기] 화성시 2026년 소상공인 클린케어 지원사업",
  "source_url": "https://www.bizinfo.go.kr/...",
  "summary": "전문장비와 전문인력이 필요한 부분정비사업의 외부 환경 정비...",
  "apply_period": { "start": "2026-04-06", "end": "2026-05-01" },
  "eligibility": { },
  "documents": [ ]
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `notice_id` | **필수** | 없으면 매칭 엔진이 죽는다. 출처의 공고 ID를 그대로 쓰면 된다 |
| `policy_id` | 선택 | 정책 유형 식별자. 같은 사업의 연도별 공고를 묶을 때 유용 |
| `title` | 선택 | 화면에 그대로 노출된다 |
| `source_url` | 선택 | **되도록 넣을 것.** RAG가 원문을 검증할 때 쓴다 |
| `summary` | 선택 | 공고 요약. LLM 입력으로 들어간다 |
| `apply_period` | 선택 | `start` / `end` 를 `YYYY-MM-DD` 로. 둘 중 하나만 있어도 된다 |
| `eligibility` | 선택 | 아래 표의 키만 인식된다 |
| `documents` | 선택 | 제출 서류 목록 |
| `apply_url` | 선택 | **실제 접수하는 사이트.** `source_url`(공고 페이지)과 다르다 |
| `apply_method` | 선택 | 온라인/방문/이메일 등 접수 방법 |
| `contact` | 선택 | 문의처. 담당부서·전화·이메일 |
| `organizer` | 선택 | 소관기관 (사업을 만든 곳) |
| `operator` | 선택 | 수행기관 (실제 접수·문의를 받는 곳) |

### 신청 안내 5개 필드는 아직 화면까지 안 간다

`matching.py` 의 `match_policy()` 는 결과에 실을 키를 **정해진 목록에서만**
가져온다. 지금 통과하는 건 `notice_id`, `policy_id`, `title`, `source_url`,
`apply_period` 뿐이다. 파일에 적어둬도 조용히 사라진다.

```python
# matching.py 472줄 근처
result = {"notice_id": policy["notice_id"]}
if policy.get("title"):      result["notice_title"] = policy["title"]
if policy.get("source_url"): result["source_url"] = policy["source_url"]
# apply_url, apply_method, contact 는 여기에 없다
```

**성현에게 요청할 것:** 위 5개를 `result` 에 그대로 실어주기 (3~5줄).
"신청까지 동행"이 서비스 컨셉인데 정작 신청 주소가 화면에 안 간다.

`validate.py` 가 이걸 매번 경고로 알려준다.

`apply_period`가 없으면 "기간미상"으로 처리된다. 기간이 지났으면 "지원기간종료"로
표시되지만 매칭 자체는 계속 된다 (지난 공고도 참고용으로 보여주기 위함).

---

## eligibility — 인식되는 키 12개

**이 12개가 전부다.** 다른 이름으로 쓰면 무시된다.

| 키 | 타입 | 판정 방식 | 예시 |
|---|---|---|---|
| `min_age` | 숫자 | 만 나이 하한 | `19` |
| `max_age` | 숫자 | 만 나이 상한 | `39` |
| `regions` | 배열 | 사용자 주소에 이 문자열이 포함되는지 (공백 제거 후 부분일치) | `["화성시", "화성특례시"]` |
| `business_status` | 배열 | 완전일치 | `["예비창업자"]` / `["운영중"]` |
| `categories` | 배열 | 완전일치 | `["카페", "음식점", "소매업", "기타"]` |
| `career_experience` | 배열 | 완전일치 | `["없음"]` |
| `asset_groups` | 배열 | 완전일치 | `["기초생활수급자", "차상위", "일반"]` |
| `min_business_months` | 숫자 | 사업 운영 개월수 하한 | `12` |
| `max_business_months` | 숫자 | 사업 운영 개월수 상한 | `36` |
| `min_annual_revenue_krw` | 숫자 | 연 매출 하한 (원 단위) | `0` |
| `max_annual_revenue_krw` | 숫자 | 연 매출 상한 (원 단위) | `1200000000` |
| `marital_status` | 배열 | 완전일치 | `["미혼"]` / `["기혼"]` |
| `living_with_parents` | true/false | 완전일치 | `true` |

### 값을 마음대로 쓰면 안 되는 키

완전일치라서 **오타 하나면 아무도 매칭이 안 된다.** 아래 값만 쓸 것.

```
business_status      예비창업자 | 운영중
categories           카페 | 음식점 | 소매업 | 기타
career_experience    있음 | 없음
asset_groups         기초생활수급자 | 차상위 | 일반
marital_status       미혼 | 기혼
```

이 목록은 `matching.py`의 `input_user_profile()` 선택지에서 나왔다.
새 값이 필요하면 성현에게 말해서 양쪽을 같이 바꿔야 한다.

### 조건이 애매할 때

공고에 "만 39세 이하 청년"이라고만 쓰여 있으면 `max_age: 39` 하나만 넣는다.
**모르는 조건은 아예 넣지 않는다.** 넣으면 `불충족`으로 판정돼 대상에서 빠진다.
빼면 `확인필요`로 남아서 나중에 사용자에게 되물을 수 있다.

> 없는 게 틀린 것보다 낫다.

---

## documents — 제출 서류

```json
"documents": [
  { "name": "사업자등록증", "type": "common",      "confidence": "confirmed" },
  { "name": "매출 증빙자료", "type": "conditional", "confidence": "estimated",
    "reason": "2025년 매출액 12억원 이하 조건 확인 필요" }
]
```

| 필드 | 값 | 설명 |
|---|---|---|
| `name` | **필수** | 서류명 |
| `type` | `common` / `conditional` / `if_applicable` | 각각 공통필수 / 조건부필수 / 해당시제출로 변환된다. 생략하면 해당시제출 |
| `confidence` | `confirmed` / `estimated` | 생략하면 `estimated` |
| `reason` | 문자열 | `conditional`이면 어떤 조건 때문인지 |

`confirmed`는 **공고 원문에 그 서류가 명시돼 있을 때만** 쓴다.
"아마 필요할 것 같다"는 전부 `estimated`다. 이 구분이 있어야 RAG가
`estimated`인 것만 원문을 다시 검증하고 `confirmed`는 건너뛴다.
전부 `confirmed`로 적으면 이 최적화가 통째로 무너진다.

---

## 검증

수집한 파일은 반드시 돌려볼 것.

```bash
python3 policy_data/validate.py                      # policy_data/notices/ 전체
python3 policy_data/validate.py 파일.json             # 특정 파일
python3 policy_data/validate.py --dir backend/notices  # 다른 폴더
```

형식 검사만 하는 게 아니라 **실제 매칭 엔진에 넣어서 조건이 살아있는지 확인**한다.
오타로 무시된 키가 있으면 잡아준다.

---

## 참고

- 실제 예시: `backend/notices/bizinfo_PBLN_000000000120801_clean_care.json`
- 성현이 만든 샘플 19건: `backend/notices/` — 형식 참고용이지 실제 공고가 아니다
- 매칭 엔진 출력 스키마는 노션 「매칭알고리즘」 페이지 참고
