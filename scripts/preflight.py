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

[6] 은 Vercel 밖(pjrx.kr)까지 실제로 나간다. 거기가 꺼져 있으면 우리 중계는
조용히 503 을 돌려주고 **화면은 멀쩡히 뜬다** — 지도만 안 채워져서 눈으로는
모른다. 그래서 사진 한 장과 좌표 하나를 진짜로 보내본다. 유동인구만 중계까지만
보는데, 그 길은 Overpass 와 LLM 을 함께 태워서 점검이 Groq 한도를 먹는다.

종료 코드
    0   시연 가능
    1   시연에 지장 있음 — 무엇이 문제인지 마지막에 요약된다
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://ai-hwaseong-ten.vercel.app").rstrip("/")
TIMEOUT = 60

# **정확한 숫자를 기대하지 않는다.** 전에는 발표 자료에 박아둔 값과 대조했는데
# (공고 59건·용어 31개·음식점 30건·소매업 27건), 공고는 매일 새벽 cron 이
# 갱신해서 하루만 지나도 어긋난다. 실제로 넉 달 만에 59 → 80건이 됐다.
#
# 그러면 돌릴 때마다 노란불이 네 개씩 뜬다. 시연 20분 전에 보는 화면이
# 늘 노란불이면 **진짜 문제가 그 사이에 섞여도 안 보인다.** 경고는 드물어야
# 경고다.
#
# 그래서 「슬라이드랑 같나」가 아니라 「말이 되나」만 본다. 공고가 76건이든
# 84건이든 시연은 똑같이 된다. 3건이면 수집이 깨진 것이고, 0건이면 매칭이
# 아무것도 못 돌려준다. 그 차이만 잡으면 된다.
MIN_NOTICES = 20        # 이 아래면 수집이 깨졌다고 본다 (평소 80건 안팎)
MIN_MATCH = 1           # 신청가능이 0건이면 보여줄 화면이 없다

# OCR 서버에 보낼 시험용 사진. 64×64 흰 png 132바이트다. 등록증이 아니라
# 아무것도 안 적힌 그림이라 서버는 빈 결과를 돌려주는데, 우리가 보려는 건
# **읽은 내용이 아니라 사진 한 장이 서버까지 갔다 왔는가**다.
BLANK_PNG = (
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAS0lEQVR42u3PMQ0AAAwDoPo33"
    "UrYvQQckD4XAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAY"
    "HLAMpT0sIcNbcEAAAAAElFTkSuQmCC"
)

# 동탄역 근처. 화성시 안이면서 음식점이 실제로 빽빽한 곳이라, 여기서
# 음식점이 0건이면 좌표가 아니라 데이터가 안 올라온 것이다. 역·학교는
# 0이 나올 수 있어서(동탄역은 SRT 라 코레일 지하철 목록에 없다) 안 본다.
DEMO_LATLNG = {"lat": 37.2001, "lng": 127.0735}

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
    elif n < MIN_NOTICES:
        warn.append(f"공고가 {n}건뿐이다 (평소 80건 안팎). 수집이 깨졌는지 볼 것 — "
                    f"mars-fit-cron-logs/last-run.txt")
        line("⚠️ ", "공고", f"{n}건 — 너무 적다")
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
    if n == 0:
        fatal.append("용어가 0개다 — 어려운 말에 밑줄이 안 그어진다")
        line("❌", "용어", "0개")
    else:
        line("✅", "용어", f"{n}개")


# ── 4. 매칭 ─────────────────────────────────────────────────
# 시연의 심장이다. 세 프로필을 그대로 돌린다.
#
# **건수를 기대값과 맞추지 않는다.** 공고가 매일 바뀌니 신청가능도 매일
# 바뀐다. 시연이 안 되는 경우는 하나뿐이다 — 신청가능이 0건이라 보여줄
# 카드가 없는 것. 나머지는 숫자만 찍어주고 넘어간다.
#
# 1위를 같이 찍는 이유는 따로 있다. 엉뚱한 공고가 1위로 올라오는 사고가
# 실제로 났다(카페 사장님 홈 1위에 반도체 소부장 실증 공고가 89점으로).
# 건수는 멀쩡한데 1위만 이상한 경우라 숫자로는 안 잡힌다. 눈으로 볼 것.

def check_match() -> None:
    print("\n[4] 매칭 — 세 프로필을 그대로 돌린다")
    for name, prof in PROFILES.items():
        code, d = post("/api/match", {"user_profile": prof})
        if code != 200 or not d:
            fatal.append(f"매칭이 안 된다 ({name}) — 시연 자체가 불가능하다")
            line("❌", name, f"HTTP {code}")
            continue
        results = d.get("results", [])
        ok = sum(1 for r in results if r["overall_status"] == "신청가능")
        top = next((r for r in results if r["overall_status"] != "대상아님"), None)
        detail = f"신청가능 {ok}건"
        if top:
            detail += f"  |  1위 {top['match_score']}점 {top.get('notice_title', '')[:24]}"
        if ok < MIN_MATCH:
            fatal.append(f"{name} 신청가능이 0건이다 — 홈에 보여줄 공고가 없다")
            line("❌", name, detail)
            continue
        line("✅", name, detail)

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


# ── 6. 외부 서버 ─────────────────────────────────────────────
# OCR 과 상권분석은 Vercel 밖 pjrx.kr 에서 돈다. 여기가 꺼지면 우리 쪽
# 중계는 **조용히 503 을 돌려준다.** 화면은 멀쩡히 뜨고 지도만 안 채워지니,
# 눈으로 보기 전에는 모른다. 무대에서 그걸 처음 알게 하지 않으려고 여기서
# 실제로 한 번씩 찔러본다.
#
# 무거운 것을 부르지 않는다. 유동인구는 Overpass 와 LLM 을 함께 태우는데,
# 리허설마다 그걸 돌리면 Groq 하루 한도를 점검이 먹는다. 그래서 유동인구는
# **중계와 열쇠까지만** 본다 — 그 위는 [5] 에서 이미 확인한 것과 같은 키다.

def http(code: int) -> str:
    """0 은 응답이 아니라 아예 못 닿았다는 뜻이다. HTTP 0 이라고 쓰면 헷갈린다."""
    return "닿지 않음" if code == 0 else f"HTTP {code}"


def check_external() -> None:
    print("\n[6] 외부 서버 — pjrx.kr")

    # ① 사진 한 장을 실제로 보내본다
    t0 = time.time()
    code, d = post("/api/ocr", {"image": "data:image/png;base64," + BLANK_PNG,
                                "mimeType": "image/png"})
    took = time.time() - t0
    if code == 200 and isinstance(d, dict) and "result" in d:
        line("✅", "OCR 사진", f"{took:.1f}초 만에 돌아왔다")
    elif code == 503:
        warn.append("OCR 서버가 꺼져 있다 — 온보딩이 사진 화면을 안 내고 직접 입력으로 간다. "
                    "켜려면 scripts/run_ocr.sh, 주소가 바뀌었으면 Vercel 의 OCR_BACKEND_URL")
        line("⚠️ ", "OCR 사진", "503 — 서버가 꺼져 있다 (직접 입력으로 대신한다)")
    else:
        warn.append(f"/api/ocr — {http(code)}. 사진 읽기를 시연하지 말 것")
        line("⚠️ ", "OCR 사진", http(code))

    # ② 상권분석. 이건 대신할 것이 없어서 꺼지면 화면이 빈 채로 뜬다
    code, d = post("/api/commercial", {**DEMO_LATLNG, "radii": {
        "schools": 500, "restaurants": 500, "cafes": 500,
        "academies": 500, "stations": 1000}})
    counts = (d or {}).get("counts") or {}
    if code == 200 and counts.get("restaurants"):
        line("✅", "상권분석", " · ".join(
            f"{ko} {counts.get(k, 0)}" for k, ko in
            (("restaurants", "음식점"), ("cafes", "카페"), ("academies", "학원"))))
    elif code == 200:
        fatal.append("상권분석이 동탄역에서 음식점 0건을 돌려준다 — 서버는 떴는데 CSV 를 못 읽은 것")
        line("❌", "상권분석", "음식점 0건 — CSV 가 안 올라왔다")
    else:
        fatal.append(f"상권분석 — {http(code)}. 비사업자 화면이 빈 채로 뜬다. "
                     "외부 서버가 떠 있는지, Vercel 의 OCR_BACKEND_URL 이 맞는지 볼 것")
        line("❌", "상권분석", f"{http(code)} — 지도에 아무것도 안 찍힌다")

    # ③ 유동인구는 중계까지만. 빈 요청은 서버까지 안 가고 400 으로 되돌아온다.
    #    그 400 이 나오려면 OCR_BACKEND_URL 과 OCR_SHARED_SECRET 이 둘 다
    #    있어야 한다 — 없으면 그 앞에서 503 이다. 열쇠까지 한 번에 확인된다.
    code, _ = post("/api/foottraffic", {})
    if code == 400:
        line("✅", "유동인구 중계", "주소·열쇠 둘 다 있다 (Overpass·LLM 은 안 불렀다)")
    elif code == 503:
        warn.append("유동인구가 503 — OCR_BACKEND_URL 이 비어 있다")
        line("⚠️ ", "유동인구 중계", "503 — 주소가 설정되지 않았다")
    else:
        warn.append(f"유동인구 중계 — {http(code)}")
        line("⚠️ ", "유동인구 중계", http(code))


def main() -> int:
    print(f"\n시연 직전 점검 — {BASE}")
    print("=" * 62)
    check_pages()
    groq = check_health() or 0
    check_terms()
    check_match()
    check_llm(groq)
    check_external()

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
