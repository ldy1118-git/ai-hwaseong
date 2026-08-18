#!/usr/bin/env python3
"""온보딩이 만드는 프로필로 배포된 매칭 API 를 실제로 두들겨본다.

    python3 scripts/check_match.py                     배포본
    python3 scripts/check_match.py http://127.0.0.1:8000  로컬

왜 필요한가. 온보딩 → /api/onboarding → 매칭 엔진 사이에서 키 이름이
어긋나면 **에러가 나지 않는다.** 그 키가 조용히 버려지고 조건이 통째로
빠진 채 매칭이 돌아간다. 눈으로는 못 잡는다. 그래서 프로필을 바꿔가며
결과가 실제로 달라지는지 확인하는 방법밖에 없다.

여기 프로필은 project/src/pages/Onboarding.jsx 가 만드는 모양 그대로다.
INITIAL 에 annual_revenue_krw 가 없어서 여기도 넣지 않는다 — 온보딩이
매출을 안 묻는다는 사실이 이 파일에도 드러나 있어야 한다.

공고를 갱신한 뒤(8/19 등)에는 반드시 한 번 돌릴 것.
"""

from __future__ import annotations

import collections
import json
import sys
import urllib.request

DEFAULT_BASE = "https://ai-hwaseong-ten.vercel.app"

# 온보딩 3갈래(A 분야선택 / B 하고싶은일 서술 / C 이미 운영중)의 대표 출력.
# 마지막 하나는 공통질문을 전부 스킵했을 때. 스킵해도 화면이 도는지 본다.
CASES = {
    "A 예비창업 카페(화성시)": {
        "category": "카페", "business_status": "예비창업자", "age": 35,
        "region": "화성시", "business_period_months": "",
        "career_experience": "없음", "asset_group": "일반",
        "marital_status": "미혼", "living_with_parents": False,
    },
    "C 운영중 음식점(화성시 24개월)": {
        "category": "음식점", "business_status": "운영중", "age": 45,
        "region": "화성시", "business_period_months": 24,
        "career_experience": "있음", "asset_group": "일반",
        "marital_status": "기혼", "living_with_parents": False,
    },
    "C 운영중 소매업(경기도 60개월)": {
        "category": "소매업", "business_status": "운영중", "age": 52,
        "region": "경기도", "business_period_months": 60,
        "career_experience": "있음", "asset_group": "일반",
        "marital_status": "기혼", "living_with_parents": False,
    },
    "공통질문 전부 스킵": {
        "category": "카페", "business_status": "예비창업자", "age": "",
        "region": "", "business_period_months": "",
        "career_experience": "", "asset_group": "일반",
        "marital_status": "", "living_with_parents": None,
    },
}


def ask(base: str, profile: dict) -> dict:
    body = json.dumps({"user_profile": profile, "device_id": "check_match"}).encode()
    request = urllib.request.Request(
        f"{base}/api/match", body, {"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def main() -> int:
    base = (sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BASE).rstrip("/")
    print(f"대상: {base}\n")

    tallies = []
    failed = False

    for name, profile in CASES.items():
        try:
            answer = ask(base, profile)
        except Exception as error:
            print(f"[실패] {name}: {type(error).__name__}: {error}")
            failed = True
            continue

        results = answer.get("results") or []
        tally = collections.Counter(r.get("overall_status") for r in results)
        tallies.append((name, tuple(sorted(tally.items()))))

        print(f"■ {name}  — 공고 {answer.get('count')}건")
        print(f"    신청가능 {tally.get('신청가능', 0)}"
              f" · 확인필요 {tally.get('확인필요', 0)}"
              f" · 대상아님 {tally.get('대상아님', 0)}")
        for top in sorted(results, key=lambda r: -(r.get("match_score") or 0))[:3]:
            print(f"    {top.get('match_score'):>3}점 {top.get('overall_status')}"
                  f"  {(top.get('notice_title') or '')[:44]}")
        print()

    # 프로필을 이렇게 다르게 넣었는데 결과가 전부 같으면, 프로필이 통째로
    # 무시되고 있다는 뜻이다. 실제로 그 사고가 한 번 났었다 — 요청 키를
    # user_profile 이 아닌 이름으로 보내서 전부 50점 확인필요로 나왔다.
    if len({t for _, t in tallies}) <= 1 and len(tallies) > 1:
        print("✗ 프로필을 바꿔도 결과가 같습니다 — 프로필이 무시되고 있습니다.")
        print("  api/match.py 가 읽는 키 이름과 policy_data/schema.md 를 대조하세요.")
        return 1

    if failed:
        return 1
    print("프로필에 따라 결과가 달라집니다 — 온보딩과 매칭이 연결돼 있습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
