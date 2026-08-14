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
SOSANG = re.compile(r"소상공인|자영업|점포|소공인|골목|상점가")


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


def fetch(**params) -> dict | list:
    params.setdefault("dataType", "json")
    params.setdefault("searchCnt", "0")  # 0 이면 전체
    params["crtfcKey"] = load_key()
    url = API_URL + "?" + urllib.parse.urlencode(params, encoding="utf-8")
    request = urllib.request.Request(url, headers={"User-Agent": "ai-hwaseong/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read().decode("utf-8", "replace")
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


def is_open(entry: dict) -> bool | None:
    """오늘 기준 신청 가능한지. 기간 표기가 없으면 None.

    문서에는 20260813 형식이라고 돼 있지만 실제 응답은 2026-08-13 이다.
    둘 다 받는다.
    """
    period = field(entry, "reqstBeginEndDe", "reqstDt")
    found = [d.replace("-", "") for d in re.findall(r"\d{4}-?\d{2}-?\d{2}", period)]
    if len(found) < 2:
        return None
    today = date.today().strftime("%Y%m%d")
    return found[0] <= today <= found[1]


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


def scope(entry: dict) -> str:
    """이 공고를 화성시 소상공인이 신청할 수 있는지 지역 범위로 판정한다.

    기업마당은 공고명 앞에 [경기] 처럼 시/도를 붙인다. 대괄호가 없으면
    중앙부처 공고라 전국 대상이다. [경기] 뒤에 다른 시군 이름이 붙으면
    (예: [경기] 시흥시 …) 그 시 주민만 신청할 수 있으므로 제외한다.
    """
    title = field(entry, "pblancNm", "title")
    match = BRACKET.match(title)
    if match is None:
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


def run_coverage() -> int:
    print("전체 공고를 받는 중… (건수가 많으면 시간이 걸립니다)")
    rows = items_of(fetch())
    if not rows:
        print("공고를 하나도 받지 못했습니다. --peek 으로 응답 구조를 확인하세요.")
        return 1

    sosang = [r for r in rows if SOSANG.search(haystack(r))]
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
