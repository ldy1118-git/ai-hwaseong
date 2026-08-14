#!/usr/bin/env python3
"""수집한 공고 JSON이 매칭 엔진에서 실제로 동작하는지 검사한다.

형식만 보는 게 아니라 matching.py 에 그대로 넣어본다. 규격에 없는 키를 쓰면
엔진이 에러 없이 무시하기 때문에, 눈으로 봐서는 조건이 빠진 걸 알 수 없다.

    python3 policy_data/validate.py                        policy_data/notices/ 전체
    python3 policy_data/validate.py 파일.json               특정 파일
    python3 policy_data/validate.py --dir matching/notices  다른 폴더

규격은 policy_data/schema.md 참고.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "matching"))

try:
    from matching import normalize_policy, match_policy
except ImportError as error:  # pragma: no cover
    print(f"matching.py 를 불러오지 못했습니다: {error}", file=sys.stderr)
    print(f"  기대한 위치: {ROOT / 'matching' / 'matching.py'}", file=sys.stderr)
    raise SystemExit(1)


# normalize_policy() 가 실제로 읽는 키. 여기 없으면 무시된다.
ELIGIBILITY_KEYS = {
    "min_age", "max_age", "regions", "business_status", "categories",
    "career_experience", "asset_groups", "min_business_months",
    "max_business_months", "min_annual_revenue_krw", "max_annual_revenue_krw",
    "marital_status", "living_with_parents",
}

# 완전일치로 판정되는 값들. 오타 하나면 아무도 매칭되지 않는다.
ENUM_VALUES = {
    "business_status": {"예비창업자", "운영중"},
    "categories": {"카페", "음식점", "소매업", "기타"},
    "career_experience": {"있음", "없음"},
    "asset_groups": {"기초생활수급자", "차상위", "일반"},
    "marital_status": {"미혼", "기혼"},
}

TOP_LEVEL_KEYS = {
    "notice_id", "policy_id", "title", "source_url", "summary",
    "apply_period", "eligibility", "documents", "expected_documents",
    "conditions", "_source_file",
    # 신청 안내용. 매칭 판정에는 안 쓰이지만 화면에 필요하다.
    "apply_url", "apply_method", "contact", "organizer", "operator",
}

# matching.py 의 match_policy() 가 결과에 실어주는 키. 여기 없으면 화면까지
# 전달되지 않는다 — 파일에 적어둬도 조용히 사라진다.
PASSED_THROUGH = {
    "notice_id", "policy_id", "title", "source_url", "apply_period",
}

DOC_TYPES = {"common", "required", "conditional", "if_applicable"}
CONFIDENCES = {"confirmed", "estimated"}

# 조건이 실제로 걸리는지 보기 위한 더미 프로필. 값은 전부 비워둔다.
PROBE_PROFILE: dict = {}


def check(path: Path) -> tuple[list[str], list[str]]:
    """(치명적 오류, 경고) 를 돌려준다."""
    errors: list[str] = []
    warns: list[str] = []

    try:
        policy = json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as error:
        return [f"JSON 파싱 실패: {error}"], []

    if not isinstance(policy, dict):
        return ["최상위가 객체가 아닙니다"], []

    if "notice_id" not in policy:
        errors.append("notice_id 없음 — 매칭 엔진이 죽습니다")

    for key in policy:
        if key not in TOP_LEVEL_KEYS:
            warns.append(f"모르는 최상위 키 '{key}' — 무시됩니다")

    for field in ("source_url", "summary"):
        if not policy.get(field):
            warns.append(f"{field} 없음 — RAG가 원문을 검증할 때 필요합니다")

    if not policy.get("apply_url") and not policy.get("apply_method"):
        warns.append("신청 방법이 없음 — 신청 안내 화면에서 보여줄 게 없습니다")

    # 적어뒀지만 매칭 엔진이 화면으로 넘겨주지 않는 키를 알려준다.
    dropped = [k for k in policy
               if k in TOP_LEVEL_KEYS and k not in PASSED_THROUGH
               and k not in ("eligibility", "documents", "expected_documents",
                             "conditions", "summary", "_source_file")]
    if dropped:
        warns.append(
            f"{', '.join(dropped)} 는 matching.py 가 결과에 안 실어줍니다 "
            f"— 성현에게 통과 요청 필요"
        )

    period = policy.get("apply_period")
    if not period:
        warns.append("apply_period 없음 — '기간미상'으로 처리됩니다")
    elif isinstance(period, dict):
        for bound in ("start", "end"):
            value = period.get(bound)
            if value and not _is_iso_date(value):
                errors.append(f"apply_period.{bound} 형식 오류: {value!r} (YYYY-MM-DD 여야 함)")

    eligibility = policy.get("eligibility") or {}
    if not eligibility:
        warns.append("eligibility 비어있음 — 모든 사용자가 '신청가능'으로 뜹니다")
    for key, value in eligibility.items():
        if key not in ELIGIBILITY_KEYS:
            errors.append(f"eligibility.{key} 는 인식되지 않는 키입니다 — 조건이 조용히 무시됩니다")
            continue
        allowed = ENUM_VALUES.get(key)
        if allowed:
            for item in value if isinstance(value, list) else [value]:
                if item not in allowed:
                    errors.append(
                        f"eligibility.{key} 의 값 {item!r} 은 허용되지 않습니다 "
                        f"(가능: {', '.join(sorted(allowed))})"
                    )

    documents = policy.get("documents") or policy.get("expected_documents") or []
    if not documents:
        warns.append("documents 없음 — 신청 안내 단계에서 보여줄 서류가 없습니다")
    for index, doc in enumerate(documents):
        label = f"documents[{index}]"
        if not isinstance(doc, dict) or "name" not in doc:
            errors.append(f"{label} 에 name 이 없습니다")
            continue
        doc_type = doc.get("type") or doc.get("required_type")
        if doc_type is None:
            warns.append(f"{label} ({doc['name']}) type 없음 — '해당시제출'로 처리됩니다")
        elif doc_type not in DOC_TYPES and doc_type not in {"공통필수", "조건부필수", "해당시제출"}:
            errors.append(f"{label} type 값 오류: {doc_type!r} (가능: {', '.join(sorted(DOC_TYPES))})")
        confidence = doc.get("confidence")
        if confidence is None:
            warns.append(f"{label} ({doc['name']}) confidence 없음 — 'estimated'로 처리됩니다")
        elif confidence not in CONFIDENCES:
            errors.append(f"{label} confidence 값 오류: {confidence!r}")
        if doc_type in {"conditional", "조건부필수"} and not (doc.get("reason") or doc.get("trigger_reason")):
            warns.append(f"{label} ({doc['name']}) 조건부인데 reason 이 없습니다")

    # 실제로 엔진에 넣어본다. 조건이 몇 개나 살아남는지가 핵심.
    if not errors:
        try:
            normalized = normalize_policy(json.loads(json.dumps(policy)))
            conditions = normalized.get("conditions", {})
            if eligibility and not conditions:
                errors.append("eligibility 를 적었는데 판정 조건이 하나도 만들어지지 않았습니다")
            match_policy(json.loads(json.dumps(policy)), PROBE_PROFILE)
        except Exception as error:
            errors.append(f"매칭 엔진 실행 중 예외: {type(error).__name__}: {error}")

    return errors, warns


def _is_iso_date(value: object) -> bool:
    if not isinstance(value, str) or len(value) != 10:
        return False
    parts = value.split("-")
    return len(parts) == 3 and all(p.isdigit() for p in parts)


def condition_count(path: Path) -> int:
    try:
        policy = json.loads(path.read_text(encoding="utf-8-sig"))
        return len(normalize_policy(policy).get("conditions", {}))
    except Exception:
        return 0


def main() -> int:
    args = sys.argv[1:]
    if "--dir" in args:
        target = ROOT / args[args.index("--dir") + 1]
        paths = sorted(target.glob("*.json"))
    elif args:
        paths = [Path(a) for a in args]
    else:
        target = ROOT / "policy_data" / "notices"
        if not target.exists():
            print(f"폴더가 없습니다: {target}")
            print("수집한 공고를 여기에 넣고 다시 실행하세요.")
            return 0
        paths = sorted(target.glob("*.json"))

    if not paths:
        print("검사할 JSON 파일이 없습니다.")
        return 0

    total_errors = 0
    total_warns = 0

    for path in paths:
        errors, warns = check(path)
        total_errors += len(errors)
        total_warns += len(warns)

        if errors:
            mark = "실패"
        elif warns:
            mark = "경고"
        else:
            mark = " OK "

        print(f"[{mark}] {path.name}  (판정 조건 {condition_count(path)}개)")
        for message in errors:
            print(f"        ✗ {message}")
        for message in warns:
            print(f"        · {message}")

    print()
    print(f"{len(paths)}개 파일 · 오류 {total_errors}건 · 경고 {total_warns}건")
    if total_errors:
        print("오류를 고치기 전에는 매칭에 쓸 수 없습니다. policy_data/schema.md 참고.")
    return 1 if total_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
