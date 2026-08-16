from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import re
from copy import deepcopy
from datetime import datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import RLock
from typing import Any
from urllib.parse import unquote, urlparse

from OCR import extract_business_registration


KST = timezone(timedelta(hours=9))

SATISFIED = "충족"
NOT_SATISFIED = "불충족"
NEEDS_CHECK = "확인필요"

AVAILABLE = "신청가능"
CONDITIONAL = "조건부"
NOT_TARGET = "대상아님"

STATUS_SCORE = {
    SATISFIED: 1.0,
    NEEDS_CHECK: 0.5,
    NOT_SATISFIED: 0.0,
}

DOCUMENT_TYPE_ALIASES = {
    "common": "공통필수",
    "required": "공통필수",
    "conditional": "조건부필수",
    "if_applicable": "해당시제출",
}

# 신청 안내에 쓰는 필드. 조건 판정에는 관여하지 않고 화면까지 그대로 넘긴다.
# 규격은 policy_data/schema.md 참고.
APPLICATION_FIELDS = ("apply_url", "apply_method", "contact", "organizer", "operator")

BASE_DIR = Path(__file__).resolve().parent
USERS_DIR = BASE_DIR / "users"
USER_RECORD_LOCK = RLock()

# 실제 공고는 policy_data/notices/ 에 있다 (기업마당에서 수집한 25건).
# backend/notices/ 는 형식 참고용 샘플 19건이라 실제 공고가 아니다.
# 수집 결과가 없으면 샘플로 물러난다 — 저장소만 받은 사람도 돌려볼 수 있게.
REAL_NOTICES = BASE_DIR.parent / "policy_data" / "notices"
SAMPLE_NOTICES = BASE_DIR / "notices"


def _terms_module():
    """policy_data/terms.py 를 늦게 불러온다.

    사전이 없어도 매칭은 돌아가야 하므로 import 실패를 예외로 두지 않는다.
    사전 폴더가 없는 환경에서는 용어 API 만 404 가 된다.
    """
    import sys
    path = str(BASE_DIR.parent / "policy_data")
    if path not in sys.path:
        sys.path.insert(0, path)
    try:
        import terms
        return terms
    except Exception:
        return None


def default_notices_folder() -> Path:
    if REAL_NOTICES.is_dir() and any(REAL_NOTICES.glob("*.json")):
        return REAL_NOTICES
    return SAMPLE_NOTICES


def resolve_notices_folder(requested: str | None) -> Path:
    """요청이 폴더를 지정하면 그걸 쓰고, 없으면 실제 공고 폴더를 쓴다."""
    if not requested:
        return default_notices_folder()
    return (BASE_DIR / requested).resolve()


def _now_iso() -> str:
    return datetime.now(KST).replace(microsecond=0).isoformat()


def _today_kst() -> Any:
    return datetime.now(KST).date()


def _parse_date(value: Any) -> Any:
    if _is_blank(value):
        return None
    try:
        return datetime.fromisoformat(str(value)).date()
    except ValueError:
        return None


def _application_period_status(apply_period: dict[str, Any] | None) -> dict[str, str | None]:
    if not apply_period:
        return {
            "status": "기간미상",
            "detail": "신청기간 정보 없음",
        }

    start = _parse_date(apply_period.get("start"))
    end = _parse_date(apply_period.get("end"))
    today = _today_kst()

    if start and today < start:
        return {
            "status": "접수예정",
            "detail": f"{start.isoformat()}부터 신청 가능",
        }
    if end and today > end:
        return {
            "status": "지원기간종료",
            "detail": f"{end.isoformat()}에 신청 마감",
        }
    if start and end:
        return {
            "status": "접수중",
            "detail": f"{start.isoformat()} ~ {end.isoformat()}",
        }
    if start:
        return {
            "status": "접수중",
            "detail": f"{start.isoformat()}부터 신청 가능",
        }
    if end:
        return {
            "status": "접수중",
            "detail": f"{end.isoformat()}까지 신청 가능",
        }
    return {
        "status": "기간미상",
        "detail": "신청기간 날짜 해석 필요",
    }


def _is_blank(value: Any) -> bool:
    return value is None or value == "" or value == []


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        return list(value)
    return [value]


def _contains_region(user_region: str, allowed_regions: list[str]) -> bool:
    normalized = user_region.replace(" ", "")
    return any(region.replace(" ", "") in normalized for region in allowed_regions)


def _format_allowed(values: list[Any]) -> str:
    return ", ".join(str(value) for value in values)


def _judge_age(user_value: Any, rule: dict[str, Any]) -> dict[str, str]:
    if _is_blank(user_value):
        return {
            "condition": "age",
            "status": NEEDS_CHECK,
            "detail": "나이 정보 미입력",
        }

    try:
        age = int(user_value)
    except (TypeError, ValueError):
        return {
            "condition": "age",
            "status": NEEDS_CHECK,
            "detail": f"나이 값({user_value})을 숫자로 확인하기 어려움",
        }

    min_age = rule.get("min")
    max_age = rule.get("max")

    if min_age is not None and age < min_age:
        return {
            "condition": "age",
            "status": NOT_SATISFIED,
            "detail": f"만 {age}세, 공고 기준 만 {min_age}세 이상 필요",
        }
    if max_age is not None and age > max_age:
        return {
            "condition": "age",
            "status": NOT_SATISFIED,
            "detail": f"만 {age}세, 공고 기준 만 {max_age}세 이하 필요",
        }

    parts = []
    if min_age is not None:
        parts.append(f"만 {min_age}세 이상")
    if max_age is not None:
        parts.append(f"만 {max_age}세 이하")
    standard = " 및 ".join(parts) if parts else "나이 제한"
    return {
        "condition": "age",
        "status": SATISFIED,
        "detail": f"만 {age}세, 공고 기준 {standard} 충족",
    }


def _judge_region(user_value: Any, rule: dict[str, Any]) -> dict[str, str]:
    if _is_blank(user_value):
        return {
            "condition": "region",
            "status": NEEDS_CHECK,
            "detail": "거주지 또는 사업장 소재지 정보 미입력",
        }

    allowed = _as_list(rule.get("allowed"))
    user_region = str(user_value)
    if allowed and not _contains_region(user_region, [str(region) for region in allowed]):
        return {
            "condition": "region",
            "status": NOT_SATISFIED,
            "detail": f"{user_region}, 공고 기준 지역({_format_allowed(allowed)})에 해당하지 않음",
        }

    return {
        "condition": "region",
        "status": SATISFIED,
        "detail": f"{user_region} 정보가 공고 기준 지역과 일치",
    }


def _judge_allowed_value(condition: str, user_value: Any, rule: dict[str, Any]) -> dict[str, str]:
    label = rule.get("label", condition)
    missing_detail = rule.get("missing_detail", f"{label} 정보 미입력")

    if _is_blank(user_value):
        return {
            "condition": condition,
            "status": NEEDS_CHECK,
            "detail": missing_detail,
        }

    allowed = _as_list(rule.get("allowed"))
    user_values = [str(value) for value in _as_list(user_value)]
    allowed_values = [str(value) for value in allowed]

    if allowed_values and not any(value in allowed_values for value in user_values):
        return {
            "condition": condition,
            "status": NOT_SATISFIED,
            "detail": f"{label}({', '.join(user_values)})이 공고 기준({_format_allowed(allowed)})과 다름",
        }

    return {
        "condition": condition,
        "status": SATISFIED,
        "detail": rule.get("satisfied_detail", f"{label} 조건 충족"),
    }


def _judge_number_range(condition: str, user_value: Any, rule: dict[str, Any]) -> dict[str, str]:
    label = rule.get("label", condition)
    if _is_blank(user_value):
        return {
            "condition": condition,
            "status": NEEDS_CHECK,
            "detail": rule.get("missing_detail", f"{label} 정보 미입력"),
        }

    try:
        number = float(user_value)
    except (TypeError, ValueError):
        return {
            "condition": condition,
            "status": NEEDS_CHECK,
            "detail": f"{label} 값({user_value})을 숫자로 확인하기 어려움",
        }

    min_value = rule.get("min")
    max_value = rule.get("max")

    if min_value is not None and number < min_value:
        return {
            "condition": condition,
            "status": NOT_SATISFIED,
            "detail": f"{label} {number:g}, 공고 기준 {min_value:g} 이상 필요",
        }
    if max_value is not None and number > max_value:
        return {
            "condition": condition,
            "status": NOT_SATISFIED,
            "detail": f"{label} {number:g}, 공고 기준 {max_value:g} 이하 필요",
        }

    return {
        "condition": condition,
        "status": SATISFIED,
        "detail": rule.get("satisfied_detail", f"{label} 조건 충족"),
    }


def _judge_condition(condition: str, user_profile: dict[str, Any], rule: dict[str, Any]) -> dict[str, str]:
    user_field = rule.get("user_field", condition)
    user_value = user_profile.get(user_field)
    rule_type = rule.get("type", "allowed")

    if rule_type == "unknown":
        # 공고문 첨부가 스캔 이미지라 자격 요건을 읽지 못한 경우.
        # 조건이 없는 것과는 다르다. 추측해서 통과시키지 않고 확인 필요로 남긴다.
        return {"condition": condition, "status": NEEDS_CHECK,
                "detail": rule.get("detail", "공고문에서 자격 요건을 확인하지 못했습니다")}
    if rule_type == "age":
        return _judge_age(user_value, rule)
    if rule_type == "region":
        return _judge_region(user_value, rule)
    if rule_type == "number_range":
        return _judge_number_range(condition, user_value, rule)
    return _judge_allowed_value(condition, user_value, rule)


def _overall_status(condition_results: list[dict[str, str]], documents: list[dict[str, Any]]) -> str:
    statuses = {result["status"] for result in condition_results}

    if NOT_SATISFIED in statuses:
        return NOT_TARGET
    if NEEDS_CHECK in statuses:
        return NEEDS_CHECK
    if any(doc.get("required_type") in {"조건부필수", "해당시제출"} for doc in documents):
        return CONDITIONAL
    return AVAILABLE


def _match_score(condition_results: list[dict[str, str]]) -> int:
    if not condition_results:
        return 0

    score = sum(STATUS_SCORE.get(result["status"], 0.0) for result in condition_results)
    return round(score / len(condition_results) * 100)


def _expected_documents(policy: dict[str, Any], user_profile: dict[str, Any]) -> list[dict[str, Any]]:
    documents = []
    for doc in policy.get("expected_documents", []):
        trigger_field = doc.get("trigger_field")
        trigger_values = _as_list(doc.get("trigger_values"))

        if trigger_field:
            user_value = user_profile.get(trigger_field)
            if _is_blank(user_value):
                include_document = doc.get("include_when_unknown", True)
            elif trigger_values:
                include_document = str(user_value) in [str(value) for value in trigger_values]
            else:
                include_document = bool(user_value)

            if not include_document:
                continue

        documents.append(
            {
                "name": doc["name"],
                "required_type": doc.get("required_type", "해당시제출"),
                "confidence": doc.get("confidence", "estimated"),
                "trigger_reason": doc.get("trigger_reason"),
            }
        )

    return documents


def normalize_policy(policy: dict[str, Any]) -> dict[str, Any]:
    """Accept both detailed engine JSON and simpler notice-style JSON."""

    if "conditions" in policy:
        return policy

    eligibility = policy.get("eligibility", {})
    conditions: dict[str, dict[str, Any]] = {}

    if eligibility.get("requirements_unknown"):
        conditions["requirements"] = {
            "type": "unknown",
            "label": "지원 자격",
            "detail": eligibility["requirements_unknown"]
                      if isinstance(eligibility["requirements_unknown"], str)
                      else "공고문에서 자격 요건을 확인하지 못했습니다",
        }

    if "min_age" in eligibility or "max_age" in eligibility:
        conditions["age"] = {
            "type": "age",
            "min": eligibility.get("min_age"),
            "max": eligibility.get("max_age"),
        }

    if eligibility.get("regions"):
        conditions["region"] = {
            "type": "region",
            "allowed": eligibility["regions"],
        }

    if eligibility.get("business_status"):
        conditions["business_status"] = {
            "allowed": _as_list(eligibility["business_status"]),
            "label": "사업 상태",
        }

    if eligibility.get("categories"):
        conditions["category"] = {
            "allowed": eligibility["categories"],
            "label": "업종",
        }

    if eligibility.get("career_experience"):
        conditions["career"] = {
            "user_field": "career_experience",
            "allowed": _as_list(eligibility["career_experience"]),
            "label": "창업 경험",
        }

    if eligibility.get("asset_groups"):
        conditions["income_asset"] = {
            "user_field": "asset_group",
            "allowed": eligibility["asset_groups"],
            "label": "소득·자산 구간",
            "missing_detail": "소득·자산 구간 확인 필요",
        }

    if "min_business_months" in eligibility or "max_business_months" in eligibility:
        conditions["business_period_months"] = {
            "type": "number_range",
            "min": eligibility.get("min_business_months"),
            "max": eligibility.get("max_business_months"),
            "label": "사업 운영 기간",
            "missing_detail": "사업 운영 기간 정보 미입력",
        }

    if "min_annual_revenue_krw" in eligibility or "max_annual_revenue_krw" in eligibility:
        conditions["annual_revenue_krw"] = {
            "type": "number_range",
            "min": eligibility.get("min_annual_revenue_krw"),
            "max": eligibility.get("max_annual_revenue_krw"),
            "label": "연 매출",
            "missing_detail": "연 매출 정보 미입력",
        }

    if eligibility.get("marital_status"):
        conditions["marital_status"] = {
            "allowed": _as_list(eligibility["marital_status"]),
            "label": "혼인 상태",
            "missing_detail": "혼인 상태 정보 미입력",
        }

    if "living_with_parents" in eligibility:
        conditions["living_with_parents"] = {
            "allowed": [eligibility["living_with_parents"]],
            "label": "부모 동거 여부",
            "missing_detail": "부모 동거 여부 확인 필요",
        }

    documents = []
    for document in policy.get("documents", policy.get("expected_documents", [])):
        required_type = document.get("required_type") or document.get("type") or "해당시제출"
        documents.append(
            {
                "name": document["name"],
                "required_type": DOCUMENT_TYPE_ALIASES.get(required_type, required_type),
                "confidence": document.get("confidence", "estimated"),
                "trigger_reason": document.get("reason") or document.get("trigger_reason"),
            }
        )

    normalized = {
        "notice_id": policy["notice_id"],
        "policy_id": policy.get("policy_id"),
        "title": policy.get("title"),
        "source_url": policy.get("source_url"),
        "apply_period": policy.get("apply_period"),
        "summary": policy.get("summary"),
        "conditions": conditions,
        "expected_documents": documents,
    }
    # 신청 안내 정보. 판정에는 쓰지 않지만 화면까지 그대로 전달한다.
    # source_url(공고 페이지)과 apply_url(실제 접수처)은 서로 다르다.
    for key in APPLICATION_FIELDS:
        normalized[key] = policy.get(key)
    return {key: value for key, value in normalized.items() if value not in (None, {}, [])}


def match_policy(policy: dict[str, Any], user_profile: dict[str, Any]) -> dict[str, Any]:
    """Return one matching-engine result for one policy notice.

    policy example:
    {
        "notice_id": "HS-2026-014",
        "policy_id": "HS_YOUTH_STARTUP",
        "conditions": {
            "age": {"type": "age", "max": 39},
            "region": {"type": "region", "allowed": ["화성시"]},
            "career": {
                "user_field": "career_experience",
                "allowed": ["없음"],
                "label": "창업 경험",
            },
        },
        "expected_documents": [
            {
                "name": "주민등록등본",
                "required_type": "공통필수",
                "confidence": "confirmed",
                "trigger_reason": None,
            }
        ],
    }
    """

    policy = normalize_policy(policy)

    condition_results = [
        _judge_condition(condition, user_profile, rule)
        for condition, rule in policy.get("conditions", {}).items()
    ]
    documents = _expected_documents(policy, user_profile)

    result = {"notice_id": policy["notice_id"]}
    if policy.get("policy_id"):
        result["policy_id"] = policy["policy_id"]
    if policy.get("title"):
        result["notice_title"] = policy["title"]
    if policy.get("source_url"):
        result["source_url"] = policy["source_url"]
    if policy.get("apply_period"):
        result["apply_period"] = policy["apply_period"]
    for key in APPLICATION_FIELDS:
        if policy.get(key):
            result[key] = policy[key]

    application_period = _application_period_status(policy.get("apply_period"))

    result.update(
        {
            "user_profile": deepcopy(user_profile),
            "condition_results": condition_results,
            "match_score": _match_score(condition_results),
            "overall_status": _overall_status(condition_results, documents),
            "application_status": application_period["status"],
            "application_detail": application_period["detail"],
            "expected_documents": documents,
            "generated_at": _now_iso(),
        }
    )

    return result


def match_policies(policies: list[dict[str, Any]], user_profile: dict[str, Any]) -> list[dict[str, Any]]:
    """Match multiple policies and sort the most actionable results first."""

    overall_priority = {
        AVAILABLE: 0,
        CONDITIONAL: 1,
        NEEDS_CHECK: 2,
        NOT_TARGET: 3,
    }
    period_priority = {
        "접수중": 0,
        "기간미상": 1,
        "접수예정": 2,
        "지원기간종료": 3,
    }

    results = [match_policy(policy, user_profile) for policy in policies]
    return sorted(
        results,
        key=lambda item: (
            item["overall_status"] == NOT_TARGET,
            period_priority.get(item["application_status"], 99),
            overall_priority.get(item["overall_status"], 99),
            -item["match_score"],
        ),
    )


def load_policies_from_folder(folder_path: str | Path) -> list[dict[str, Any]]:
    """Load every policy notice JSON file from a folder."""

    folder = Path(folder_path)
    if not folder.exists():
        raise FileNotFoundError(f"공고문 폴더를 찾을 수 없습니다: {folder}")

    policies = []
    for json_path in sorted(folder.glob("*.json")):
        with json_path.open("r", encoding="utf-8-sig") as file:
            policy = json.load(file)
        policy["_source_file"] = json_path.name
        policies.append(policy)

    if not policies:
        raise FileNotFoundError(f"공고문 JSON 파일이 없습니다: {folder}")

    return policies


def load_user_profile(profile_path: str | Path | None) -> dict[str, Any]:
    """Load a user profile JSON, or return a sample profile for quick tests."""

    if profile_path:
        with Path(profile_path).open("r", encoding="utf-8-sig") as file:
            return json.load(file)

    return {
        "age": 26,
        "region": "화성시 향남읍",
        "marital_status": "미혼",
        "living_with_parents": True,
        "career_experience": "없음",
        # 일부 공고가 업종/사업 기간을 요구할 때 테스트하기 위한 예시 값입니다.
        "business_status": "예비창업자",
        "category": "카페",
        "business_period_months": 0,
        "annual_revenue_krw": None,
    }


def _safe_device_id(device_id: Any) -> str:
    value = str(device_id or "").strip()
    value = re.sub(r"[^A-Za-z0-9_.-]", "_", value)
    return value[:80] or "unknown_device"


def _user_file_path(device_id: Any) -> Path:
    USERS_DIR.mkdir(exist_ok=True)
    return USERS_DIR / f"{_safe_device_id(device_id)}.json"


def load_user_record(device_id: Any) -> dict[str, Any]:
    path = _user_file_path(device_id)
    default_record = {
        "device_id": _safe_device_id(device_id),
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "profile": {},
        "chat_history": [],
        "match_history": [],
        "uploads": [],
    }

    with USER_RECORD_LOCK:
        if not path.exists():
            return default_record

        try:
            with path.open("r", encoding="utf-8-sig") as file:
                return json.load(file)
        except json.JSONDecodeError:
            corrupt_path = path.with_suffix(f".corrupt_{datetime.now(KST).strftime('%Y%m%d_%H%M%S')}.json")
            path.replace(corrupt_path)
            default_record["recovered_from_corrupt_file"] = corrupt_path.name
            return default_record


def save_user_record(record: dict[str, Any]) -> dict[str, Any]:
    record["device_id"] = _safe_device_id(record.get("device_id"))
    record["updated_at"] = _now_iso()
    path = _user_file_path(record["device_id"])
    temp_path = path.with_suffix(".tmp")

    with USER_RECORD_LOCK:
        with temp_path.open("w", encoding="utf-8") as file:
            json.dump(record, file, ensure_ascii=False, indent=2)
        temp_path.replace(path)

    return record


def merge_user_profile(device_id: Any, profile: dict[str, Any], chat_history: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    record = load_user_record(device_id)
    current_profile = record.get("profile", {})
    current_profile.update({key: value for key, value in profile.items() if value is not None})
    record["profile"] = current_profile
    if chat_history is not None:
        record["chat_history"] = chat_history
    return save_user_record(record)


def replace_user_state(device_id: Any, profile: dict[str, Any], chat_history: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    record = load_user_record(device_id)
    record["profile"] = profile
    if chat_history is not None:
        record["chat_history"] = chat_history
    return save_user_record(record)


def save_match_history(device_id: Any, user_profile: dict[str, Any], results: list[dict[str, Any]]) -> dict[str, Any]:
    record = merge_user_profile(device_id, user_profile)
    history = record.setdefault("match_history", [])
    history.append(
        {
            "created_at": _now_iso(),
            "user_profile": user_profile,
            "top_results": results[:3],
            "total_count": len(results),
        }
    )
    record["match_history"] = history[-20:]
    return save_user_record(record)


def save_business_registration_upload(device_id: Any, filename: str, data_url: str) -> dict[str, Any]:
    record = load_user_record(device_id)
    uploads_dir = USERS_DIR / _safe_device_id(device_id) / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    if "," in data_url:
        header, encoded = data_url.split(",", 1)
    else:
        header, encoded = "", data_url

    extension = Path(filename or "business_registration").suffix or ".bin"
    saved_name = f"business_registration_{datetime.now(KST).strftime('%Y%m%d_%H%M%S')}{extension}"
    saved_path = uploads_dir / saved_name
    saved_path.write_bytes(base64.b64decode(encoded))

    ocr_result = extract_business_registration(saved_path)
    extracted_profile = ocr_result.get("extracted_profile", {})

    upload_record = {
        "filename": filename,
        "saved_path": str(saved_path.relative_to(BASE_DIR)),
        "content_header": header,
        "uploaded_at": _now_iso(),
        "ocr_status": ocr_result.get("ocr_status"),
        "ocr_engine": ocr_result.get("ocr_engine"),
        "ocr_message": ocr_result.get("ocr_message"),
        "raw_text": ocr_result.get("raw_text", ""),
        "extracted_fields": ocr_result.get("extracted_fields", {}),
        "extracted_profile": extracted_profile,
    }

    if extracted_profile:
        profile = record.get("profile", {})
        profile.update({key: value for key, value in extracted_profile.items() if value is not None})
        record["profile"] = profile

    record.setdefault("uploads", []).append(upload_record)
    save_user_record(record)
    return upload_record


def _input_or_none(prompt: str) -> str | None:
    value = input(prompt).strip()
    return value or None


def _input_int_or_none(prompt: str) -> int | None:
    value = _input_or_none(prompt)
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        print(f"숫자로 해석할 수 없어 빈 값으로 처리합니다: {value}")
        return None


def _input_bool_or_none(prompt: str) -> bool | None:
    value = _input_or_none(prompt)
    if value is None:
        return None

    normalized = value.lower()
    if normalized in {"y", "yes", "true", "1", "예", "네", "있음"}:
        return True
    if normalized in {"n", "no", "false", "0", "아니오", "아니요", "없음"}:
        return False

    print(f"예/아니오로 해석할 수 없어 빈 값으로 처리합니다: {value}")
    return None


def _input_choice_or_none(prompt: str, choices: dict[str, Any]) -> Any:
    print(prompt)
    for key, label in choices.items():
        print(f"  {key}. {label}")
    value = _input_or_none("선택: ")
    if value is None:
        return None
    if value not in choices:
        print(f"목록에 없는 값이라 빈 값으로 처리합니다: {value}")
        return None
    return choices[value]


def input_user_profile() -> dict[str, Any]:
    print("내 조건을 입력하세요. 모르면 그냥 Enter를 누르면 확인필요로 처리됩니다.")
    print("한글 입력 깨짐을 줄이기 위해 대부분 숫자/y/n으로 입력합니다.")
    print()

    age = _input_int_or_none("나이(만 나이): ")

    is_hwaseong = _input_bool_or_none("거주지 또는 사업장이 화성시인가요? y/n: ")
    if is_hwaseong is True:
        region = "화성시"
    elif is_hwaseong is False:
        region = "타지역"
    else:
        region = None

    business_status = _input_choice_or_none(
        "사업 상태",
        {
            "1": "예비창업자",
            "2": "운영중",
        },
    )
    category = _input_choice_or_none(
        "업종",
        {
            "1": "카페",
            "2": "음식점",
            "3": "소매업",
            "4": "기타",
        },
    )

    has_career_experience = _input_bool_or_none("창업 경험이 있나요? y/n: ")
    if has_career_experience is True:
        career_experience = "있음"
    elif has_career_experience is False:
        career_experience = "없음"
    else:
        career_experience = None

    asset_group = _input_choice_or_none(
        "소득·자산 구간",
        {
            "1": "기초생활수급자",
            "2": "차상위",
            "3": "일반",
        },
    )
    business_period_months = _input_int_or_none("사업 운영 기간(개월): ")
    annual_revenue_krw = _input_int_or_none("작년 연 매출(원, 예: 1200000000): ")
    marital_status = _input_choice_or_none(
        "혼인 상태",
        {
            "1": "미혼",
            "2": "기혼",
        },
    )
    living_with_parents = _input_bool_or_none("부모와 동거하나요? y/n: ")

    return {
        "age": age,
        "region": region,
        "business_status": business_status,
        "category": category,
        "career_experience": career_experience,
        "asset_group": asset_group,
        "business_period_months": business_period_months,
        "annual_revenue_krw": annual_revenue_krw,
        "marital_status": marital_status,
        "living_with_parents": living_with_parents,
    }


def print_recommendation(result: dict[str, Any], index: int) -> None:
    title = result.get("notice_title", result["notice_id"])
    print()
    print(f"{index}. {title}")
    print(f"   공고 ID: {result['notice_id']}")
    print(f"   추천 점수: {result['match_score']}점")
    print(f"   종합 판정: {result['overall_status']}")
    print(f"   신청 상태: {result['application_status']} ({result['application_detail']})")
    if result["application_status"] == "지원기간종료" and result["overall_status"] != NOT_TARGET:
        print("   참고: 지금은 마감됐지만, 입력 조건상 지원 가능성이 있었던 공고입니다.")

    satisfied = [item for item in result["condition_results"] if item["status"] == SATISFIED]
    needs_check = [item for item in result["condition_results"] if item["status"] == NEEDS_CHECK]
    not_satisfied = [item for item in result["condition_results"] if item["status"] == NOT_SATISFIED]

    if satisfied:
        print("   맞는 조건:")
        for item in satisfied:
            print(f"    - {item['detail']}")
    if needs_check:
        print("   추가 확인 필요:")
        for item in needs_check:
            print(f"    - {item['detail']}")
    if not_satisfied:
        print("   맞지 않는 조건:")
        for item in not_satisfied:
            print(f"    - {item['detail']}")

    if result["expected_documents"]:
        print("   예상 서류:")
        for doc in result["expected_documents"]:
            confidence = "확정" if doc["confidence"] == "confirmed" else "추정"
            print(f"    - {doc['name']} ({doc['required_type']}, {confidence})")


def print_recommendations(results: list[dict[str, Any]], initial_limit: int = 3) -> None:
    print()
    print("=== 추천 결과 ===")

    visible_results = results[:initial_limit]
    hidden_results = results[initial_limit:]

    for index, result in enumerate(visible_results, start=1):
        print_recommendation(result, index)

    if not hidden_results:
        return

    print()
    answer = _input_bool_or_none(f"나머지 {len(hidden_results)}개 공고도 더 볼까요? y/n: ")
    if answer is not True:
        print("상위 추천 3개만 표시하고 종료합니다.")
        return

    for index, result in enumerate(hidden_results, start=initial_limit + 1):
        print_recommendation(result, index)


class MatchingRequestHandler(BaseHTTPRequestHandler):
    server_version = "HwaseongMatching/1.0"

    def _send_cors(self) -> None:
        """프론트엔드가 다른 포트에서 돌기 때문에 필요하다.

        React(Vite)는 5173, 이 서버는 8000 이라 브라우저가 다른 출처로 보고
        응답을 막는다. 헤더가 없으면 fetch 가 전부 실패한다 — 서버 로그에는
        200 이 찍히는데 브라우저 콘솔에만 CORS 오류가 뜨어서 원인을 찾기 어렵다.

        해커톤 데모용이라 출처를 가리지 않는다. 실제 서비스라면 허용할
        도메인을 정해서 넣어야 한다.
        """
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")

    def _send_json(self, payload: dict[str, Any] | list[Any], status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._send_cors()
        self.end_headers()
        self.wfile.write(body)

    def _send_text(self, text: str, status: int = 200) -> None:
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._send_cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        """브라우저가 POST 전에 먼저 보내는 예비 요청(preflight).

        Content-Type: application/json 을 붙인 POST 는 브라우저가 반드시
        OPTIONS 를 먼저 던진다. 여기서 200 을 안 주면 본 요청이 아예 안 나간다.
        """
        self.send_response(204)
        self._send_cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _serve_file(self, request_path: str) -> None:
        parsed_path = unquote(urlparse(request_path).path)
        if parsed_path in {"", "/"}:
            parsed_path = "/index.html"

        relative_path = parsed_path.lstrip("/")
        file_path = (BASE_DIR / relative_path).resolve()

        if not str(file_path).startswith(str(BASE_DIR)) or not file_path.is_file():
            self._send_text("Not found", 404)
            return

        content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self._send_cors()
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            self._send_json({"ok": True})
            return
        if path == "/api/terms":
            # 사전 원본. 프론트는 terms.json 을 복사해 두지 말고 여기서 받는다.
            # 복사본을 두면 사전을 고쳤을 때 복사본이 조용히 낡는다.
            terms = _terms_module()
            if terms is None:
                self._send_json({"error": "용어 사전을 불러오지 못했습니다"}, 404)
                return
            self._send_json(terms.load())
            return
        self._serve_file(self.path)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path not in {"/api/match", "/api/user/load", "/api/user/save",
                        "/api/business-registration", "/api/terms/lookup"}:
            self._send_text("Not found", 404)
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length).decode("utf-8")
            payload = json.loads(raw_body or "{}")
        except Exception as error:
            self._send_json({"error": str(error)}, 400)
            return

        if path == "/api/user/load":
            device_id = payload.get("device_id")
            self._send_json(load_user_record(device_id))
            return

        if path == "/api/user/save":
            device_id = payload.get("device_id")
            profile = payload.get("profile", {})
            chat_history = payload.get("chat_history")
            self._send_json(replace_user_state(device_id, profile, chat_history))
            return

        if path == "/api/terms/lookup":
            # 공고문에 실제로 나온 용어만 돌려준다. 사전 전체를 LLM 프롬프트에
            # 넣으면 토큰도 낭비고 엉뚱한 용어까지 끌어온다.
            # documents 에는 매칭 결과의 expected_documents 이름을 그대로 넣으면
            # 발급처·비용·소요시간이 붙어서 돌아온다.
            terms = _terms_module()
            if terms is None:
                self._send_json({"error": "용어 사전을 불러오지 못했습니다"}, 404)
                return
            text = payload.get("text") or ""
            wanted = payload.get("documents") or []
            found_docs = [doc for doc in (terms.find_document(name) for name in wanted) if doc]
            self._send_json({
                "terms": terms.find_terms(text),
                "documents": found_docs,
                "glossary": terms.glossary_for(text) if text else "",
            })
            return

        if path == "/api/business-registration":
            try:
                upload = save_business_registration_upload(
                    payload.get("device_id"),
                    payload.get("filename", "business_registration"),
                    payload.get("data_url", ""),
                )
            except Exception as error:
                self._send_json({"error": str(error)}, 500)
                return
            self._send_json(upload)
            return

        try:
            device_id = payload.get("device_id")
            user_profile = payload.get("user_profile", payload)
            policies = load_policies_from_folder(
                resolve_notices_folder(payload.get("notices_folder")))
            results = match_policies(policies, user_profile)
            if device_id:
                save_match_history(device_id, user_profile, results)
        except Exception as error:
            self._send_json({"error": str(error)}, 500)
            return

        self._send_json(
            {
                "user_profile": user_profile,
                "total_count": len(results),
                "results": results,
                "generated_at": _now_iso(),
            }
        )

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[web] {self.address_string()} - {format % args}")


def serve(host: str, port: int) -> None:
    server = ThreadingHTTPServer((host, port), MatchingRequestHandler)
    print(f"Matching web server running at http://{host}:{port}/index.html")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser(description="화성시 소상공인 지원사업 매칭 엔진 테스트")
    parser.add_argument("--notices", default=None,
                        help="공고문 JSON 폴더 경로 (기본값: policy_data/notices)")
    parser.add_argument("--profile", help="사용자 프로필 JSON 경로")
    parser.add_argument("--interactive", action="store_true", help="터미널에서 사용자 조건을 직접 입력")
    parser.add_argument("--json", action="store_true", help="추천 요약 대신 JSON 전체 출력")
    parser.add_argument("--serve", action="store_true", help="웹 테스트 서버 실행")
    parser.add_argument("--host", default="127.0.0.1", help="웹 서버 호스트")
    parser.add_argument("--port", type=int, default=8000, help="웹 서버 포트")
    args = parser.parse_args()

    if args.serve:
        serve(args.host, args.port)
        return

    policies = load_policies_from_folder(resolve_notices_folder(args.notices))
    user_profile = input_user_profile() if args.interactive else load_user_profile(args.profile)
    results = match_policies(policies, user_profile)

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        print_recommendations(results)


if __name__ == "__main__":
    main()
