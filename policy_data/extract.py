#!/usr/bin/env python3
"""공고문에서 자격요건과 제출서류를 뽑아 schema.md 형식 JSON 으로 만든다.

    python3 policy_data/extract.py            notices/ 에 만들고 검토표 출력
    python3 policy_data/extract.py --review   저장하지 않고 검토표만
    python3 policy_data/extract.py --show ID  한 건의 원문 섹션 확인

입력
    policy_data/raw/bizinfo_*.json   API 원본 (collect.py --raw)
    policy_data/raw/docs/<ID>.txt    첨부 공고문 텍스트 (fetch_docs.py)

원칙은 schema.md 와 같다. **애매하면 넣지 않는다.**
틀린 조건은 그 사람을 대상에서 빼버리지만, 없는 조건은 '확인필요'로 남아
나중에 되물을 수 있다. 그래서 규칙이 확실히 맞을 때만 조건을 만든다.

뽑아낸 근거 문장을 항상 같이 출력한다. 사람이 눈으로 확인하지 않은 조건은
믿으면 안 된다.
"""

from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "policy_data" / "raw"
DOCS_DIR = RAW_DIR / "docs"
OUT_DIR = ROOT / "policy_data" / "notices"

sys.path.insert(0, str(ROOT / "policy_data"))
from collect import field, haystack, is_open, scope, SOSANG, USABLE  # noqa: E402
from terms import find_document  # noqa: E402

# 자격 관련 섹션 제목. 먼저 나오는 순서대로 찾는다.
QUALIFY_HEADS = ["신청자격", "참가자격", "지원자격", "신청대상", "지원대상", "신청 자격"]
DOCUMENT_HEADS = ["제출서류", "구비서류", "신청서류", "제출 서류"]
EXCLUDE_HEADS = ["신청 제외", "지원제외", "제외대상", "지원 제외", "제외 대상"]

# 다음 섹션이 시작되면 자른다
NEXT_HEAD = re.compile(
    r"\n\s*(?:[□■◇◆○●▣▶]|\d+\s*[.)]|[가-힣]\s*[.)])\s*"
    r"(?:지원내용|지원규모|선정|신청방법|접수|문의|추진일정|유의사항|기타|평가)"
)

BULLET = re.compile(r"^\s*(?:[-–—▪▫·○●□■➊-➓①-⑳◦*]|\d+[.)]|[가-힣][.)])\s*")


def clean(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text or "")
    return re.sub(r"[ \t]+", " ", html.unescape(text)).strip()


def section(text: str, heads: list[str], span: int = 1400) -> str:
    """섹션 제목 뒤 본문을 잘라온다. 없으면 빈 문자열."""
    for head in heads:
        index = text.find(head)
        if index < 0:
            continue
        body = text[index + len(head): index + len(head) + span]
        stop = NEXT_HEAD.search(body)
        if stop:
            body = body[: stop.start()]
        return body.strip(" :：\n")
    return ""


# ── 자격요건 규칙 ────────────────────────────────────────────────
# (키, 정규식, 값 만들기, 설명) — 확실한 것만 넣는다

def rule_business_months_max(text: str):
    match = re.search(r"창업\s*(\d+)\s*년\s*(?:이내|미만)", text)
    if match:
        return "max_business_months", int(match.group(1)) * 12, match.group(0)
    return None


def rule_business_months_min(text: str):
    match = re.search(r"(?:업력|창업)\s*(\d+)\s*년\s*이상", text)
    if match:
        return "min_business_months", int(match.group(1)) * 12, match.group(0)
    return None


def rule_revenue_max(text: str):
    match = re.search(r"매출[^\n]{0,20}?(\d+(?:\.\d+)?)\s*억[^\n]{0,8}?(?:이하|미만)", text)
    if match:
        won = int(float(match.group(1)) * 100_000_000)
        return "max_annual_revenue_krw", won, match.group(0)
    return None


def rule_operating(text: str):
    """휴업·폐업자를 빼거나 '정상 영업 중'을 요구하면 운영중인 사업자만 대상.

    '휴업 또는 폐업 중인 경우' 처럼 제외 목록에 한 줄로만 적히는 일이 많아
    '제외'라는 단어가 같은 줄에 없어도 잡는다. 제외 섹션 전체를 함께 넘겨받기
    때문에 오탐이 잘 안 난다.
    """
    if re.search(r"휴\s*[·․‧,]?\s*폐업|휴업|폐업|정상\s*영업|영업\s*중", text):
        found = re.search(r"[^\n]{0,50}(?:휴업|폐업|정상\s*영업|영업\s*중)[^\n]{0,50}", text)
        return "business_status", ["운영중"], found.group(0).strip() if found else "휴·폐업 제외"
    return None


def rule_age_range(text: str):
    """'51~80세' 처럼 구간으로 적힌 나이."""
    match = re.search(r"(\d{2})\s*[~∼-]\s*(\d{2})\s*세", text)
    if match:
        low, high = int(match.group(1)), int(match.group(2))
        if 10 <= low < high <= 100:
            return "age_range", (low, high), match.group(0)
    return None


def rule_revenue_min(text: str):
    match = re.search(r"매출[^\n]{0,20}?(\d+(?:\.\d+)?)\s*억[^\n]{0,8}?이상", text)
    if match:
        won = int(float(match.group(1)) * 100_000_000)
        return "min_annual_revenue_krw", won, match.group(0)
    return None


def rule_prestartup(text: str):
    if re.search(r"예비\s*창업", text):
        found = re.search(r"[^\n]{0,40}예비\s*창업[^\n]{0,40}", text)
        return "business_status", ["예비창업자", "운영중"], found.group(0).strip()
    return None


def rule_food(text: str):
    if re.search(r"식품접객업|음식점|외식업", text):
        found = re.search(r"[^\n]{0,40}(?:식품접객업|음식점|외식업)[^\n]{0,40}", text)
        return "categories", ["음식점"], found.group(0).strip()
    return None


RULES = [
    rule_business_months_max,
    rule_business_months_min,
    rule_revenue_max,
    rule_revenue_min,
    rule_age_range,
    rule_prestartup,   # 예비창업이 먼저 — 있으면 운영중 규칙을 덮어쓴다
    rule_operating,
    rule_food,
]

# 소상공인을 대놓고 빼는 공고. 우리 사용자에게 보여주면 안 된다.
#
# 넓게 잡으면 안 된다. "재해로 휴업중인 소상공인 제외"처럼 제외 규정의
# 예외를 적은 문장까지 걸려서, 정작 소상공인 대상 공고가 빠져버린다.
# 실제 공고문에서 쓰는 표현은 아래 하나로 정형화돼 있다.
#     "중소기업확인서 내 '소기업(소상공인)'은 지원 제외"
EXCLUDES_SOSANG = re.compile(
    r"소기업\s*[(（]\s*소상공인\s*[)）][^\n]{0,10}(?:은|는)?\s*지원\s*제외"
)

# 소상공인 서비스에 뜨면 안 되는 대상. 업종·신분이 아예 다르다.
NOT_SOSANG = re.compile(r"여성\s*농업인|농업경영체|농업인|재직자|영농|어업인")


def build_eligibility(text: str) -> tuple[dict, list[str]]:
    """(조건, 근거문장). 규칙이 안 걸리면 빈 조건을 돌려준다."""
    eligibility: dict = {}
    evidence: list[str] = []
    for rule in RULES:
        result = rule(text)
        if not result:
            continue
        key, value, why = result
        if key == "age_range":
            low, high = value
            if "min_age" not in eligibility:
                eligibility["min_age"], eligibility["max_age"] = low, high
                evidence.append(f"min_age = {low}, max_age = {high}  ← “{why.strip()}”")
            continue
        if key in eligibility:
            continue  # 먼저 걸린 규칙을 존중한다
        eligibility[key] = value
        evidence.append(f"{key} = {value}  ← “{why.strip()[:70]}”")
    return eligibility, evidence


# ── 제출서류 ────────────────────────────────────────────────────

DOC_WORD = re.compile(r"(증명서|증명원|증명|확인서|등록증|신고증|계약서|계획서|"
                      r"신청서|사본|서식|동의서|증빙|각서|확약서|등본|초본|대장)")
# 서류명이 아니라 안내·설명 문구인 줄
DROP = re.compile(r"참고|참조|붙임|첨부|해당\s*시|다음\s*과|아래\s*와|"
                  r"제출\s*서류|구비\s*서류|신청\s*서류|유의|주의")

# 서류명 뒤에 붙는 발급처·안내. 여기서 자른다.
TAIL = re.compile(r"\s*(?:국세청|홈택스|정부24|정부|시스템|발급|온라인|필수|양식|"
                  r"각\s*1부|1부|사본|제출|작성|연동|가능|내\b|등\b).*$")


def split_documents(line: str) -> list[str]:
    """한 줄에 여러 서류가 쉼표로 묶여 있으면 나눈다."""
    parts = re.split(r"\s*[,、·]\s*|\s+및\s+|\s+또는\s+", line)
    return [p for p in parts if p.strip()]


def tidy(raw_line: str) -> str:
    """표 한 줄에서 서류명만 남긴다."""
    line = BULLET.sub("", raw_line).strip()
    line = re.split(r"\s{2,}", line)[0]          # 표는 공백으로 칸이 갈린다. 첫 칸만.
    # 앞 번호를 뗀다. 다만 '4대보험료' 처럼 숫자가 서류명의 일부일 수 있으니
    # 구분자(. ) 공백)가 뒤따를 때만 뗀다. 동그라미 숫자는 언제나 번호다.
    line = re.sub(r"^[①-⑳➊-➓㉠-㉻]+\s*", "", line)
    line = re.sub(r"^\d+\s*[.)]\s*|^\d+\s+", "", line)
    line = re.sub(r"^[⦁‧·∙•]\s*", "", line)
    line = re.sub(r"\s*\([^)]{0,40}\)\s*$", "", line)  # 끝의 괄호 설명
    line = re.sub(r"\s*[※*].*$", "", line)             # 각주
    return line.strip(" ·-–—:：")


def polish(name: str) -> str:
    """서류명 뒤에 딸려온 발급처 안내를 떼어낸다."""
    name = re.sub(r"^[①-⑳➊-➓㉠-㉻]+\s*", "", name.strip())
    cut = TAIL.sub("", name).strip()
    # 잘라내서 너무 짧아졌으면 원래 것을 쓴다
    return cut if len(cut) >= 3 else name.strip()


def build_documents(text: str) -> list[dict]:
    """제출서류 섹션에서 서류명을 골라낸다. 사전에 있으면 이름을 맞춰준다."""
    documents: list[dict] = []
    seen: set[str] = set()
    for raw_line in text.split("\n"):
        tidied = tidy(raw_line)
        if not tidied or DROP.search(tidied):
            continue
        for candidate in split_documents(tidied):
            name_raw = polish(candidate)
            if not (3 <= len(name_raw) <= 24) or not DOC_WORD.search(name_raw):
                continue
            if not DOC_WORD.search(name_raw[-6:]):
                continue  # 서류명은 '…증명서/확인서/등록증'으로 끝난다
            entry = find_document(name_raw)
            name = entry["name"] if entry else name_raw
            if name in seen:
                continue
            seen.add(name)
            documents.append({
                "name": name,
                "type": "common",
                # 공고문에 적혀 있으니 confirmed 다. 사전 표준명으로 바꾼
                # 경우는 원문과 다를 수 있어 원문을 같이 남긴다.
                "confidence": "confirmed",
                **({"reason": f"공고문 표기: {name_raw}"} if name != name_raw else {}),
            })
    return documents


BASELINE_DOCUMENTS = [
    {"name": "사업자등록증", "type": "common", "confidence": "estimated",
     "reason": "소상공인 대상 사업은 사업자 확인을 위해 대부분 요구한다"},
    {"name": "신청서", "type": "common", "confidence": "estimated",
     "reason": "공고 붙임 서식을 사용한다"},
]


# ── 조립 ────────────────────────────────────────────────────────

def to_iso(period: str, which: int) -> str | None:
    found = re.findall(r"(\d{4})-?(\d{2})-?(\d{2})", period or "")
    if len(found) <= which:
        return None
    year, month, day = found[which]
    return f"{year}-{month}-{day}"


def skip_reason(entry: dict, doc_text: str) -> str | None:
    """우리 사용자에게 보여주면 안 되는 공고인지. 아니면 None."""
    basis = " ".join([clean(field(entry, "bsnsSumryCn")),
                      field(entry, "trgetNm"), doc_text[:6000]])
    if EXCLUDES_SOSANG.search(basis):
        return "공고문에 '소상공인 지원 제외'가 명시돼 있다"
    title_and_summary = field(entry, "pblancNm") + " " + clean(field(entry, "bsnsSumryCn"))
    if NOT_SOSANG.search(title_and_summary):
        return "소상공인이 아니라 농업인·재직자 대상이다"
    return None


# HWP·PDF 에서 뽑은 텍스트에 섞여 들어오는 것들
PAGE_MARK = re.compile(r"^\s*-\s*\d+\s*-\s*$", re.M)      # 쪽 번호 "- 1 -"
BLANKS = re.compile(r"\n{3,}")
# 섹션 제목을 자르다 남은 조각. "및 요건", "의 개요" 처럼 조사로 시작한다.
LEADING_FRAGMENT = re.compile(r"^\s*(?:및|의|을|를|에|과|와|이|가)\s+\S{0,10}\n")


def polish_summary(text: str) -> str:
    """공고 요약을 사람이 읽을 수 있게 다듬는다.

    첨부에서 뽑은 텍스트라 쪽 번호와 잘린 조각이 섞인다. 상세 화면에
    그대로 나가면 어색하다. 내용을 바꾸지는 않고 군더더기만 걷어낸다.
    """
    text = PAGE_MARK.sub("", text or "")
    text = LEADING_FRAGMENT.sub("", text, count=1)
    text = BLANKS.sub("\n\n", text)
    return "\n".join(line.rstrip() for line in text.split("\n")).strip()


def build_notice(entry: dict, doc_text: str) -> tuple[dict, list[str]]:
    pblanc_id = field(entry, "pblancId", "seq")
    summary_api = clean(field(entry, "bsnsSumryCn"))

    qualify = section(doc_text, QUALIFY_HEADS) if doc_text else ""
    exclude = section(doc_text, EXCLUDE_HEADS, span=800) if doc_text else ""
    doc_section = section(doc_text, DOCUMENT_HEADS, span=900) if doc_text else ""

    # 자격은 본문 자격 섹션 + 제외 섹션을 같이 본다. 없으면 API 요약으로.
    basis = "\n".join([qualify, exclude]).strip() or summary_api
    eligibility, evidence = build_eligibility(basis)

    # 요건을 하나도 못 뽑았으면 "확인 필요"로 남긴다.
    #
    # 요건이 진짜 없는 공고(전 소상공인 대상)와, 요건이 있는데 우리가 못 읽은
    # 공고를 구분할 방법이 없다. 25건 중 17건이 여기 해당하는데 그 안에는
    #
    #   · 첨부가 스캔 이미지라 텍스트가 아예 없는 것        13건
    #   · 텍스트는 있지만 "온라인판로 종합지원 선정 기업"처럼
    #     우리 프로필로는 판정할 수 없는 조건인 것            일부
    #
    # 이 섞여 있다. 구분이 안 되면 안전한 쪽으로 통일한다. 사용자에게
    # "확인해보세요"라고 말하는 건 손해가 없지만, 대상이 아닌 사람에게
    # "신청가능 100점"이라고 말하는 건 헛걸음을 시킨다.
    #
    # 조건을 아예 안 걸면 100점 신청가능으로 상단에 올라간다. 그게 지금까지의
    # 동작이었고, 실제로 17건이 그렇게 떠 있었다.
    if not eligibility:
        eligibility["requirements_unknown"] = (
            "공고문에서 자격 요건을 확인하지 못했습니다. 문의처로 확인해주세요"
        )
        evidence.append(
            "requirements_unknown  ← 규칙에 걸린 요건 없음"
            + ("" if doc_text else " (첨부 본문도 없음 — 스캔·HWP)")
        )

    # 화성시 전용 공고는 지역 조건이 실제로 있다. 전국·경기 공고는 조건을
    # 걸지 않는다 — 우리 사용자는 모두 화성시민이라 걸어봐야 전원 통과다.
    where = scope(entry)
    if where == "화성":
        eligibility["regions"] = ["화성시", "화성특례시"]
        evidence.append('regions = ["화성시", "화성특례시"]  ← 화성시 전용 공고')
    elif where.startswith("타시도"):
        # 타지역 전용 공고는 지역 조건을 걸어야 '대상아님'으로 걸러진다.
        # 안 걸면 조건이 하나도 없는 공고가 되어 100점 신청가능으로 뜬다.
        region = where[len("타시도("):-1]
        eligibility["regions"] = [region]
        evidence.append(f'regions = ["{region}"]  ← {region} 지역 전용 공고')

    documents = build_documents(doc_section) if doc_section else []
    if not documents:
        documents = list(BASELINE_DOCUMENTS)

    period = field(entry, "reqstBeginEndDe", "reqstDt")
    notice = {
        "notice_id": pblanc_id,
        "title": field(entry, "pblancNm", "title"),
        "source_url": field(entry, "pblancUrl", "link"),
        "summary": polish_summary(qualify[:600] or summary_api)[:400],
        "apply_period": {k: v for k, v in
                         (("start", to_iso(period, 0)), ("end", to_iso(period, 1))) if v},
        "eligibility": eligibility,
        "documents": documents,
        # 신청까지 안내하는 게 이 서비스의 목적이라 접수처 정보를 같이 담는다.
        # source_url(기업마당 공고 페이지)과 apply_url(실제 접수 사이트)은 다르다.
        "apply_url": field(entry, "rceptEngnHmpgUrl"),
        "apply_method": clean(field(entry, "reqstMthPapersCn")),
        "contact": clean(field(entry, "refrncNm")),
        "organizer": field(entry, "jrsdInsttNm", "author"),
        "operator": field(entry, "excInsttNm"),
    }
    if not notice["apply_period"]:
        notice.pop("apply_period")
    for key in ("apply_url", "apply_method", "contact", "organizer", "operator"):
        if not notice[key]:
            notice.pop(key)
    return notice, evidence


def main() -> int:
    review_only = "--review" in sys.argv
    if "--show" in sys.argv:
        wanted = sys.argv[sys.argv.index("--show") + 1]
        path = DOCS_DIR / f"{wanted}.txt"
        if not path.exists():
            print(f"없습니다: {path}")
            return 1
        text = path.read_text(encoding="utf-8")
        for label, heads in (("자격", QUALIFY_HEADS), ("제외", EXCLUDE_HEADS),
                             ("서류", DOCUMENT_HEADS)):
            print(f"\n===== {label} =====")
            print(section(text, heads) or "(못 찾음)")
        return 0

    snapshots = sorted(RAW_DIR.glob("bizinfo_*.json"))
    if not snapshots:
        print("먼저 python3 policy_data/collect.py --raw 를 실행하세요.")
        return 1
    rows = json.loads(snapshots[-1].read_text(encoding="utf-8"))
    rows = [r for r in rows
            if SOSANG.search(haystack(r)) and scope(r) in USABLE and is_open(r)]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # 지난 실행에서 남은 파일을 지운다. 안 지우면 걸러내기로 한 공고가
    # 파일로 계속 살아남아 매칭에 들어간다. 실제로 광주·서울 전용 공고가
    # 이렇게 남아서 화성 사용자에게 '신청가능'으로 떴다.
    stale = {path.name for path in OUT_DIR.glob("*.json")}
    written: set[str] = set()

    with_text = without_text = 0
    skipped: list[tuple[str, str]] = []

    for entry in rows:
        pblanc_id = field(entry, "pblancId", "seq")
        doc_path = DOCS_DIR / f"{pblanc_id}.txt"
        doc_text = doc_path.read_text(encoding="utf-8") if doc_path.exists() else ""

        reason = skip_reason(entry, doc_text)
        if reason:
            skipped.append((field(entry, "pblancNm", "title"), reason))
            continue

        notice, evidence = build_notice(entry, doc_text)

        if doc_text:
            with_text += 1
        else:
            without_text += 1

        print("=" * 70)
        print(f"{'공고문 O' if doc_text else '공고문 X'}  {notice['title'][:56]}")
        print(f"  기간   {notice.get('apply_period', '(없음)')}")
        if evidence:
            for line in evidence:
                print(f"  조건   {line}")
        else:
            print("  조건   (없음 — 모든 사용자가 '신청가능'으로 뜬다)")
        confirmed = [d for d in notice["documents"] if d["confidence"] == "confirmed"]
        print(f"  서류   {len(notice['documents'])}건"
              f"{' (공고문에서 확인 ' + str(len(confirmed)) + '건)' if confirmed else ' (전부 추정)'}")
        for doc in notice["documents"][:8]:
            mark = "확인" if doc["confidence"] == "confirmed" else "추정"
            print(f"          [{mark}] {doc['name']}")

        if not review_only:
            slug = re.sub(r"[^0-9A-Za-z가-힣]+", "_", notice["title"])[:40].strip("_")
            name = f"{pblanc_id}_{slug}.json"
            written.add(name)
            (OUT_DIR / name).write_text(
                json.dumps(notice, ensure_ascii=False, indent=1), encoding="utf-8")

    removed = sorted(stale - written)
    if not review_only:
        for name in removed:
            (OUT_DIR / name).unlink()

    print()
    print("=" * 70)
    if removed:
        print(f"이번에 걸러져서 지운 공고 {len(removed)}건")
        for name in removed:
            print(f"  · {name}")
        print()
    if skipped:
        print(f"제외한 공고 {len(skipped)}건")
        for title, reason in skipped:
            print(f"  · {title[:50]}")
            print(f"      {reason}")
        print()
    print(f"공고 {len(rows)}건 중 {len(rows) - len(skipped)}건 사용 "
          f"— 공고문 확보 {with_text}건 / 요약만 {without_text}건")
    if not review_only:
        print(f"저장 위치: {OUT_DIR.relative_to(ROOT)}")
        print("반드시 검사하세요:  python3 policy_data/validate.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
