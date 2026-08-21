from __future__ import annotations

import re
import shutil
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any


KST = timezone(timedelta(hours=9))
_EASYOCR_READER = None


def _is_module_available(module_name: str) -> bool:
    try:
        __import__(module_name)
        return True
    except ImportError:
        return False


def _normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _clean_value(value: str) -> str:
    value = re.sub(r"^[\s:：\-]+", "", value)
    value = re.sub(r"[\s:：\-]+$", "", value)
    return value.strip()


def _find_after_label(text: str, labels: list[str]) -> str | None:
    for label in labels:
        pattern = rf"{label}\s*[:：]?\s*([^\n]+)"
        match = re.search(pattern, text)
        if match:
            return _clean_value(match.group(1))
    return None


def _compact(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value)


def _text_lines(text: str) -> list[str]:
    return [_clean_value(line) for line in text.split("\n") if _clean_value(line)]


LABELS = {
    "registration_number": ["등록번호", "사업자등록번호"],
    "company_name": ["상호", "법인명", "단체명"],
    "representative_name": ["성명", "대표자", "대표자성명"],
    "birth_date": ["생년월일"],
    "opening_date": ["개업연월일", "개업일"],
    "business_address": ["사업장소재지", "사업장주소", "소재지"],
    "business_type": ["사업의종류", "업태", "종목", "업종"],
    "issue_reason": ["발급사유"],
    "joint_business": ["공동사업자"],
    "tax_unit": ["사업자단위과세적용사업자여부"],
    "e_tax_email": ["전자세금계산서전용전자우편주소"],
}


def _find_label_span(lines: list[str], aliases: list[str], start: int = 0) -> tuple[int, int] | None:
    compact_aliases = [_compact(alias) for alias in aliases]
    for index in range(start, len(lines)):
        merged = ""
        for end in range(index, min(index + 8, len(lines))):
            merged += _compact(lines[end])
            if merged in compact_aliases:
                return index, end
            if any(merged.startswith(alias) for alias in compact_aliases):
                return index, end
    return None


def _all_label_starts(lines: list[str]) -> list[int]:
    starts = set()
    for aliases in LABELS.values():
        for index in range(len(lines)):
            span = _find_label_span(lines, aliases, start=index)
            if span and span[0] == index:
                starts.add(span[0])
    return sorted(starts)


def _extract_block_after_label(lines: list[str], aliases: list[str], max_lines: int = 8) -> list[str]:
    span = _find_label_span(lines, aliases)
    if not span:
        return []

    _, label_end = span
    all_starts = [start for start in _all_label_starts(lines) if start > label_end]
    next_label_start = min(all_starts) if all_starts else len(lines)
    end = min(next_label_start, label_end + 1 + max_lines, len(lines))
    return lines[label_end + 1 : end]


def _first_non_noise(lines: list[str]) -> str | None:
    noise = {"'", "`", "9", "국세청", "국세정", "출", "간"}
    for line in lines:
        if line and line not in noise:
            return line
    return None


def _first_meaningful_value(lines: list[str]) -> str | None:
    value = _first_non_noise(lines)
    if value and len(_compact(value)) <= 1:
        return _first_non_noise(lines[1:])
    return value


def _join_address(lines: list[str]) -> str | None:
    if not lines:
        return None
    joined = " ".join(line for line in lines if line not in {"'", "`"})
    joined = re.sub(r"\s+", " ", joined).strip()
    return joined or None


def _extract_dates_from_lines(lines: list[str]) -> list[datetime]:
    dates = []
    for index, line in enumerate(lines):
        window = " ".join(lines[index : index + 4])
        parsed = _parse_date(window)
        if parsed:
            dates.append(parsed)
    return dates


def _line_after_exact(lines: list[str], compact_label: str) -> str | None:
    for index, line in enumerate(lines[:-1]):
        if _compact(line) == compact_label:
            return _first_meaningful_value(lines[index + 1 : index + 4])
    return None


def _looks_like_date_fragment(value: str | None) -> bool:
    if not value:
        return False
    return bool(re.search(r"\d{4}\s*년|\d{2}\s*월|\d{2}\s*일", value))


def _parse_structured_fields(normalized: str) -> dict[str, Any]:
    lines = _text_lines(normalized)
    compact_text = _compact(normalized)

    business_number_match = re.search(r"\b([0-9]{3})[- ]?([0-9]{2})[- ]?([0-9]{5})\b", normalized)
    registration_block = _extract_block_after_label(lines, LABELS["registration_number"], max_lines=2)
    company_block = _extract_block_after_label(lines, LABELS["company_name"], max_lines=3)
    representative_block = _extract_block_after_label(lines, LABELS["representative_name"], max_lines=3)
    birth_block = _extract_block_after_label(lines, LABELS["birth_date"], max_lines=5)
    opening_block = _extract_block_after_label(lines, LABELS["opening_date"], max_lines=5)
    address_block = _extract_block_after_label(lines, LABELS["business_address"], max_lines=8)
    type_block = _extract_block_after_label(lines, LABELS["business_type"], max_lines=8)
    issue_reason_block = _extract_block_after_label(lines, LABELS["issue_reason"], max_lines=6)
    joint_block = _extract_block_after_label(lines, LABELS["joint_business"], max_lines=4)
    tax_unit_block = _extract_block_after_label(lines, LABELS["tax_unit"], max_lines=4)
    e_tax_email_block = _extract_block_after_label(lines, LABELS["e_tax_email"], max_lines=4)

    birth_dates = _extract_dates_from_lines(birth_block)
    opening_dates = _extract_dates_from_lines(opening_block)
    all_dates = _extract_dates_from_lines(lines)

    business_type_text = " ".join(type_block) if type_block else None
    tax_type = None
    if "간이과세자" in normalized:
        tax_type = "간이과세자"
    elif "일반과세자" in normalized:
        tax_type = "일반과세자"
    elif "면세사업자" in normalized:
        tax_type = "면세사업자"

    invoice_issuer = "세금계산서 발급사업자" if "세금계산서" in normalized and "발급사업자" in normalized else None
    issue_date = all_dates[-1] if all_dates else None

    company_name = _first_meaningful_value(company_block) or _line_after_exact(lines, "상")
    representative_name = _first_meaningful_value(representative_block) or _line_after_exact(lines, "성")
    e_tax_email = _first_non_noise(e_tax_email_block)
    if _looks_like_date_fragment(e_tax_email):
        e_tax_email = None

    tax_office = None
    for line in lines:
        if "세무서장" in _compact(line):
            tax_office = line
            break

    return {
        "document_title": "사업자등록증" if "사업자등록증" in compact_text else None,
        "tax_type": tax_type,
        "invoice_issuer_type": invoice_issuer,
        "business_registration_number": "-".join(business_number_match.groups())
        if business_number_match
        else _first_non_noise(registration_block),
        "company_name": company_name,
        "representative_name": representative_name,
        "birth_date": birth_dates[0].date().isoformat() if birth_dates else None,
        "opening_date": opening_dates[0].date().isoformat() if opening_dates else None,
        "business_address": _join_address(address_block),
        "business_type": business_type_text,
        "business_category_main": type_block[0] if type_block else None,
        "business_category_items": " ".join(type_block[1:]) if len(type_block) > 1 else None,
        "issue_reason": " ".join(issue_reason_block) if issue_reason_block else None,
        "joint_business": " ".join(joint_block) if joint_block else None,
        "tax_unit_applicable": "부" if "부" in "".join(tax_unit_block) and "V" in "".join(tax_unit_block) else None,
        "e_tax_email": e_tax_email,
        "issue_date": issue_date.date().isoformat() if issue_date else None,
        "tax_office": tax_office,
        "all_ocr_lines": lines,
    }


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None

    compact = re.sub(r"[^0-9]", "", value)
    if len(compact) >= 8:
        try:
            return datetime(int(compact[:4]), int(compact[4:6]), int(compact[6:8]), tzinfo=KST)
        except ValueError:
            return None
    return None


def _months_since(date_value: datetime | None) -> int | None:
    if not date_value:
        return None

    today = datetime.now(KST)
    months = (today.year - date_value.year) * 12 + (today.month - date_value.month)
    if today.day < date_value.day:
        months -= 1
    return max(months, 0)


def _age_from_birth_date(date_value: datetime | None) -> int | None:
    if not date_value:
        return None

    today = datetime.now(KST)
    age = today.year - date_value.year
    if (today.month, today.day) < (date_value.month, date_value.day):
        age -= 1
    return max(age, 0)


def _infer_region(address: str | None, text: str) -> str | None:
    source = address or text
    if "화성" in source:
        return "화성시"
    if source:
        return "타지역"
    return None


def _infer_category(text: str) -> str | None:
    category_keywords = [
        ("소매업", ["소매", "판매", "도소매", "잡화", "편의점", "마트"]),
        ("음식점", ["음식", "일반음식점", "휴게음식점", "한식", "중식", "분식", "요식"]),
        ("카페", ["카페", "커피", "제과", "디저트"]),
    ]
    for category, keywords in category_keywords:
        if any(keyword in text for keyword in keywords):
            return category
    return "기타" if text else None


def parse_business_registration_text(text: str) -> dict[str, Any]:
    normalized = _normalize_text(text)
    extracted = _parse_structured_fields(normalized)
    opening_date = _parse_date(extracted.get("opening_date"))
    birth_date = _parse_date(extracted.get("birth_date"))
    address = extracted.get("business_address")
    business_type = extracted.get("business_type")

    # 사업자등록증에 「일반과세자 / 간이과세자」가 찍혀 있다. 온보딩에서
    # 따로 여쭤보던 항목이라, 읽었으면 프로필로 넘긴다. 세무일정이 이 값으로
    # 갈린다 — 간이과세자는 부가세 신고가 1년에 한 번뿐이다.
    vat_type = {"일반과세자": "일반과세", "간이과세자": "간이과세"}.get(
        extracted.get("tax_type")
    )

    profile = {
        "business_status": "운영중",
        "age": _age_from_birth_date(birth_date),
        "region": _infer_region(address, normalized),
        "category": _infer_category(" ".join([business_type or "", normalized])),
        "business_period_months": _months_since(opening_date),
        "vat_type": vat_type,
    }

    return {
        "raw_text": normalized,
        "extracted_fields": {key: value for key, value in extracted.items() if value not in (None, "")},
        "extracted_profile": {key: value for key, value in profile.items() if value not in (None, "")},
    }


def _ocr_with_pytesseract(image_path: Path) -> dict[str, Any]:
    import cv2
    import numpy as np
    import pytesseract
    from PIL import Image

    image_bytes = np.fromfile(str(image_path), dtype=np.uint8)
    image = cv2.imdecode(image_bytes, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"이미지 파일을 읽을 수 없습니다: {image_path}")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
    text = pytesseract.image_to_string(Image.fromarray(gray), lang="kor+eng")
    parsed = parse_business_registration_text(text)
    return {
        "ocr_status": "succeeded",
        "ocr_engine": "pytesseract",
        "ocr_message": "사업자등록증 OCR을 완료했습니다. 추출값을 확인해주세요.",
        **parsed,
    }


def _ocr_with_easyocr(image_path: Path) -> dict[str, Any]:
    global _EASYOCR_READER

    import cv2
    import easyocr
    import numpy as np

    if _EASYOCR_READER is None:
        _EASYOCR_READER = easyocr.Reader(["ko", "en"], gpu=False)

    image_bytes = np.fromfile(str(image_path), dtype=np.uint8)
    image = cv2.imdecode(image_bytes, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"이미지 파일을 읽을 수 없습니다: {image_path}")

    result = _EASYOCR_READER.readtext(image, detail=0)
    text = "\n".join(result)
    parsed = parse_business_registration_text(text)
    return {
        "ocr_status": "succeeded",
        "ocr_engine": "easyocr",
        "ocr_message": "사업자등록증 OCR을 완료했습니다. 추출값을 확인해주세요.",
        **parsed,
    }


def extract_business_registration(image_path: str | Path) -> dict[str, Any]:
    path = Path(image_path)
    if not path.exists():
        return {
            "ocr_status": "failed",
            "ocr_engine": None,
            "ocr_message": f"파일을 찾을 수 없습니다: {path}",
            "raw_text": "",
            "extracted_fields": {},
            "extracted_profile": {},
        }

    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return {
            "ocr_status": "not_supported",
            "ocr_engine": None,
            "ocr_message": "현재 PDF OCR은 지원하지 않습니다. 이미지 파일로 업로드해주세요.",
            "raw_text": "",
            "extracted_fields": {},
            "extracted_profile": {},
        }

    if _is_module_available("easyocr"):
        try:
            return _ocr_with_easyocr(path)
        except Exception as error:
            return {
                "ocr_status": "failed",
                "ocr_engine": "easyocr",
                "ocr_message": f"EasyOCR 실패: {error}",
                "raw_text": "",
                "extracted_fields": {},
                "extracted_profile": {},
            }

    if _is_module_available("pytesseract") and shutil.which("tesseract"):
        try:
            return _ocr_with_pytesseract(path)
        except Exception as error:
            return {
                "ocr_status": "failed",
                "ocr_engine": "pytesseract",
                "ocr_message": f"Tesseract OCR 실패: {error}",
                "raw_text": "",
                "extracted_fields": {},
                "extracted_profile": {},
            }

    return {
        "ocr_status": "not_configured",
        "ocr_engine": None,
        "ocr_message": "OCR 엔진이 설치되어 있지 않습니다. test.bat에서 easyocr 설치 후 자동 인식이 가능합니다.",
        "raw_text": "",
        "extracted_fields": {},
        "extracted_profile": {},
    }


if __name__ == "__main__":
    import argparse
    import json

    parser = argparse.ArgumentParser(description="사업자등록증 OCR 테스트")
    parser.add_argument("image_path", help="사업자등록증 이미지 경로")
    args = parser.parse_args()

    print(json.dumps(extract_business_registration(args.image_path), ensure_ascii=False, indent=2))
