#!/usr/bin/env python3
"""행정용어 사전 조회.

공고문에 들어있는 어려운 말을 찾아서 쉬운 설명을 붙인다.
LLM 모듈은 find_terms() 로 공고문에 실제로 등장한 용어만 골라
프롬프트에 넣으면 된다. 사전 전체를 넣을 필요가 없다.

    python3 policy_data/terms.py --demo                 실제 공고로 시연
    python3 policy_data/terms.py "공고 본문 텍스트"       텍스트에서 용어 찾기
    python3 policy_data/terms.py --file 공고.txt         파일에서 용어 찾기
    python3 policy_data/terms.py --doc 사업자등록증명      서류 발급 안내
    python3 policy_data/terms.py --stats                사전 현황

사전 원본은 policy_data/terms.json.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

DICT_PATH = Path(__file__).resolve().parent / "terms.json"

_cache: dict | None = None


def load() -> dict:
    """사전을 읽는다. 한 번만 읽고 재사용한다."""
    global _cache
    if _cache is None:
        _cache = json.loads(DICT_PATH.read_text(encoding="utf-8"))
    return _cache


def _surfaces(entry: dict, key: str) -> list[str]:
    """한 항목이 문서에서 나타날 수 있는 모든 표기."""
    return [entry[key]] + list(entry.get("aliases") or [])


def find_terms(text: str) -> list[dict]:
    """텍스트에 실제로 등장하는 용어만 돌려준다.

    긴 표기를 먼저 맞춰서 '고시공고'가 '공고'로 잘리지 않게 한다.
    같은 항목이 여러 번 나와도 하나로 친다.
    """
    data = load()
    candidates: list[tuple[str, dict]] = []
    for entry in data["terms"]:
        for surface in _surfaces(entry, "term"):
            candidates.append((surface, entry))
    candidates.sort(key=lambda pair: len(pair[0]), reverse=True)

    taken: list[tuple[int, int]] = []  # 이미 다른 용어가 차지한 구간
    found: dict[str, dict] = {}

    def overlaps(start: int, end: int) -> bool:
        return any(start < e and s < end for s, e in taken)

    for surface, entry in candidates:
        position = text.find(surface)
        while position != -1:
            end = position + len(surface)
            if not overlaps(position, end):
                taken.append((position, end))
                found.setdefault(entry["id"], entry)
                break
            position = text.find(surface, position + 1)

    # 본문에 나온 순서대로 정렬한다
    return sorted(found.values(), key=lambda e: min(
        (text.find(s) for s in _surfaces(e, "term") if text.find(s) != -1),
        default=10**9,
    ))


def find_document(name: str) -> dict | None:
    """서류명으로 발급 안내를 찾는다. 별칭도 본다."""
    cleaned = name.strip()
    for entry in load()["documents"]:
        if cleaned in _surfaces(entry, "name"):
            return entry
    # 부분일치로 한 번 더 (매칭 엔진이 '매출 증빙자료' 처럼 적는 경우)
    for entry in load()["documents"]:
        for surface in _surfaces(entry, "name"):
            if surface in cleaned or cleaned in surface:
                return entry
    return None


def glossary_for(text: str, limit: int = 12) -> str:
    """LLM 프롬프트에 넣을 용어 설명 블록을 만든다."""
    lines = []
    for entry in find_terms(text)[:limit]:
        line = f"- {entry['term']}: {entry['easy']}"
        if entry.get("caution"):
            line += f" (주의: {entry['caution']})"
        lines.append(line)
    return "\n".join(lines)


# ── 출력 ──────────────────────────────────────────────────────────

def print_term(entry: dict) -> None:
    print(f"\n■ {entry['term']}  [{entry['category']}]")
    if entry.get("aliases"):
        print(f"   같은 말: {', '.join(entry['aliases'])}")
    print(f"   {entry['easy']}")
    if entry.get("detail"):
        print(f"   → {entry['detail']}")
    if entry.get("example"):
        print(f"   예)  {entry['example']}")
    if entry.get("caution"):
        print(f"   ⚠  {entry['caution']}")
    if not entry.get("verified", False):
        print("   ※ 아직 원문 확인 안 된 항목")


def print_document(entry: dict) -> None:
    print(f"\n■ {entry['name']}")
    if entry.get("aliases"):
        print(f"   같은 말: {', '.join(entry['aliases'])}")
    print(f"   {entry['easy']}")
    if entry.get("detail"):
        print(f"   → {entry['detail']}")
    issue = entry.get("issue") or {}
    if issue.get("online"):
        print(f"   인터넷: {' / '.join(issue['online'])}")
    if issue.get("offline"):
        print(f"   방문:   {' / '.join(issue['offline'])}")
    bits = [b for b in (issue.get("fee"), issue.get("time")) if b]
    if bits:
        print(f"   비용·시간: {' · '.join(bits)}")
    if issue.get("url"):
        print(f"   주소:   {issue['url']}")
    confused = entry.get("confused_with")
    if confused:
        print(f"   ✕ '{confused['name']}' 와 다름 — {confused['why']}")
    if entry.get("caution"):
        print(f"   ⚠  {entry['caution']}")
    if not entry.get("verified", False):
        print("   ※ 발급처 아직 확인 안 된 항목")


def run_demo() -> int:
    """실제 화성시 공고 본문으로 돌려본다."""
    sample = (
        "1. 사 업 명 : 2026년 화성시 소상공인 자금지원사업 "
        "2. 지원내용 - 특례보증 지원 : 소상공인 대상 5천만원 한도 내 보증서 발행을 통한 대출지원 "
        "- 특례보증 수수료 지원 : 특례보증 시 수수료(1%) 최초 1회 한도 지원 "
        "- 이차차액보전 지원 : 특례보증을 통한 대출 시 이자 2%, 5년 지원 "
        "3. 사업기간 : 2026. 1. ~ 12.(자금 소진 시까지) "
        "4. 운영기관 : 경기신용보증재단 및 협약은행 13개사 "
        "5. 지원대상 : 「소상공인 보호 및 지원에 관한 법률」에 따른 소상공인 중 "
        "화성시 관내에 사업장을 두고, 사업자등록증 상 개업일 및 사업자등록일부터 "
        "2개월 이상 경과한 사업자로서 신청일 현재 사업 중인 자"
    )
    print("=" * 66)
    print("원문 — 2026년 화성시 소상공인 자금지원사업 (화성시 공고 제2026-442호)")
    print("=" * 66)
    print(sample)

    hits = find_terms(sample)
    print(f"\n{'=' * 66}")
    print(f"찾은 용어 {len(hits)}개")
    print("=" * 66)
    for entry in hits:
        print_term(entry)

    print(f"\n{'=' * 66}")
    print("LLM 프롬프트에 넣을 형태")
    print("=" * 66)
    print(glossary_for(sample))
    return 0


def run_stats() -> int:
    data = load()
    terms, docs = data["terms"], data["documents"]
    print(f"사전 버전 {data['version']}")
    print(f"  용어 {len(terms)}개 · 서류 {len(docs)}개")

    by_category: dict[str, int] = {}
    for entry in terms:
        by_category[entry["category"]] = by_category.get(entry["category"], 0) + 1
    print("\n분야별 용어")
    for category, count in sorted(by_category.items(), key=lambda kv: -kv[1]):
        print(f"  {category:4} {count}개")

    unverified = [e["term"] for e in terms if not e.get("verified")]
    unverified += [e["name"] for e in docs if not e.get("verified")]
    if unverified:
        print(f"\n확인 필요 {len(unverified)}건")
        for name in unverified:
            print(f"  · {name}")
    return 0


def main() -> int:
    args = sys.argv[1:]
    if not args or args[0] == "--demo":
        return run_demo()
    if args[0] == "--stats":
        return run_stats()
    if args[0] == "--doc":
        if len(args) < 2:
            print("서류명을 적어주세요. 예: --doc 사업자등록증명")
            return 1
        entry = find_document(" ".join(args[1:]))
        if not entry:
            print(f"사전에 없습니다: {' '.join(args[1:])}")
            print("policy_data/terms.json 의 documents 에 추가하면 됩니다.")
            return 1
        print_document(entry)
        return 0
    if args[0] == "--file":
        text = Path(args[1]).read_text(encoding="utf-8", errors="replace")
    else:
        text = " ".join(args)

    hits = find_terms(text)
    if not hits:
        print("사전에 있는 용어가 나오지 않았습니다.")
        return 0
    print(f"찾은 용어 {len(hits)}개")
    for entry in hits:
        print_term(entry)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
