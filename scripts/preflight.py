#!/usr/bin/env python3
"""시연 직전 점검.  발표 20분 전에 한 번 돌린다.

    python3 scripts/preflight.py
    python3 scripts/preflight.py https://ai-hwaseong-ten.vercel.app

무대에 올라가서 눌렀는데 안 되는 것을 미리 잡는 게 목적이다. 그래서
"살아있나" 만 보지 않고 **시연에서 실제로 누르는 경로**를 그대로 밟는다.

특히 LLM 키를 하나씩 따로 찔러본다. 평소에는 1번 키가 살아 있는 한
요청이 전부 1번으로 나가서, 2번 키가 죽어 있어도 **1번이 바닥나는 순간에야**
알게 된다. 그 순간이 하필 시연 중이다.

Groq 무료 등급은 하루 토큰 한도가 있다(계정당 100,000). 이 점검은 짧은
프롬프트만 쓰지만, 그래도 리허설 때마다 돌리지는 말 것.

종료 코드
    0   시연 가능
    1   시연에 지장 있음 — 무엇이 문제인지 마지막에 요약된다
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://ai-hwaseong-ten.vercel.app").rstrip("/")
TIMEOUT = 60

# 발표 자료에 박아둔 값. 여기서 어긋나면 슬라이드가 틀린 숫자를 말하게 된다.
EXPECT_NOTICES = 59
EXPECT_TERMS = 31

# 8장 시연 표에 적힌 값 (2026-08-19 기준)
EXPECT_MATCH = {
    "예비창업 카페": 11,
    "운영중 음식점": 30,
    "운영중 소매업": 27,
}

PROFILES = {
    "예비창업 카페": {"business_status": "예비창업자", "category": "카페",
                  "categories": ["카페"], "region": "화성시", "age": 30},
    "운영중 음식점": {"business_status": "운영중", "category": "음식점",
                  "categories": ["음식점"], "region": "화성시", "age": 45,
                  "business_period_months": 24},
    "운영중 소매업": {"business_status": "운영중", "category": "소매업",
                  "categories": ["소매업"], "region": "경기도", "age": 52,
                  "business_period_months": 60},
}

fatal: list[str] = []   # 시연이 안 되는 것
warn: list[str] = []    # 되긴 하는데 알고 있어야 하는 것


def line(mark: str, name: str, detail: str = "") -> None:
    print(f"  {mark} {name:<22} {detail}")


def get(path: str) -> tuple[int, dict | None]:
    try:
        with urllib.request.urlopen(BASE + path, timeout=TIMEOUT) as r:
            body = r.read().decode("utf-8", "replace")
            try:
                return r.status, json.loads(body)
            except json.JSONDecodeError:
                return r.status, None
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8", "replace"))
        except Exception:
            return e.code, None
    except Exception:
        return 0, None


def post(path: str, payload: dict) -> tuple[int, dict | None]:
    req = urllib.request.Request(
        BASE + path, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status, json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8", "replace"))
        except Exception:
            return e.code, None
    except Exception:
        return 0, None


# ── 1. 화면 ──────────────────────────────────────────────────
# 해시 라우트다. /apply 를 직접 치면 404 가 나는 게 정상이라 여기서
# 확인하는 것은 "정적 파일이 서빙되는가" 까지다.

def check_pages() -> None:
    print("\n[1] 화면")
    bad = []
    for path in ("/", "/#/home", "/#/apply", "/#/district", "/#/schedule", "/#/notice"):
        code, _ = get(path)
        if code != 200:
            bad.append(f"{path}({code})")
    if bad:
        fatal.append("화면이 안 열린다: " + ", ".join(bad))
        line("❌", "여섯 경로", " / ".join(bad))
    else:
        line("✅", "여섯 경로", "전부 200")


# ── 2. 데이터와 키 ───────────────────────────────────────────

def check_health() -> None:
    print("\n[2] 데이터와 키")
    code, d = get("/api/health")
    if code != 200 or not d:
        fatal.append("/api/health 가 응답하지 않는다")
        line("❌", "health", f"HTTP {code}")
        return

    n = d.get("notices", 0)
    if n == 0:
        fatal.append("공고가 0건이다 — 매칭이 아무것도 못 돌려준다")
        line("❌", "공고", "0건")
    elif n != EXPECT_NOTICES:
        warn.append(f"공고가 {n}건이다 (슬라이드는 {EXPECT_NOTICES}건). 자동 갱신으로 늘었을 수 있다")
        line("⚠️ ", "공고", f"{n}건 — 슬라이드는 {EXPECT_NOTICES}건")
    else:
        line("✅", "공고", f"{n}건")

    if d.get("database", {}).get("connected"):
        line("✅", "Supabase", "연결됨")
    else:
        warn.append("Supabase 가 끊겼다 — 카카오 로그인과 온보딩 저장이 안 된다")
        line("⚠️ ", "Supabase", "끊김 — 로그인 없이 둘러보기로 시연할 것")

    c = d.get("configured", {})
    groq, gem = c.get("GROQ_API_KEY", 0), c.get("GEMINI_API_KEY", 0)
    if isinstance(groq, bool):    # 옛 배포는 True/False 로 준다
        groq, gem = int(groq), int(c.get("GEMINI_API_KEY", False))
    line("✅" if groq else "❌", "Groq 키", f"{groq}개")
    line("✅" if gem else "⚠️ ", "Gemini 키", f"{gem}개 (예비)")
    if groq + gem == 0:
        fatal.append("LLM 키가 하나도 없다 — 챗봇과 서류 체크리스트가 죽는다")
    return groq


# ── 3. 용어 사전 ─────────────────────────────────────────────

def check_terms() -> None:
    print("\n[3] 용어 사전")
    code, d = get("/api/terms")
    if code != 200 or d is None:
        fatal.append("/api/terms 가 응답하지 않는다 — 용어 풀이가 죽는다")
        line("❌", "용어", f"HTTP {code}")
        return
    n = len(d) if isinstance(d, list) else len(d.get("terms", d))
    mark = "✅" if n == EXPECT_TERMS else "⚠️ "
    if n != EXPECT_TERMS:
        warn.append(f"용어가 {n}개다 (슬라이드는 {EXPECT_TERMS}개)")
    line(mark, "용어", f"{n}개")


# ── 4. 매칭 ─────────────────────────────────────────────────
# 시연의 심장이다. 세 프로필을 그대로 돌려서 슬라이드 숫자와 맞는지 본다.

def check_match() -> None:
    print("\n[4] 매칭 — 8장 시연 표와 대조")
    for name, prof in PROFILES.items():
        code, d = post("/api/match", {"user_profile": prof})
        if code != 200 or not d:
            fatal.append(f"매칭이 안 된다 ({name}) — 시연 자체가 불가능하다")
            line("❌", name, f"HTTP {code}")
            continue
        results = d.get("results", [])
        ok = sum(1 for r in results if r["overall_status"] == "신청가능")
        want = EXPECT_MATCH[name]
        top = next((r for r in results if r["overall_status"] != "대상아님"), None)
        detail = f"신청가능 {ok}건"
        if ok != want:
            warn.append(f"{name} 신청가능이 {ok}건이다 (슬라이드는 {want}건)")
            detail += f" — 슬라이드는 {want}건"
        if top:
            detail += f"  |  1위 {top['match_score']}점 {top.get('notice_title', '')[:24]}"
        line("✅" if ok == want else "⚠️ ", name, detail)

        scores = {r["match_score"] for r in results}
        if len(scores) < 8:
            warn.append(f"{name} 점수 종류가 {len(scores)}가지뿐이다 — 순위가 뭉쳤다")


# ── 5. LLM ──────────────────────────────────────────────────
# 키를 하나씩 따로 찔러본다. 이게 이 점검의 핵심이다.

def probe(label: str, payload: dict, critical: bool) -> bool:
    code, d = post("/api/llm", payload)
    if code == 200 and d and "text" in d:
        model = d.get("model", "?")
        line("✅", label, f"{d.get('provider')} / {model}")
        return True
    reason = ""
    if d and d.get("tried"):
        reason = str(d["tried"][0])[:70]
    elif d:
        reason = str(d.get("error"))[:70]
    line("❌" if critical else "⚠️ ", label, f"HTTP {code}  {reason}")
    return False


def check_llm(groq_keys: int) -> None:
    print("\n[5] LLM — 키를 하나씩 확인")
    alive = 0
    for slot in range(1, max(1, groq_keys) + 1):
        if probe(f"Groq {slot}번 키", {"prompt": "한 글자로: 네", "slot": slot}, False):
            alive += 1
    gemini = probe("Gemini (예비)", {"prompt": "한 글자로: 네", "provider": "gemini"}, False)

    if alive == 0 and not gemini:
        fatal.append("LLM 이 전부 죽었다 — 챗봇과 서류 체크리스트를 시연할 수 없다")
    elif alive == 0:
        warn.append("Groq 키가 전부 막혔다. Gemini 예비로만 돈다 — 한도가 더 빡빡하다")
    elif alive < max(1, groq_keys):
        warn.append(f"Groq 키 {max(1, groq_keys) - alive}개가 막혔다. 남은 것으로 돈다")

    # 서류 체크리스트가 쓰는 경로. 여기가 막히면 10장 시연이 죽는다.
    print()
    code, d = post("/api/llm", {"prompt": "사업자등록증과 통장 사본을 목록으로", "json": True})
    if code == 200 and d and "text" in d:
        try:
            json.loads(d["text"])
            line("✅", "JSON 모드", "서류 체크리스트 경로 정상")
        except json.JSONDecodeError:
            warn.append("JSON 모드 응답이 파싱되지 않는다 — 서류 체크리스트가 흔들릴 수 있다")
            line("⚠️ ", "JSON 모드", "응답이 JSON 이 아니다")
    else:
        fatal.append("JSON 모드가 죽었다 — 서류 체크리스트를 시연할 수 없다")
        line("❌", "JSON 모드", f"HTTP {code}")


def main() -> int:
    print(f"\n시연 직전 점검 — {BASE}")
    print("=" * 62)
    check_pages()
    groq = check_health() or 0
    check_terms()
    check_match()
    check_llm(groq)

    print("\n" + "=" * 62)
    if fatal:
        print("❌ 시연에 지장이 있다\n")
        for x in fatal:
            print(f"   · {x}")
    else:
        print("✅ 시연 가능")
    if warn:
        print("\n알고는 있을 것")
        for x in warn:
            print(f"   · {x}")
    print()
    return 1 if fatal else 0


if __name__ == "__main__":
    raise SystemExit(main())
