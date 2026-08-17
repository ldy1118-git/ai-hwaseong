#!/usr/bin/env python3
"""갱신이 데이터를 나쁘게 만들지 않았는지 검사한다.

    python3 policy_data/guard.py --save     현재 상태를 기준으로 기록
    python3 policy_data/guard.py            기준과 비교. 나빠졌으면 실패

**왜 필요한가.**
2026-08-17 에 GitHub Actions 가 공고를 자동 갱신했는데, 러너에 pdftotext
가 없어서 첨부 공고문을 하나도 못 읽었다. extract.py 는 본문이 없으면
서류를 기본값 2개로 채우는데, 그 결과가 그대로 커밋됐다.

    서류 11 → 2 · 14 → 2 · 7 → 2   (8개 공고)

파이프라인은 전부 "성공"으로 끝났다. 오류가 안 났기 때문이다.
자동화가 조용히 데이터를 깎아먹는 게 제일 위험하다. 건수만 세지 말고
내용이 얼마나 남았는지를 봐야 한다.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NOTICES = ROOT / "policy_data" / "notices"
BASELINE = ROOT / "policy_data" / "baseline.json"

# 자동 갱신은 공고가 늘고 줄기 때문에 총량이 조금 흔들린다.
# 10% 까지는 정상으로 본다. 그 이상 빠지면 뭔가 잘못된 것이다.
TOLERANCE = 0.90


def measure() -> dict:
    notices = sorted(NOTICES.glob("*.json"))
    documents = conditions = summaries = 0
    for path in notices:
        data = json.loads(path.read_text(encoding="utf-8"))
        documents += len(data.get("documents", []))
        conditions += len(data.get("eligibility", {}))
        if len(data.get("summary", "")) > 200:
            summaries += 1
    return {
        "notices": len(notices),
        "documents": documents,
        "conditions": conditions,
        "rich_summaries": summaries,
    }


def main() -> int:
    now = measure()

    if "--save" in sys.argv:
        BASELINE.write_text(json.dumps(now, indent=2) + "\n", encoding="utf-8")
        print("기준 저장:", json.dumps(now, ensure_ascii=False))
        return 0

    if not BASELINE.exists():
        print("기준 파일이 없습니다. --save 로 먼저 만드세요.", file=sys.stderr)
        return 1

    before = json.loads(BASELINE.read_text(encoding="utf-8"))
    problems = []

    print(f"  {'항목':<16}{'기준':>8}{'현재':>8}")
    for key, label in [("notices", "공고"), ("documents", "서류"),
                       ("conditions", "자격조건"), ("rich_summaries", "본문 있는 공고")]:
        old, new = before.get(key, 0), now[key]
        ok = new >= old * TOLERANCE
        print(f"  {label:<16}{old:>8}{new:>8}   {'' if ok else '  ← 크게 줄었다'}")
        if not ok:
            problems.append(f"{label} {old} → {new}")

    if problems:
        print()
        print("갱신이 데이터를 깎아먹었습니다:", ", ".join(problems), file=sys.stderr)
        print("첨부 공고문을 못 읽었을 때 이렇게 됩니다. pdftotext 가 있는지,", file=sys.stderr)
        print("fetch_docs.py 가 실패하지 않았는지 확인하세요.", file=sys.stderr)
        print("이 상태로 커밋하면 안 됩니다.", file=sys.stderr)
        return 1

    print("\n데이터가 줄지 않았습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
