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
from collect import field, haystack, is_open, is_sosang, scope, SOSANG, USABLE  # noqa: E402
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
    # 달로 적는 공고가 많다. 화성시 소상공인 자금지원사업이 그렇다 —
    # 「개업일 및 사업자등록일부터 2개월 이상 경과한 사업자」. 해가 아니라
    # 달로 끊는 조건은 갓 문 연 사장님에게 걸리는 유일한 문턱인데
    # 「N년 이상」만 보고 있어서 통째로 놓쳤다.
    match = re.search(
        r"(?:업력|개업일|사업자\s*등록일|창업일)[^\n]{0,40}?(\d+)\s*개월\s*이상", text)
    if match:
        return "min_business_months", int(match.group(1)), match.group(0)
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
    # 「영업 중」 말고 「사업 중인 자」, 「사업을 영위 중인」으로 쓰는 공고가
    # 많다. 화성시 공고가 대체로 그렇다.
    if re.search(r"휴\s*[·․‧,]?\s*폐업|휴업|폐업|정상\s*영업|영업\s*중|"
                 r"사업\s*중인|사업을?\s*(?:영위|운영)\s*(?:중|하고)", text):
        found = re.search(r"[^\n]{0,50}(?:휴업|폐업|정상\s*영업|영업\s*중|사업\s*중인|"
                          r"사업을?\s*(?:영위|운영)\s*(?:중|하고))[^\n]{0,50}", text)
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


# 표준산업분류 이름은 자격이 아니다.
#   「숙박 및 음식점업」  대분류 I
#   「음식점 및 주점업」  중분류 56
# 이 말이 나오는 자리는 대개 매출 기준표이거나 지원 제외 업종 목록이다.
# 그런데 rule_food 가 그걸 「음식점 전용 공고」로 읽어서 이렇게 됐다.
#
#   반도체 소부장기업 실증   → 음식점 전용 (음식점 사장님에게 100점으로 1위)
#   벤처인증 비용 지원       → 음식점 전용 (그 줄에 「(신청 불가)」라고 적혀 있다)
#   소상공인 고용보험료 지원  → 음식점 전용 (소매업 사장님에게는 대상아님으로 숨었다)
#
# 마지막 것이 제일 나쁘다. 진짜 소상공인 공고인데 업종을 잘못 묶어서
# 음식점이 아닌 사장님에게 통째로 안 보였다.
KSIC_FOOD = re.compile(r"숙박\s*및\s*음식점업|음식점\s*및\s*주점업")
FOOD = re.compile(r"식품접객업|음식점|외식업")


def rule_food(text: str):
    # 분류표 이름을 지우고 나서 본다. 지운 자리에 진짜 자격 문구가 따로
    # 있으면 그건 그대로 잡힌다.
    text = KSIC_FOOD.sub("", text)
    if FOOD.search(text):
        found = re.search(r"[^\n]{0,40}(?:식품접객업|음식점|외식업)[^\n]{0,40}", text)
        return "categories", ["음식점"], found.group(0).strip()
    return None


def rule_entity_type(text: str):
    """개인사업자만 / 법인사업자만.

    비즈플러스카드는 「소상공인(개인사업자)」과 「소상공인(법인사업자)」가
    각각 따로 공고로 나온다. 그런데 본문 자격 섹션에는 그 말이 없고 제목에만
    있어서, 조건이 안 잡혀 개인사업자에게 법인용 공고까지 같이 떴다.
    이름이 거의 같은 두 건이 나란히 서니 어느 게 내 것인지 알 수가 없다.

    「개인 및 법인」처럼 둘 다 되는 경우가 있어서 한쪽만 나올 때만 잡는다.
    """
    has_personal = re.search(r"개인\s*사업자", text)
    has_corp = re.search(r"법인\s*사업자", text)
    if has_personal and not has_corp:
        return "entity_types", ["개인"], has_personal.group(0)
    if has_corp and not has_personal:
        return "entity_types", ["법인"], has_corp.group(0)
    return None


# 지원대상이 우리 사용자가 될 수 없는 업종을 콕 집은 경우.
#
# 아래 `if not eligibility:` 는 **규칙이 하나라도 걸리면 통째로 건너뛴다.**
# 그래서 반도체 소부장 실증 공고가 「운영중 + 화성시」 두 조건만 달고 나갔고,
# 카페 사장님 홈 화면 1위에 89점 신청가능으로 떴다. 지원대상에는 「화성시
# 관내 반도체 소·부·장 중소·중견기업」이라고 똑똑히 적혀 있었는데도.
#
# classify_target 을 그대로 쓰면 안 된다. 83건 중 76건이 restricted 로
# 나와서 거의 전부 확인필요가 된다 — 「소상공인기본법 제2조에 따른
# 소상공인」도 restricted 로 센다. 그건 제한이 아니라 그냥 소상공인이다.
#
# 그래서 업종을 못 박은 말만 본다. 걸리면 대상아님이 아니라 **확인필요**다.
# 목록에서 지우지 않고 이유를 붙여 내린다 — 제조업 겸업이면 될 수도 있다.
INDUSTRY_ONLY = re.compile(
    r"제조업(?:체|자|사)?|제조\s*기업|제조\s*및\s*수입업체|"
    r"소재[·ㆍ]?\s*부품[·ㆍ]?\s*장비|소[·ㆍ]\s*부[·ㆍ]\s*장|"
    r"반도체|바이오|로봇|모빌리티|이차전지|뿌리산업|"
    r"가맹본부|디자이너\s*브랜드|콘텐츠\s*상품|"
    # 업종은 아니지만 같은 이유로 넣는다 — 조례가 정한 기업 유형이라
    # 그냥 카페를 하는 사장님은 해당되지 않는다. 협동조합으로 운영하는
    # 카페면 될 수도 있어서 대상아님이 아니라 확인필요다.
    r"사회적경제기업|사회적기업|협동조합|마을기업|자활기업")


RULES = [
    rule_entity_type,
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
NOT_SOSANG = re.compile(r"여성\s*농업인|농업경영체|농업인|재직자|영농|어업인|"
                       r"GAP\s*(?:인증|안정성)|농산물\s*우수관리")


# ── 지원대상 표기 ───────────────────────────────────────────────
#
# 기업마당 API 요약(bsnsSumryCn)은 형식이 고정돼 있다.
#
#     <사업 설명>  ☞  <지원대상>  ☞  <지원내용>
#
# 27건 전부 이 형식이었다. 첫 ☞ 뒤가 지원대상이고, 여기에 대상이 그대로
# 적혀 있다. 우리는 이걸 여태 안 읽어서 27건 중 19건을 "요건을 확인하지
# 못했습니다"로 깔아두고 있었다.
#
# 읽는 목적은 두 가지다.
#   1. 대상이 "소상공인" 뿐이면 → 조건이 없는 게 맞다. 신청가능으로 올린다.
#   2. 제한이 붙어 있으면 → 확인필요로 두되, 무슨 제한인지 원문을 보여준다.
#      "확인하지 못했습니다"보다 "중소 제조업체만"이 훨씬 쓸모 있다.


def support_target(api_summary: str) -> str:
    """API 요약에서 지원대상 문장만 잘라온다. 없으면 빈 문자열."""
    parts = (api_summary or "").split("☞")
    return parts[1].strip() if len(parts) >= 2 else ""


# 화면에 그대로 뜨는 문장이라 길면 곤란하다. 대시보드 매칭이유 한 줄에
# 들어가야 한다. 잘려도 "무슨 제한이 있는지"는 앞부분에 나온다. 전문은
# 공고 상세의 요약에 그대로 있다.
TARGET_MAX_LEN = 120


def shorten_target(target: str) -> str:
    """표시용으로 줄인다. 판정(classify_target)은 반드시 원문으로 할 것 —
    줄인 뒤에는 뒤쪽의 ① 같은 제한 신호가 사라져서 잘못 통과시킨다."""
    if len(target) <= TARGET_MAX_LEN:
        return target
    cut = max(target.rfind(mark, 0, TARGET_MAX_LEN) for mark in (" - ", " ※ ", ", ", " "))
    if cut < TARGET_MAX_LEN // 2:
        cut = TARGET_MAX_LEN
    return target[:cut].rstrip(" ,-※") + "…"


# 지원대상에 이 말이 있으면 전 소상공인 대상이 아니다.
#
# 넓게 잡는 쪽이 안전하다. 놓치면 신청가능이어야 할 게 확인필요로 남을
# 뿐이지만, 잘못 통과시키면 대상이 아닌 사장님을 헛걸음시킨다.
TARGET_RESTRICTED = re.compile(
    r"제조|섬유|가죽|화학|공장|생산|"            # 업종을 한정한다
    r"지원을?\s*받은|선정된|참여한|"             # 기존 사업 참여 이력을 요구한다
    r"공고문\s*참[조고]|자세한\s*지원\s*대상|"   # 스스로 "조건이 더 있다"고 말한다
    r"농어민|농업|어업|"                        # 우리 사용자가 아니다
    r"[①②③④]"                                # 항목이 나뉘면 조건이 더 붙어 있다
)

# 제목에 이 지역이 박혀 있으면 그 지역 사업이다.
#
# 지원대상에는 "소상공인"이라고만 적혀 있어도, 실제로는 그 지역 시설을
# 써야 하는 사업인 경우가 있다. 소담스퀘어 광주·강원·전주·경북 4건이
# 그렇다. 화성시 사장님에게 "신청가능"이라고 띄우면 헛걸음이다.
#
# scope() 를 고치지 않는다. 그건 수집 대상 자체를 바꿔서 공고 수가 줄 수
# 있다. 여기서는 "신청가능으로 올릴지"만 판단한다.
OTHER_REGION = re.compile(
    r"서울|부산|대구|인천|광주|대전|울산|세종|강원|충북|충남|전북|전남|"
    r"경북|경남|제주|전주|청주|천안|창원|포항|김해|목포|여수|순천|춘천|원주|강릉"
)

# 지원대상 문장이 이보다 길면 뒤에 조건이 더 붙어 있다고 본다.
# 실제로 순수한 대상 표기는 "「소상공인기본법」 제2조에 따른 소상공인"
# 정도가 제일 길었다(29자).
TARGET_PLAIN_LEN = 60


def classify_target(target: str, title: str) -> str:
    """지원대상 표기를 'open'(전 소상공인) 또는 'restricted'(제한 있음)로."""
    if not target:
        return "restricted"
    if TARGET_RESTRICTED.search(target):
        return "restricted"
    if len(target) > TARGET_PLAIN_LEN:
        return "restricted"
    if "화성" not in title and OTHER_REGION.search(title):
        return "restricted"
    return "open"


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
    entry_title = field(entry, "pblancNm")

    qualify = section(doc_text, QUALIFY_HEADS) if doc_text else ""
    exclude = section(doc_text, EXCLUDE_HEADS, span=800) if doc_text else ""
    doc_section = section(doc_text, DOCUMENT_HEADS, span=900) if doc_text else ""

    # 자격은 본문 자격 섹션 + 제외 섹션 + API 요약을 **모두** 같이 본다.
    #
    # 예전에는 본문이 있으면 API 요약을 아예 안 봤다(`... or summary_api`).
    # 그런데 본문 자격 섹션에 없는 조건이 API 요약에는 적혀 있는 경우가 있다.
    # "찾아가는 1:1 디지털 교육"이 그랬다 — 요약에만 "정상적으로 영업 중인
    # 점포"라고 적혀 있어서, 본문이 있다는 이유로 그 조건을 통째로 놓쳤다.
    # 제목도 같이 본다. 「소상공인(개인사업자) 비즈플러스카드」처럼 대상이
    # 제목에만 적히고 본문 자격 섹션에는 없는 공고가 있다.
    basis = "\n".join([entry_title, qualify, exclude, summary_api]).strip()
    eligibility, evidence = build_eligibility(basis)

    # 규칙에 하나도 안 걸렸으면 지원대상 표기를 본다.
    #
    # 예전에는 여기서 전부 "확인 필요"로 깔았다. 요건이 진짜 없는 공고와
    # 요건이 있는데 못 읽은 공고를 구분할 방법이 없었기 때문이다. 그래서
    # 27건 중 19건이 프로필과 무관하게 확인필요로 나왔다 — 열에 일곱이
    # "모르겠습니다"면 매칭 서비스라고 할 수 없다.
    #
    # 이제 구분할 수 있다. API 요약의 `☞ 지원대상` 이 대상을 그대로 적어준다.
    #
    #   "소상공인이라면 누구나"          → 조건이 없는 게 맞다. 신청가능.
    #   "중소 제조업체"                  → 제한이 있다. 확인필요 + 사유 표시.
    #
    # 애매하면 확인필요 쪽으로 둔다. 놓치면 신청가능이어야 할 게 확인필요로
    # 남을 뿐이지만, 잘못 통과시키면 대상이 아닌 사장님을 헛걸음시킨다.
    if not eligibility:
        target = support_target(summary_api)
        kind = classify_target(target, field(entry, "pblancNm", "title"))
        if kind == "open":
            eligibility["requirements_open"] = shorten_target(target)
            evidence.append(f"requirements_open  ← 지원대상 “{target}”")
        else:
            eligibility["requirements_unknown"] = shorten_target(target) or (
                "공고문에서 자격 요건을 확인하지 못했습니다. 문의처로 확인해주세요"
            )
            evidence.append(
                f"requirements_unknown  ← 지원대상 “{target[:50]}”" if target else
                "requirements_unknown  ← 규칙에 걸린 요건 없고 지원대상 표기도 없음"
                + ("" if doc_text else " (첨부 본문도 없음 — 스캔·HWP)")
            )

    # 규칙이 걸려서 위 블록을 건너뛴 공고도 지원대상은 한 번 본다.
    # 업종이 못 박혀 있으면 확인필요로 내린다. 자세한 사정은 INDUSTRY_ONLY 에.
    if not eligibility.get("categories"):
        target = support_target(summary_api)
        narrow = INDUSTRY_ONLY.search(target or "")
        if narrow:
            # requirements_open 을 걷어낸다. classify_target 이 「사회적경제기업」
            # 을 open 으로 봤는데, matching 은 open 을 먼저 읽어서 신청가능이
            # 된다. 업종·기업유형이 못 박힌 것이 더 구체적인 증거다.
            eligibility.pop("requirements_open", None)
            eligibility["requirements_unknown"] = shorten_target(target)
            evidence.append(
                f'requirements_unknown  ← 지원대상이 「{narrow.group(0)}」 로 대상을 한정')

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
    # 날짜가 없으면 원문 문구를 그대로 남긴다. "예산 소진시까지" 는
    # 사장님에게 필요한 정보인데, 날짜가 아니라는 이유로 지우면 화면에
    # 아무것도 안 뜨고 마감이 임박한 것처럼 보인다.
    if not notice["apply_period"]:
        raw_period = clean(period)
        notice["apply_period"] = {"note": raw_period} if raw_period else None
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

    # 화성시청 고시공고를 같이 싣는다.
    #
    # 기업마당에 안 올라오는 화성시 전용 사업이 여기 있다 — 소상공인
    # 자금지원사업(특례보증 5천만원 + 이차보전 2% 5년)과 저신용 소상공인
    # 미소금융 이자지원. 둘 다 지금 열려 있는데 목록에 없었다.
    #
    # policy_data/hscity.py --support 가 기업마당과 같은 열쇠로 맞춰서
    # 넣어둔다. 여기서는 그냥 이어 붙이면 된다.
    hscity = ROOT / "policy_data" / "hscity_support.json"
    if hscity.exists():
        extra = json.loads(hscity.read_text(encoding="utf-8"))
        rows += extra
        print(f"화성시청 고시공고 {len(extra)}건 합침")
    else:
        print("화성시청 고시공고 없음 — python3 policy_data/hscity.py --support 로 받는다")
    # is_open 이 None 이면 "판단할 근거가 없다"는 뜻이지 "닫혔다"가 아니다.
    # 예전에는 None 을 falsy 로 흘려버려서, 기간이 "예산 소진시까지" 나
    # "세부사업별 상이" 로 적힌 공고 31건이 통째로 빠졌다. 그 안에
    # 희망리턴패키지(폐업·재기)와 소상공인 고용보험료 지원이 있었다.
    # 확실히 닫힌 것(False)만 걸러낸다 — 모른다는 이유로 자르면 사장님이
    # 그 공고를 아예 못 본다. 공고 매칭·세무일정과 같은 원칙이다.
    rows = [r for r in rows
            if is_sosang(r) and scope(r) in USABLE
            and is_open(r) is not False]

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
