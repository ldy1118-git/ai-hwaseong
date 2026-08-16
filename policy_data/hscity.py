#!/usr/bin/env python3
"""화성시청 고시공고를 수집한다.

    python3 policy_data/hscity.py --pages 3     앞 3페이지만 (동작 확인용)
    python3 policy_data/hscity.py --all         전부 (946페이지 9,458건, 11분)
    python3 policy_data/hscity.py --coverage    수집 결과에서 소상공인 공고 세기

기업마당 API 가 주 소스이고 이건 보조다. 발표에서 "화성시청 고시공고
N건을 분석했다"고 말하려면 실제로 세어봐야 해서 만들었다.

robots.txt 는 /www/gosi/ 를 막지 않는다 (2026-08-16 확인).
공개 게시판이지만 남의 서버다. PAUSE 를 줄이지 말 것.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "policy_data" / "raw"

# q_notAncmtSeCode=04 가 없으면 페이지 번호를 줘도 계속 1페이지가 온다.
# 목록 폼(dataForm)의 hidden 필드라 눈에 안 띈다. 여기서 한참 헤맸다.
LIST_URL = ("https://www.hscity.go.kr/www/gosi/BD_selectGosiList.do"
            "?q_cp={page}&q_currPage={page}&q_notAncmtSeCode=04&q_sv=")
DETAIL_URL = ("https://www.hscity.go.kr/www/gosi/BD_selectGosiDetail.do"
              "?q_notAncmtMgtNo={notice_id}")

# 누가 긁는지 밝힌다. 공공 사이트에 익명으로 들어가지 않는다.
UA = {"User-Agent": "Mozilla/5.0 (AI-Hwaseong hackathon research; "
                    "contact via github.com/ldy1118-git)"}
PAUSE = 0.7

# 「대규모점포 개설계획 예고」는 유통산업발전법상 의무 공고다. 담당부서가
# 소상공인과라 SOSANG 의 '점포' 에 걸리지만, 신청해서 받는 지원사업이 아니다.
# 이걸 안 빼면 제목 검색 67건 중 50건이 대형마트 입점 예고가 된다.
STORE_NOTICE = re.compile(r"(대규모|준대규모)\s*점포")

ROW = re.compile(r"<tr[\s>](.*?)</tr>", re.S)
CELL = re.compile(r"<td[^>]*>(.*?)</td>", re.S)
LINK = re.compile(r"opGosiView\('(\d+)'\)")
TAG = re.compile(r"<[^>]+>")


def clean(html: str) -> str:
    text = TAG.sub("", html)
    for old, new in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                     ("&quot;", '"'), ("&nbsp;", " "), ("&#39;", "'")):
        text = text.replace(old, new)
    return " ".join(text.split())


def fetch(page: int) -> str:
    request = urllib.request.Request(LIST_URL.format(page=page), headers=UA)
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", "replace")


def parse(html: str) -> list[dict]:
    """목록 페이지 한 장에서 공고 행을 뽑는다."""
    body = re.search(r"<tbody>(.*?)</tbody>", html, re.S)
    if body is None:
        return []

    notices = []
    for row_html in ROW.findall(body.group(1)):
        cells = CELL.findall(row_html)
        if len(cells) < 5:
            continue
        found = LINK.search(row_html)
        notices.append({
            "notice_id": found.group(1) if found else None,
            "number": clean(cells[0]),
            "title": clean(cells[1]),
            "department": clean(cells[2]),
            "posted_at": clean(cells[3]),
            "period": clean(cells[4]),
        })
    return notices


def last_page() -> int:
    """페이징의 '마지막페이지로 가기' 가 가리키는 번호.

    범위를 넘긴 page 를 주면 마지막 페이지로 클램프되므로, 이 값이
    실제 끝인지 한 번 더 확인한다.
    """
    html = fetch(1)
    pages = [int(n) for n in re.findall(r"opSearch\((\d+)\)", html)]
    return max(pages) if pages else 1


def crawl(pages: int | None) -> list[dict]:
    total_pages = last_page()
    limit = total_pages if pages is None else min(pages, total_pages)
    print(f"마지막 페이지 {total_pages} · 이번에 받을 페이지 {limit}")

    seen: set[str] = set()
    notices: list[dict] = []

    for page in range(1, limit + 1):
        try:
            rows = parse(fetch(page))
        except Exception as error:
            print(f"  {page}페이지 실패: {error}", file=sys.stderr)
            continue

        fresh = [r for r in rows if r["notice_id"] not in seen]
        for row in fresh:
            seen.add(row["notice_id"])
        notices.extend(fresh)

        if not fresh:
            # 범위를 넘으면 마지막 페이지가 반복된다. 거기서 멈춘다.
            print(f"  {page}페이지부터 같은 내용 반복 — 여기서 끝")
            break

        if page % 50 == 0 or page == limit:
            print(f"  {page}/{limit} 페이지 · 누적 {len(notices)}건")
        time.sleep(PAUSE)

    return notices


def save(notices: list[dict]) -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    path = RAW_DIR / f"hscity_{date.today():%Y%m%d}.json"
    path.write_text(json.dumps(notices, ensure_ascii=False, indent=1),
                    encoding="utf-8")
    return path


def latest_snapshot() -> Path | None:
    files = sorted(RAW_DIR.glob("hscity_*.json"))
    return files[-1] if files else None


def run_coverage() -> int:
    sys.path.insert(0, str(ROOT / "policy_data"))
    from collect import SOSANG  # noqa: E402  같은 판정 기준을 쓴다

    path = latest_snapshot()
    if path is None:
        print("수집 결과가 없습니다. 먼저 --all 로 받으세요.")
        return 1

    notices = json.loads(path.read_text(encoding="utf-8"))
    hits = [n for n in notices if SOSANG.search(n["title"])]
    stores = [n for n in hits if STORE_NOTICE.search(n["title"])]
    support = [n for n in hits if not STORE_NOTICE.search(n["title"])]

    share = len(support) / len(notices) * 100
    print("=" * 64)
    print(f"화성시청 고시공고 커버리지  ({path.name})")
    print("=" * 64)
    print(f"  전체 고시공고               {len(notices):>6,}건")
    print(f"  제목에 소상공인 관련어       {len(hits):>6,}건")
    print(f"    ├ 점포 개설계획 예고      {len(stores):>6,}건  (지원사업 아님)")
    print(f"    └ 실제 지원사업          {len(support):>6,}건  ({share:.2f}%)")
    print()

    by_year: dict[str, int] = {}
    for notice in support:
        year = notice["posted_at"][:4]
        by_year[year] = by_year.get(year, 0) + 1
    if by_year:
        print("  지원사업 연도별")
        for year in sorted(by_year, reverse=True):
            print(f"    {year}  {by_year[year]:>3}건")
        print()
        print("  최근 10건")
        for notice in sorted(support, key=lambda n: n["posted_at"], reverse=True)[:10]:
            print(f"    {notice['posted_at']}  {notice['title'][:52]}")

    print()
    print("주의: 제목만 보고 센 하한값이다. 목록에 개요·대상이 없어서 본문으로")
    print("      판정할 수 없다. 「2022년 화성시 중소기업 운전자금 지원계획」처럼")
    print("      소상공인이 신청 대상인데 제목에 안 드러나는 공고는 빠진다.")
    print("      발표에서 인용할 때 이 점을 밝힐 것.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="화성시청 고시공고 수집")
    parser.add_argument("--pages", type=int, help="받을 페이지 수 (동작 확인용)")
    parser.add_argument("--all", action="store_true", help="전부 받는다")
    parser.add_argument("--coverage", action="store_true", help="수집 결과 집계")
    args = parser.parse_args()

    if args.coverage:
        return run_coverage()

    if not args.all and not args.pages:
        parser.print_help()
        print()
        print("처음이면 --pages 3 으로 동작부터 확인하세요.")
        return 0

    notices = crawl(None if args.all else args.pages)
    path = save(notices)
    print()
    print(f"공고 {len(notices):,}건 저장 → {path.relative_to(ROOT)}")
    print("집계:  python3 policy_data/hscity.py --coverage")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
