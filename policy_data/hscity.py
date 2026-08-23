#!/usr/bin/env python3
"""화성시청 고시공고를 수집한다.

    python3 policy_data/hscity.py --pages 3     앞 3페이지만 (동작 확인용)
    python3 policy_data/hscity.py --all         전부 (946페이지 9,458건, 11분)
    python3 policy_data/hscity.py --coverage    수집 결과에서 소상공인 공고 세기
    python3 policy_data/hscity.py --support     소상공인 지원사업만 상세까지 (매일 이것)

기업마당 API 가 주 소스이고 이건 보조다. 처음에는 발표에서 "화성시청
고시공고 N건을 분석했다"고 말하려고 세는 용도로 만들었는데, 세어보니
**기업마당에 안 올라오는 화성시 소상공인 전용 사업**이 여기 있었다.
화성시 소상공인 자금지원사업(특례보증 5천만원 + 이차보전 2% 5년)과
저신용 소상공인 미소금융 이자지원이 그것이다. --support 가 그걸 받는다.

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


# ── 지원사업만 골라 상세까지 ────────────────────────────────────
#
# 목록에는 제목·부서·기간뿐이라 자격요건이 없다. 다행히 상세 페이지의
# 「내용」 칸에 본문이 그대로 들어 있다 — 첨부 .hwp 를 안 열어도 된다.
#
#   5. 지원대상 : 「소상공인 보호 및 지원에 관한 법률」에 따른 소상공인 중
#      화성시 관내에 사업장을 두고, 사업자등록증 상 개업일 및 사업자등록일
#      부터 2개월 이상 경과한 사업자로서 신청일 현재 사업 중인 자
#
# 이걸 기업마당 모양으로 옮겨두면 extract.py 가 그대로 읽는다.
#
# **왜 필요한가.** 화성시 소상공인 자금지원사업(특례보증 5천만원 + 이차보전
# 2% 5년)과 저신용 소상공인 미소금융 이자지원은 기업마당에 안 올라온다.
# 이름 그대로 화성시 소상공인 전용인데 서비스에 없었다.

# raw/ 가 아니라 그 밖에 둔다. raw/ 는 gitignore 되는데, 이 파일은
# **저장소에 있어야 한다.** cron 은 전용 클론에서 reset --hard 로 시작해서,
# 여기 없으면 매일 첫 실행처럼 앞 몇 장만 보고 1월에 뜬 자금지원사업을
# 통째로 놓친다. 원본이 아니라 가공된 목록이라 raw/ 도 아니다.
STORE = ROOT / "policy_data" / "hscity_support.json"

DETAIL_TABLE = re.compile(r'(?is)<div class="board_write.*?</table>')
TH_TD = re.compile(r"(?is)<th[^>]*>\s*(.*?)\s*</th>\s*<td[^>]*>(.*?)</td>")

# 본문의 항목 이름. 「사 업 명」처럼 글자 사이를 띄운 표기가 흔하다.
BODY_LABEL = re.compile(
    r"\d?\s*[.)]?\s*("
    r"사\s*업\s*명|지\s*원\s*내\s*용|지\s*원\s*규\s*모|"
    r"사\s*업\s*기\s*간|신\s*청\s*기\s*간|접\s*수\s*기\s*간|"
    r"지\s*원\s*대\s*상|신\s*청\s*대\s*상|운\s*영\s*기\s*관|"
    r"신\s*청\s*방\s*법|제\s*출\s*서\s*류|문\s*의|붙\s*임"
    r")\s*:?\s*")


def fetch_detail(notice_id: str) -> dict:
    """상세 표의 th/td 를 뽑는다. 표가 여럿이라 board_write 안쪽만 본다."""
    request = urllib.request.Request(DETAIL_URL.format(notice_id=notice_id), headers=UA)
    with urllib.request.urlopen(request, timeout=30) as response:
        page = response.read().decode("utf-8", "replace")
    table = DETAIL_TABLE.search(page)
    if table is None:
        return {}
    return {clean(th): clean(td) for th, td in TH_TD.findall(table.group(0))}


def split_body(body: str) -> dict:
    """본문을 항목별로 나눈다. 이름 → 그 다음 이름 직전까지."""
    marks = [(m.start(), m.end(), " ".join(m.group(1).split()).replace(" ", ""))
             for m in BODY_LABEL.finditer(body)]
    out = {}
    for index, (_, end, name) in enumerate(marks):
        stop = marks[index + 1][0] if index + 1 < len(marks) else len(body)
        value = body[end:stop].strip(" :·-")
        if value and name not in out:
            out[name] = " ".join(value.split())
    return out


def to_bizinfo(row: dict, detail: dict) -> dict:
    """기업마당 응답과 같은 열쇠로 옮긴다. extract.py 를 안 고쳐도 되게.

    지원대상은 맨 뒤에 ☞ 로 붙인다. support_target() 이 첫 ☞ 뒤를 통째로
    가져가기 때문에, 앞에 두면 지원내용까지 지원대상으로 읽힌다.
    """
    body = detail.get("내용", "")
    parts = split_body(body)
    target = parts.get("지원대상") or parts.get("신청대상") or ""
    # 「붙임 … 끝.」 은 자격이 아니다. 지원대상 뒤에 붙어 오는 일이 많다.
    target = re.split(r"붙\s*임|끝\s*\.", target)[0].strip()

    lead = " ".join(v for k, v in parts.items()
                    if k in ("사업명", "지원내용", "지원규모", "운영기관"))
    summary = (lead + (" ☞ " + target if target else "")).strip() or body

    # 신청 방법. 본문에 적혀 있으면 그걸 쓰고, 없으면 공고에 실제로 있는
    # 운영기관·담당부서·연락처를 모아준다. 없는 절차를 지어내지 않는다.
    how = parts.get("신청방법", "")
    if not how:
        bits = []
        if parts.get("운영기관"):
            bits.append(f"운영기관 {parts['운영기관']}")
        if detail.get("담당부서"):
            bits.append(f"화성시청 {detail['담당부서']}")
        if detail.get("담당자/연락처"):
            bits.append(f"문의 {detail['담당자/연락처']}")
        bits.append("신청서는 공고문 첨부에 있어요")
        how = " · ".join(bits)

    # 기간은 목록 쪽을 먼저 쓴다. 「2026-01-26 ~ 2026-12-31」처럼 날짜 두 개라
    # is_open() 이 그대로 계산한다. 본문의 「2026. 1. ~ 12.(자금 소진 시까지)」는
    # 날짜로 안 읽히지만 ALWAYS_OPEN 에 걸리므로 같이 실어둔다.
    period = " ".join(x for x in (row.get("period") or "",
                                  parts.get("신청기간") or parts.get("접수기간")
                                  or parts.get("사업기간") or "") if x).strip()

    return {
        "_source": "hscity",
        "_posted_at": row.get("posted_at", ""),
        "pblancId": f"HSCITY_{row['notice_id']}",
        "pblancNm": detail.get("제목") or row["title"],
        "bsnsSumryCn": summary,
        "trgetNm": target,
        "jrsdInsttNm": "화성시",
        "excInsttNm": parts.get("운영기관", ""),
        "refrncNm": detail.get("담당자/연락처", "") or detail.get("담당부서", ""),
        "reqstBeginEndDe": period,
        "pblancUrl": DETAIL_URL.format(notice_id=row["notice_id"]),
        # 접수 사이트가 따로 없다. 신청서가 공고문 .hwp 안에 붙어 있어서
        # 원문 페이지가 사실상 접수 창구다. 지어내지 않고 그대로 준다.
        "rceptEngnHmpgUrl": DETAIL_URL.format(notice_id=row["notice_id"]),
        "reqstMthPapersCn": how,
        "hashtags": "화성시 소상공인",
    }


def support_rows(notices: list[dict]) -> list[dict]:
    """목록에서 소상공인 지원사업만. 대규모점포 예고는 지원사업이 아니다."""
    sys.path.insert(0, str(ROOT / "policy_data"))
    from collect import SOSANG  # noqa: E402  기업마당과 같은 낱말을 쓴다
    return [n for n in notices
            if n.get("notice_id")
            and SOSANG.search(n["title"])
            and not STORE_NOTICE.search(n["title"])]


def still_open(entry: dict, today: str) -> bool:
    """아직 유효한 공고인가.

    끝날이 적혀 있으면 그걸 본다. 없으면 게재일로 본다 — 「자금 소진
    시까지」처럼 날짜가 아예 없는 공고가 많은데, 그걸 다 남기면 2017년
    자금지원계획이 오늘 신청 가능한 것처럼 목록에 앉는다.

    기업마당 쪽 is_open() 이 「모르면 안 자른다」인 것과 반대다. 거기는
    지금 열려 있는 공고만 API 가 주지만, 여기는 2009년부터 쌓인 게시판을
    통째로 긁어오기 때문이다.
    """
    found = re.findall(r"\d{4}-\d{2}-\d{2}", entry.get("reqstBeginEndDe", ""))
    if found:
        return max(found) >= today
    return entry.get("_posted_at", "") >= f"{int(today[:4]) - 1}-01-01"


def run_support(pages: int) -> int:
    """새 공고를 훑고, 열려 있는 지원사업의 상세를 받아 저장한다.

    매일 전체를 다시 긁지 않는다. 946페이지에 11분이 걸리는데 새 공고는
    앞쪽에만 붙는다. 앞 몇 장만 보고, 이미 받아둔 것은 저장해둔 것을 쓴다.
    """
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    kept: dict[str, dict] = {}
    if STORE.exists():
        for entry in json.loads(STORE.read_text(encoding="utf-8")):
            kept[entry["pblancId"]] = entry

    rows = support_rows(crawl(pages))

    # 처음 돌릴 때는 전체 스냅샷에서 같이 긁어온다. 1월에 뜬 자금지원사업이
    # 12월까지 열려 있는데, 앞 몇 장만 봐서는 절대 안 잡힌다.
    snapshot = latest_snapshot()
    if snapshot and not STORE.exists():
        seen = {r["notice_id"] for r in rows}
        older = json.loads(snapshot.read_text(encoding="utf-8"))
        rows += [r for r in support_rows(older) if r["notice_id"] not in seen]
        print(f"  첫 실행 — 스냅샷 {snapshot.name} 에서 과거 공고도 같이 본다")

    today = date.today().isoformat()
    print(f"소상공인 지원사업 후보 {len(rows)}건")
    added = skipped = 0
    for row in rows:
        key = f"HSCITY_{row['notice_id']}"
        if key in kept:
            continue
        # 상세를 받기 전에 날짜부터 본다. 게시판이 2009년부터 쌓여 있어서
        # 안 거르면 2017년 공고까지 상세를 받아놓고 곧바로 버린다.
        # 남의 서버에 헛요청을 보내지 않는다.
        if not still_open({"reqstBeginEndDe": row.get("period") or "",
                           "_posted_at": row.get("posted_at") or ""}, today):
            skipped += 1
            continue
        try:
            entry = to_bizinfo(row, fetch_detail(row["notice_id"]))
        except Exception as error:
            print(f"  상세 실패 {row['notice_id']}: {error}", file=sys.stderr)
            continue
        kept[key] = entry
        added += 1
        print(f"  받음  {row['posted_at']}  {row['title'][:46]}")
        time.sleep(PAUSE)

    live = [e for e in kept.values() if still_open(e, today)]
    dropped = len(kept) - len(live)

    # 같은 제목이 여러 해에 걸쳐 다시 올라온다. 「화성시 골목형상점가 지정
    # 공고」가 2025년 것과 2026년 것 둘 다 열려 있어서 목록에 나란히 떴다.
    # 사장님은 어느 쪽이 지금 것인지 알 수가 없다. 게재일이 늦은 것만 남긴다.
    newest: dict[str, dict] = {}
    for entry in sorted(live, key=lambda e: e.get("_posted_at", "")):
        newest[entry["pblancNm"].strip()] = entry
    if len(newest) < len(live):
        print(f"  같은 제목 {len(live) - len(newest)}건은 최신 것만 남겼다")
    live = sorted(newest.values(), key=lambda e: e.get("_posted_at", ""), reverse=True)

    STORE.write_text(json.dumps(live, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n새로 받은 것 {added}건 · 기간 지나 건너뛴 것 {skipped}건 · "
          f"보관 중 만료 {dropped}건 · 남은 것 {len(live)}건")
    print(f"저장: {STORE.relative_to(ROOT)}")
    for entry in live:
        print(f"  · {entry['reqstBeginEndDe'][:25]:27} {entry['pblancNm'][:44]}")
    return 0


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
    parser.add_argument("--support", action="store_true",
                        help="소상공인 지원사업만 상세까지 받아 저장 (매일 이것)")
    args = parser.parse_args()

    if args.coverage:
        return run_coverage()

    if args.support:
        return run_support(args.pages or 5)

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
