#!/usr/bin/env python3
"""세무일정을 프로필에 맞춰 걸러주고, 실제 기한을 계산한다.

    python3 policy_data/tax_schedule.py                    2026년 전체
    python3 policy_data/tax_schedule.py --year 2027
    python3 policy_data/tax_schedule.py --profile 개인,일반과세,직원없음
    python3 policy_data/tax_schedule.py --json            화면에 넘길 모양 그대로

**법정기한을 그대로 화면에 띄우면 틀린다.**

국세청 규정: "신고기한이 공휴일·토요일인 경우 그 다음 날을 신고기한으로 한다."
2026년만 봐도 법정기한 10개 중 6개가 밀린다. 국세청 세무일정 페이지도 밀린
날짜로 표기한다 — 부가세 2기 확정은 1/25 가 아니라 1/26 으로 적혀 있다.

데이터는 tax_calendar.json 에 있고 여긴 계산만 한다.
"""

from __future__ import annotations

import argparse
import json
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "policy_data" / "tax_calendar.json"

# 관공서 공휴일. 세무서가 닫으면 기한이 밀린다.
#
# 설날·추석은 음력이라 해마다 계산이 필요하고, 대체공휴일 규칙도 있어서
# 코드로 만들지 않고 해마다 적어 넣는다. **연말에 다음 해를 채울 것.**
# 안 채우면 그 해는 주말만 반영되어 날짜가 틀릴 수 있다.
HOLIDAYS = {
    2026: [
        "01-01",                                # 신정
        "02-16", "02-17", "02-18",              # 설날 연휴
        "03-01", "03-02",                       # 삼일절(일) + 대체공휴일
        "05-05",                                # 어린이날
        "05-24", "05-25",                       # 부처님오신날(일) + 대체공휴일
        "06-06",                                # 현충일 (토요일이어도 대체 없음)
        "08-15", "08-17",                       # 광복절(토) + 대체공휴일
        "09-24", "09-25", "09-26",              # 추석 연휴
        "10-03", "10-05",                       # 개천절(토) + 대체공휴일
        "10-09",                                # 한글날
        "12-25",                                # 성탄절
    ],
    2027: [
        "01-01",                                # 신정
        "02-06", "02-07", "02-08", "02-09",     # 설날 연휴 + 대체공휴일
        "03-01",                                # 삼일절
        "05-05",                                # 어린이날
        "05-13",                                # 부처님오신날
        "06-06",                                # 현충일 (일요일이어도 대체 없음)
        "08-15", "08-16",                       # 광복절(일) + 대체공휴일
        "09-14", "09-15", "09-16",              # 추석 연휴
        "10-03", "10-04",                       # 개천절(일) + 대체공휴일
        "10-09", "10-11",                       # 한글날(토) + 대체공휴일
        "12-25", "12-27",                       # 성탄절(토) + 대체공휴일
    ],
}


def load() -> dict:
    return json.loads(DATA.read_text(encoding="utf-8"))


def is_closed(day: date) -> bool:
    """세무서가 닫는 날인가. 토·일 또는 공휴일."""
    if day.weekday() >= 5:
        return True
    return day.strftime("%m-%d") in HOLIDAYS.get(day.year, [])


def actual_due(year: int, month: int, day: int) -> tuple[date, bool]:
    """법정기한을 실제 기한으로. (날짜, 밀렸는지)"""
    try:
        legal = date(year, month, day)
    except ValueError:                      # 2월 30일 같은 건 없다
        return date(year, month, 28), False
    moved = legal
    while is_closed(moved):
        moved += timedelta(days=1)
    return moved, moved != legal


def known_year(year: int) -> bool:
    """공휴일을 적어둔 해인가. 아니면 주말만 반영된다."""
    return year in HOLIDAYS


def applies(event: dict, profile: dict) -> bool:
    """이 사람에게 해당되는 일정인가.

    프로필에 답이 없으면(None) 걸러내지 않는다. 모른다는 이유로 빼면
    사장님이 신고를 통째로 놓친다. 공고 매칭과 같은 원칙이다.
    """
    target = event["applies_to"]
    for key in ("entity_type", "vat_type"):
        allowed = target.get(key)
        mine = profile.get(key)
        if allowed and mine and mine not in allowed:
            return False
    # 참/거짓으로 답하는 것들. 목록이 아니라 값으로 견준다.
    for key in ("has_employee", "withholding_half"):
        want = target.get(key)
        mine = profile.get(key)
        if want is not None and mine is not None and want != mine:
            return False
    return True


def schedule(profile: dict, year: int) -> dict:
    """프로필에 맞는 일정을 실제 기한과 함께 돌려준다."""
    data = load()
    must, maybe = [], []

    for event in data["events"]:
        if not applies(event, profile):
            continue
        item = dict(event)

        if event.get("recurrence") == "monthly":
            item["due_dates"] = []
            for month in range(1, 13):
                when, moved = actual_due(year, month, 10)
                item["due_dates"].append({
                    "date": when.isoformat(), "legal": f"{month:02d}-10", "moved": moved,
                })
        else:
            month, day = (int(x) for x in event["due"].split("-"))
            when, moved = actual_due(year, month, day)
            item["due_date"] = when.isoformat()
            item["moved"] = moved

        # 조건이 붙어 있어도 사장님이 그 조건을 직접 답했으면 더는
        # 「해당되면 이것도」가 아니다. 원천세 반기납부가 그렇다 — 승인을
        # 받았는지는 사장님만 안다. 받았다고 답하면 1월·7월 두 건이
        # 반드시 해야 하는 것으로 올라온다.
        asked = event.get("conditional_resolved_by")
        resolved = asked is not None and profile.get(asked) is not None
        (maybe if event.get("conditional") and not resolved else must).append(item)

    key = lambda x: x.get("due_date") or f"{year}-01-10"
    return {
        "year": year,
        "profile": profile,
        "holidays_known": known_year(year),
        "must_do": sorted(must, key=key),
        "if_applicable": sorted(maybe, key=key),
    }


PRESETS = {
    "개인": ("entity_type", "개인"), "법인": ("entity_type", "법인"),
    "일반과세": ("vat_type", "일반과세"), "간이과세": ("vat_type", "간이과세"),
    "면세": ("vat_type", "면세"),
    "직원있음": ("has_employee", True), "직원없음": ("has_employee", False),
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=date.today().year)
    parser.add_argument("--profile", default="개인,일반과세,직원없음")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    profile = {}
    for word in args.profile.split(","):
        word = word.strip()
        if word in PRESETS:
            key, value = PRESETS[word]
            profile[key] = value
        elif word:
            print(f"모르는 조건: {word}  (가능: {', '.join(PRESETS)})")
            return 1

    result = schedule(profile, args.year)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    print(f"{args.year}년 · {args.profile}")
    if not result["holidays_known"]:
        print(f"  ⚠ {args.year}년 공휴일이 등록돼 있지 않습니다. 주말만 반영된 날짜입니다.")
        print(f"    tax_schedule.py 의 HOLIDAYS 에 채워 넣으세요.")
    print()

    for label, items in (("반드시 해야 하는 것", result["must_do"]),
                         ("해당되면 이것도", result["if_applicable"])):
        if not items:
            continue
        print(f"── {label} {len(items)}건")
        for item in items:
            if item.get("due_dates"):
                moved = sum(1 for x in item["due_dates"] if x["moved"])
                print(f"   매월 10일   {item['title']}")
                print(f"              ({moved}개월은 주말·공휴일이라 뒤로 밀립니다)")
            else:
                mark = f"  ← 법정 {item['due']} 에서 밀림" if item["moved"] else ""
                print(f"   {item['due_date']}  {item['title']}{mark}")
            if item.get("conditional"):
                print(f"              조건: {item['conditional']}")
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
