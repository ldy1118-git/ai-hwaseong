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
자동화가 조용히 데이터를 깎아먹는 게 제일 위험하다.

**총량으로 재면 안 된다.**
처음에는 서류·조건의 전체 합계를 기준선과 비교했다. 그런데 기업마당은
지금 열려 있는 공고만 준다. 공고가 마감돼서 빠지면 딸린 서류도 같이
빠지는데, 총량만 보면 이걸 "데이터가 깎였다"고 읽는다.

2026-08-29 부터 09-02 까지 닷새 동안 자동 갱신이 그래서 멈춰 있었다.

    공고    82 → 76    (11건 마감, 5건 신규)
    서류   247 → 217   ← 0.879. 문턱 0.90 을 1.1%p 차이로 못 넘겼다

빠진 11건이 하필 서류가 많은 공고들이었다(평균 4.2개, 전체 평균은 3.0개).
살아남은 71건은 서류 201개를 그대로 갖고 있었다 — 아무것도 안 깎였는데
실패한 것이다. 더 나쁜 건 스스로 못 빠져나온다는 점이다. 기준선을 올리는
`--save` 는 이 검사를 통과한 뒤에만 부르므로, 한번 걸리면 매일 같은 낡은
기준선과 재면서 격차만 벌어진다.

**그래서 양쪽에 다 있는 공고만 비교한다.**
마감된 공고는 애초에 비교 대상에서 빠지므로 만료에 흔들리지 않는다.
그러면서 원래 잡으려던 사고는 오히려 더 정확히 걸린다 — pdftotext 가
없으면 살아남은 공고의 서류가 통째로 2개로 주저앉기 때문이다.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NOTICES = ROOT / "policy_data" / "notices"
BASELINE = ROOT / "policy_data" / "baseline.json"

# 살아남은 공고의 내용은 이만큼 남아야 한다. 같은 공고를 다시 받은 것이라
# 원래 거의 안 변한다. 10% 는 첨부가 한둘 실패했을 때를 위한 여유다.
TOLERANCE = 0.90

# 공고 수는 마감으로 줄어드는 게 정상이라 느슨하게 본다. 여기서 걸리는
# 것은 collect.py 가 통째로 실패해서 목록이 텅 빈 경우다.
NOTICE_TOLERANCE = 0.75

# 한 공고가 서류의 절반 넘게 잃으면 그 공고의 첨부를 못 읽은 것이다.
# 한 건은 공고가 수정된 것일 수 있으니 넘어가고, 두 건부터는 사고로 본다.
COLLAPSE_RATIO = 0.5
COLLAPSE_ALLOWED = 1

FIELDS = [("documents", "서류"), ("conditions", "자격조건"), ("rich_summaries", "본문")]


def measure() -> dict:
    """전체 합계와 공고별 내역을 같이 잰다.

    합계는 사람이 로그에서 훑어보라고 남긴다. 판정은 공고별 내역으로 한다.
    """
    per_notice = {}
    for path in sorted(NOTICES.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        # notice_id 가 원본 열쇠다. 파일명은 제목이 바뀌면 같이 바뀌어서
        # 같은 공고가 다른 공고로 보인다.
        key = data.get("notice_id") or path.stem
        per_notice[key] = [
            len(data.get("documents", [])),
            len(data.get("eligibility", {})),
            1 if len(data.get("summary", "")) > 200 else 0,
        ]

    totals = [sum(v[i] for v in per_notice.values()) for i in range(3)]
    return {
        "notices": len(per_notice),
        "documents": totals[0],
        "conditions": totals[1],
        "rich_summaries": totals[2],
        "per_notice": per_notice,
    }


def compare(before: dict, now: dict) -> list[tuple[str, str]]:
    """양쪽에 다 있는 공고만 재서 (종류, 설명) 목록을 돌려준다.

    종류를 같이 주는 이유 — 목록이 통째로 빈 것과 내용이 깎인 것은 볼 곳이
    다르다. 전자는 collect.py, 후자는 pdftotext 다. 한 문구로 뭉뚱그리면
    새벽에 로그를 보는 사람이 엉뚱한 데를 뒤진다.
    """
    old_map = before.get("per_notice") or {}
    new_map = now["per_notice"]

    shared = sorted(set(old_map) & set(new_map))
    expired = len(set(old_map) - set(new_map))
    added = len(set(new_map) - set(old_map))

    problems = []

    # ── 공고 수 ──────────────────────────────────────────────────
    old_n, new_n = before.get("notices", 0), now["notices"]
    ok = new_n >= old_n * NOTICE_TOLERANCE
    print(f"  공고   {old_n} → {new_n}   (마감 {expired}건 · 신규 {added}건)"
          f"{'' if ok else '   ← 목록이 통째로 비었다'}")
    if not ok:
        problems.append(("notices", f"공고 {old_n} → {new_n}"))

    if not shared:
        print("\n  겹치는 공고가 없어 내용은 비교하지 않는다.")
        return problems

    # ── 살아남은 공고의 내용 ─────────────────────────────────────
    print(f"\n  살아남은 {len(shared)}건의 내용")
    print(f"    {'항목':<10}{'전':>8}{'후':>8}")
    for i, (key, label) in enumerate(FIELDS):
        old = sum(old_map[k][i] for k in shared)
        new = sum(new_map[k][i] for k in shared)
        ok = new >= old * TOLERANCE
        print(f"    {label:<10}{old:>8}{new:>8}   {'' if ok else '  ← 크게 줄었다'}")
        if not ok:
            problems.append(("content", f"{label} {old} → {new}"))

    # ── 서류가 주저앉은 공고 ─────────────────────────────────────
    # 합계로는 안 걸리는 모양이 있다. 여덟 건이 11→2 로 뭉개져도 전체의
    # 6% 뿐이면 위 검사를 통과한다. 2026-08-17 사고가 그 모양이었다.
    collapsed = [(k, old_map[k][0], new_map[k][0]) for k in shared
                 if old_map[k][0] >= 4 and new_map[k][0] < old_map[k][0] * COLLAPSE_RATIO]
    if collapsed:
        print(f"\n  서류가 절반 넘게 빠진 공고 {len(collapsed)}건")
        for k, old, new in sorted(collapsed, key=lambda x: x[2] - x[1])[:8]:
            print(f"    {old:>3} → {new:<3}  {k}")
        if len(collapsed) > COLLAPSE_ALLOWED:
            problems.append(("content", f"서류가 주저앉은 공고 {len(collapsed)}건"))
        else:
            print("    (1건은 공고가 수정된 것일 수 있어 넘어간다)")

    return problems


def main() -> int:
    now = measure()

    if "--save" in sys.argv:
        saved = {"_설명": "per_notice 는 공고별 [서류, 자격조건, 본문있음]. "
                          "마감된 공고를 빼고 비교하려고 둔다 — guard.py 를 볼 것",
                 **now}
        text = json.dumps(saved, indent=2, ensure_ascii=False)
        # 공고별 내역은 한 줄에 하나씩 둔다. indent 를 그대로 두면 배열이
        # 세 줄로 펴져서 82건이 410줄이 된다. 매일 커밋되는 파일이라
        # 어느 공고의 서류가 바뀌었는지 diff 로 바로 보여야 한다.
        text = re.sub(r"\[\s+(\d+),\s+(\d+),\s+(\d+)\s+\]", r"[\1, \2, \3]", text)
        BASELINE.write_text(text + "\n", encoding="utf-8")
        print(f"기준 저장: 공고 {now['notices']} · 서류 {now['documents']} · "
              f"자격조건 {now['conditions']} · 본문 {now['rich_summaries']}")
        return 0

    if not BASELINE.exists():
        print("기준 파일이 없습니다. --save 로 먼저 만드세요.", file=sys.stderr)
        return 1

    before = json.loads(BASELINE.read_text(encoding="utf-8"))

    # 낡은 기준선(공고별 내역이 없는 것)은 비교할 수가 없다. 막지는 않는다 —
    # 여기서 실패시키면 --save 에 못 가서 영영 낡은 채로 남는다.
    if "per_notice" not in before:
        print("기준 파일이 옛 형식입니다(공고별 내역 없음). 이번은 넘어갑니다.")
        print("    python3 policy_data/guard.py --save   로 다시 만드세요.")
        return 0

    problems = compare(before, now)

    if problems:
        say = lambda m: print(m, file=sys.stderr)
        kinds = {kind for kind, _ in problems}
        print()
        say("갱신이 데이터를 깎아먹었습니다: " + ", ".join(t for _, t in problems))
        if "notices" in kinds:
            say("공고 목록이 통째로 비었습니다. 기업마당 API 가 응답했는지,")
            say("collect.py 가 중간에 죽지 않았는지 확인하세요.")
        if "content" in kinds:
            say("마감된 공고는 이미 빼고 잰 것이라, 살아남은 공고가 내용을")
            say("잃었다는 뜻입니다. pdftotext 가 있는지, fetch_docs.py 가")
            say("실패하지 않았는지 확인하세요.")
        say("이 상태로 커밋하면 안 됩니다.")
        return 1

    print("\n살아남은 공고가 내용을 잃지 않았습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
