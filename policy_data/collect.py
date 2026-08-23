#!/usr/bin/env python3
"""기업마당 지원사업정보 API 에서 공고를 가져온다.

    python3 policy_data/collect.py --coverage    화성시 공고가 몇 건인지 측정
    python3 policy_data/collect.py --raw         받은 원본을 raw/ 에 저장
    python3 policy_data/collect.py --peek        응답 구조만 확인 (첫 실행 때)

인증키는 저장소에 넣지 않는다. 아래 중 하나로 준다.
    - 환경변수 BIZINFO_API_KEY
    - 저장소 루트의 .env 파일에 BIZINFO_API_KEY=... (gitignore 됨)

지역 해시태그는 시/도 단위까지만 있다. '경기'는 되지만 '화성'은 없어서
경기 전체를 받아 공고명·개요에서 걸러내야 한다.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "policy_data" / "raw"

API_URL = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do"

# 우리가 관심 있는 분야. 소상공인 지원은 대부분 금융·창업·경영·내수에 걸린다.
FIELDS = {
    "01": "금융", "02": "기술", "03": "인력", "04": "수출",
    "05": "내수", "06": "창업", "07": "경영", "09": "기타",
}

HWASEONG = re.compile(r"화성")
# 「영세」에 부정형 lookahead 를 둔 이유는 영세율(수출 부가세 0%)이다.
# 그건 소상공인과 아무 상관이 없는데 세무·수출 공고에 흔하게 나온다.
#
# 소기업·중소기업·창업기업은 일부러 안 넣었다. 재봤더니 각각 346·346·37건이
# 새로 걸리는데 「중소기업(소기업 포함)」 같은 상투구라 거의 다 해외전시회·
# 원전·레미콘이었다. 공고가 58건에서 400건을 넘어가면 사장님이 목록을 못 읽는다.
SOSANG = re.compile(r"소상공인|자영업|점포|소공인|골목|상점가|개인사업자|영세(?!율)")


def load_key() -> str:
    key = os.environ.get("BIZINFO_API_KEY", "").strip()
    if key:
        return key
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("BIZINFO_API_KEY="):
                return line.split("=", 1)[1].strip().strip("'\"")
    print("인증키가 없습니다.", file=sys.stderr)
    print(f"  {ROOT / '.env'} 에 BIZINFO_API_KEY=... 를 넣거나", file=sys.stderr)
    print("  export BIZINFO_API_KEY=... 로 넘겨주세요.", file=sys.stderr)
    print("  키 발급: https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi", file=sys.stderr)
    raise SystemExit(1)


# 기업마당은 해외 IP 에서 자주 끊긴다. GitHub Actions 러너(Azure US/EU)에서
# 타임아웃이 났고, 같은 시각 국내 서버에서는 0.15 초에 응답했다.
# 완전 차단은 아니고 간헐적이라 몇 번 다시 시도하면 대개 붙는다.
RETRIES = 4
BACKOFF = 15  # 초. 15 → 30 → 45 로 늘려가며 기다린다


def fetch(**params) -> dict | list:
    params.setdefault("dataType", "json")
    params.setdefault("searchCnt", "0")  # 0 이면 전체
    params["crtfcKey"] = load_key()
    url = API_URL + "?" + urllib.parse.urlencode(params, encoding="utf-8")
    request = urllib.request.Request(url, headers={"User-Agent": "ai-hwaseong/1.0"})

    body = None
    for attempt in range(1, RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                body = response.read().decode("utf-8", "replace")
            break
        except Exception as error:
            if attempt == RETRIES:
                print(f"기업마당 접속 실패 ({RETRIES}번 시도): {error}", file=sys.stderr)
                print("해외 IP 에서 막힐 수 있습니다. 국내에서 실행하면 대개 됩니다.",
                      file=sys.stderr)
                raise SystemExit(1)
            wait = BACKOFF * attempt
            print(f"  {attempt}번째 실패({error}). {wait}초 뒤 다시 시도합니다.",
                  file=sys.stderr)
            time.sleep(wait)
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        print("JSON 이 아닌 응답이 왔습니다. 앞부분:", file=sys.stderr)
        print(body[:600], file=sys.stderr)
        raise SystemExit(1)


def items_of(payload) -> list[dict]:
    """응답에서 공고 목록을 꺼낸다. 껍데기 키 이름이 문서에 없어서 넓게 받는다."""
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in ("jsonArray", "item", "items", "list", "data", "result"):
            value = payload.get(key)
            if isinstance(value, list):
                return [x for x in value if isinstance(x, dict)]
            if isinstance(value, dict):
                inner = items_of(value)
                if inner:
                    return inner
        # 못 찾으면 리스트를 담은 값 아무거나
        for value in payload.values():
            if isinstance(value, list) and value and isinstance(value[0], dict):
                return value
    return []


def field(entry: dict, *names: str) -> str:
    for name in names:
        value = entry.get(name)
        if value:
            return str(value)
    return ""


def haystack(entry: dict) -> str:
    return " ".join([
        field(entry, "pblancNm", "title"),
        field(entry, "bsnsSumryCn", "description"),
        field(entry, "jrsdInsttNm", "author"),
        field(entry, "excInsttNm"),
        field(entry, "trgetNm"),
        field(entry, "hashtags", "hashTags"),
    ])


# 기간 칸에 날짜 대신 들어오는 문구. 전부 "지금 신청할 수 있다"는 뜻이다.
#
# 이걸 몰라서 화성시민이 신청 가능한 소상공인 공고 62건 중 31건을 통째로
# 흘리고 있었다. 그중에 희망리턴패키지(폐업·재기), 소상공인 고용보험료,
# 영세개인사업자 체납액 징수특례가 들어 있다. 폐업하는 사장님에게 제일
# 급한 것들인데 "예산 소진시까지" 라고 적혀 있다는 이유로 빠졌다.
ALWAYS_OPEN = re.compile(
    r"예산\s*소진|소진\s*시|상시\s*(?:접수|모집)?|연중|"
    r"모집\s*(?:완료|마감)\s*시|재원\s*소진"
)


def is_open(entry: dict) -> bool | None:
    """오늘 기준 신청 가능한지. 판단할 근거가 없으면 None.

    문서에는 20260813 형식이라고 돼 있지만 실제 응답은 2026-08-13 이다.
    2020.01.01 처럼 점으로 쓰인 것도 있다. 셋 다 받는다.

    날짜가 아니라 문구로 적힌 것이 많다. "예산 소진시까지", "상시 접수"
    같은 것은 **지금 열려 있다는 뜻**이므로 True 다. 반대로 "세부사업별
    상이" 는 알 수 없으니 None 으로 둔다 — 여기서 False 를 주면 안 된다.
    모른다는 이유로 잘라내면 사장님이 그 공고를 통째로 못 본다.
    """
    period = field(entry, "reqstBeginEndDe", "reqstDt")
    found = [re.sub(r"[-.]", "", d)
             for d in re.findall(r"\d{4}[-.]?\d{2}[-.]?\d{2}", period)]
    if len(found) >= 2:
        today = date.today().strftime("%Y%m%d")
        return found[0] <= today <= found[1]
    if ALWAYS_OPEN.search(period):
        return True
    return None


def run_peek() -> int:
    payload = fetch(searchCnt="5")
    print("=== 응답 최상위 구조 ===")
    if isinstance(payload, dict):
        for key, value in payload.items():
            kind = type(value).__name__
            size = f" ({len(value)}개)" if isinstance(value, (list, dict)) else ""
            print(f"  {key}: {kind}{size}")
    else:
        print(f"  최상위가 {type(payload).__name__}")

    rows = items_of(payload)
    print(f"\n=== 공고 {len(rows)}건 인식 ===")
    if rows:
        print("첫 건의 필드:")
        for key, value in rows[0].items():
            text = str(value).replace("\n", " ")[:70]
            print(f"  {key:24} {text}")
    return 0


BRACKET = re.compile(r"\s*\[([^\]]+)\]")
SIGUNGU = re.compile(r"\s*([가-힣]+[시군구])")

# 화성시 소상공인이 신청할 수 있는 범위
USABLE = {"전국", "화성", "경기전체"}

# 광역지자체가 소관인 공고는 그 지역 주민·사업자만 신청할 수 있다.
# 기업마당이 제목에 [부산] 같은 표시를 항상 붙여주지는 않기 때문에
# (실제로 5건이 표시 없이 들어왔다) 소관기관 이름으로 한 번 더 본다.
GWANGYEOK = {
    "서울": "서울", "부산": "부산", "대구": "대구", "인천": "인천",
    "광주": "광주", "대전": "대전", "울산": "울산", "세종": "세종",
    "강원": "강원", "충청북": "충북", "충북": "충북",
    "충청남": "충남", "충남": "충남",
    "전라북": "전북", "전북": "전북", "전라남": "전남", "전남": "전남",
    "경상북": "경북", "경북": "경북", "경상남": "경남", "경남": "경남",
    "제주": "제주",
}

# 광역지자체 소관이어도 일부 과제는 전국에서 신청할 수 있다.
# 예: 부산 홍보영상 지원 — "매장영상은 부산 사업자만, 제품영상은 전국 가능".
# 이런 문구가 있으면 지역 전용으로 잘라내지 않는다. 자르면 화성 소상공인이
# 실제로 신청 가능한 과제까지 같이 사라진다.
NATIONWIDE_HINT = re.compile(
    r"전국\s*(?:의\s*)?소상공인|국내에\s*사업자를\s*둔[^\n]{0,20}모두|"
    r"지역\s*제한\s*없|거주지\s*무관")


# 경기도 31개 시·군에서 화성만 뺀 것. 제목에 이 이름이 있으면 그 지역
# 주민만 신청할 수 있다. 대괄호 표기가 없는 공고를 걸러내는 데 쓴다.
GYEONGGI_OTHER = re.compile(
    r"(수원시|성남시|고양시|용인시|부천시|안산시|안양시|남양주시|평택시|시흥시|"
    r"파주시|의정부시|김포시|광주시|광명시|군포시|하남시|오산시|양주시|이천시|"
    r"구리시|안성시|포천시|의왕시|여주시|양평군|동두천시|과천시|가평군|연천군)")


def jurisdiction_region(entry: dict) -> str | None:
    """소관기관이 광역지자체면 그 지역 이름을, 아니면 None을 돌려준다.

    중앙부처(중소벤처기업부 등) 소관이면 None이다. 수행기관은 보지 않는다.
    소담스퀘어처럼 중앙부처 사업을 지역 기관이 대행하는 경우가 있어서,
    수행기관까지 보면 전국 사업을 지역 전용으로 잘못 자른다.
    """
    organizer = field(entry, "jrsdInsttNm", "author")
    if not organizer or "부" in organizer[-1:]:  # 중소벤처기업부 등
        return None
    for keyword, name in GWANGYEOK.items():
        if keyword in organizer:
            return name
    return None


def scope(entry: dict) -> str:
    """이 공고를 화성시 소상공인이 신청할 수 있는지 지역 범위로 판정한다.

    기업마당은 공고명 앞에 [경기] 처럼 시/도를 붙인다. 대괄호가 없으면
    중앙부처 공고라 전국 대상이다. [경기] 뒤에 다른 시군 이름이 붙으면
    (예: [경기] 시흥시 …) 그 시 주민만 신청할 수 있으므로 제외한다.

    대괄호를 믿기만 하면 안 된다. 표시 없이 들어오는 지역 공고가 있어서
    소관기관도 같이 본다.
    """
    title = field(entry, "pblancNm", "title")
    match = BRACKET.match(title)
    if match is None:
        if "화성" in title:
            return "화성"
        # 대괄호가 없어도 제목 안에 다른 시·군 이름이 있으면 그 지역
        # 전용이다. 실제로 「2026년 과천시 중소기업 및 소상공인 육성자금」
        # 이 대괄호도 없고 소관기관도 "경기도" 로만 적혀 있어서 전국으로
        # 새어 들어왔다. 화성시민은 신청할 수 없는 공고다.
        other = GYEONGGI_OTHER.search(title)
        if other:
            return f"경기-타지역({other.group(1)})"
        region = jurisdiction_region(entry)
        if region and not NATIONWIDE_HINT.search(haystack(entry)):
            return f"타시도({region})"
        return "전국"
    tag = match.group(1).strip()
    if "화성" in title:
        return "화성"
    if tag == "경기":
        rest = title.split("]", 1)[1]
        city = SIGUNGU.match(rest)
        if city and "화성" not in city.group(1):
            return f"경기-타지역({city.group(1)})"
        return "경기전체"
    return f"타시도({tag})"


def is_sosang(entry: dict) -> bool:
    """이 공고를 우리 서비스에 실을 것인가.

    **화성시 공고는 낱말을 안 따진다.** 기업마당에 올라온 화성시 공고 17건
    중 「소상공인」 계열 낱말이 든 것은 3건뿐이었다. 나머지는 「중소기업
    운전자금」, 「중소기업 특례보증」처럼 적혀 있는데, 시가 직접 하는
    자금·보증 사업은 관내 소상공인이 주 대상이다. 실제로 최종 58건에
    자금·보증 공고가 한 건도 없었다 — 사장님에게 제일 급한 것이 돈인데.

    무관한 것이 같이 들어오는 건 감수한다. 반도체 소부장이나 GAP 같은 것은
    extract.py 의 NOT_SOSANG 과 매칭 엔진이 「대상아님」으로 내려서 목록
    아래로 간다. 모른다는 이유로 자르면 사장님이 그 공고를 아예 못 본다 —
    is_open 이 None 을 살려두는 것과 같은 원칙이다.
    """
    if scope(entry) == "화성":
        return True
    return bool(SOSANG.search(haystack(entry)))


def run_coverage() -> int:
    print("전체 공고를 받는 중… (건수가 많으면 시간이 걸립니다)")
    rows = items_of(fetch())
    if not rows:
        print("공고를 하나도 받지 못했습니다. --peek 으로 응답 구조를 확인하세요.")
        return 1

    sosang = [r for r in rows if is_sosang(r)]
    usable = [r for r in sosang if scope(r) in USABLE]
    open_now = [r for r in usable if is_open(r)]
    hwaseong_only = [r for r in sosang if scope(r) == "화성"]

    print()
    print("=" * 64)
    print("커버리지")
    print("=" * 64)
    print(f"  전체 공고                    {len(rows):5}건")
    print(f"  소상공인 관련                 {len(sosang):5}건")
    print(f"  ├ 화성시 전용                {len(hwaseong_only):5}건   ← 이것만으론 서비스가 안 된다")
    print(f"  └ 화성시민이 신청 가능        {len(usable):5}건   (전국 + 경기전체 + 화성)")
    print(f"     그중 현재 접수중          {len(open_now):5}건   ← 실제 서비스 모수")

    counts: dict[str, int] = {}
    for entry in sosang:
        key = scope(entry)
        counts[key] = counts.get(key, 0) + 1
    print()
    print("소상공인 공고의 지역 분포 (상위 10)")
    for key, count in sorted(counts.items(), key=lambda kv: -kv[1])[:10]:
        mark = "○" if key in USABLE else "·"
        print(f"  {mark} {key:22} {count:4}건")

    print()
    print("=" * 64)
    print(f"지금 신청할 수 있는 공고 {len(open_now)}건")
    print("=" * 64)
    for entry in open_now:
        print(f"  [{scope(entry):6}] {field(entry, 'reqstBeginEndDe', 'reqstDt')[:23]:23} "
              f"{field(entry, 'pblancNm', 'title')[:54]}")
    return 0


def run_raw() -> int:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    rows = items_of(fetch())
    stamp = date.today().strftime("%Y%m%d")
    path = RAW_DIR / f"bizinfo_{stamp}.json"
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(rows)}건 저장: {path.relative_to(ROOT)}")
    print("요건 추출 전 원본이다. 이걸 그대로 notices/ 에 넣지 말 것 —")
    print("policy_data/schema.md 형식으로 바꾸고 validate.py 를 통과시켜야 한다.")
    return 0


def main() -> int:
    args = sys.argv[1:]
    if "--peek" in args:
        return run_peek()
    if "--raw" in args:
        return run_raw()
    if "--coverage" in args or not args:
        return run_coverage()
    print(__doc__)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
