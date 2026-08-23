#!/usr/bin/env python3
"""발표 덱(mars-fit-part1.html)의 SCRIPT 배열을 대본 md 로 뽑는다.

숫자는 손으로 옮겨 적지 않는다 — 덱에서 그대로 읽어 온다.
검증 결과에서 나온 주의사항만 여기서 붙인다.
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path

SRC = Path(sys.argv[1])          # mars-fit-part1.html
OUT = Path(sys.argv[2])          # 발표대본.md
VIDEO = 155                      # 시연 영상 2:35 (영상_C.mp4 실측)
RATE = 7.0                       # 한국어 낭독 현실 상한 (자/초)


def load_script(path: Path) -> list[dict]:
    src = path.read_text(encoding="utf-8")
    i = src.index("const SCRIPT = [")
    j = src.index("\n    ];", i)
    return json.loads(src[i + len("const SCRIPT = "):j + len("\n    ]")])


def plain(line: str) -> str:
    return line.replace("**", "")


def mmss(sec: int) -> str:
    return f"{sec // 60}:{sec % 60:02d}"


# ── 검증에서 나온 주의사항. 장 번호 → (등급, 문장) ──────────────
# 등급 fix = 말하기 전에 반드시 고칠 것 / warn = 알고만 있을 것
NOTES: dict[int, list[tuple[str, str]]] = {
    7: [
        ("fix",
         "**「본문이 뽑힌 건 53%뿐」은 49% 로 고칠 것.** 배포된 59건 중 첨부 공고문 텍스트를 "
         "확보한 것은 **29건 = 49%** 다. 53%(31건)는 다운로드 성공 파일 수인데 그중 2건은 "
         "나중에 제외된 공고 것이라 화면에 없다. 커밋 기록에도 41% → 49% 로 남아 있다."),
        ("warn",
         "이 장은 약점 고백이 아니라 **문제 정의**다. ① 공개는 됐는데 기계가 못 읽는다 → "
         "그래서 아무도 안 했다, ② 그래서 「확인필요」라는 상태를 만들었다, "
         "③ 공고를 HWP 대신 텍스트 PDF 로 내주시면 바로 올라간다. "
         "**방어적으로 말하면 변명, 담담하게 말하면 신뢰다.**"),
        ("warn", "접수처 21곳 · 서류 51종 · 공고당 평균 3.3종(194÷59=3.29) — 전부 확인됨."),
    ],
    10: [("warn", "10건 · 30건은 배포 서버에서 다시 확인했다. 맞는 숫자다.")],
    11: [
        ("fix",
         "**「용어는 공고문 위에서 탭 한 번」은 지금 사실이 아니다.** 용어 툴팁이 "
         "`onMouseEnter`/`onMouseLeave` 로만 열린다(`NoticeDetail.jsx` · `OrbitDashboard.jsx`). "
         "터치로는 안 열린다. 고치기 전이라면 **「용어는 공고문 위에 바로 뜹니다」** 로 바꿔 말할 것."),
        ("warn", "접수처 21곳 · 서류 51종 · 행정용어 31개 · 고시공고 9,458건 · 새벽 6시 11분 — 전부 확인됨."),
    ],
    12: [
        ("fix",
         "**26초에 333자다. 초당 12.8자 — 물리적으로 불가능하다.** 편하게 읽으면 **50초**가 필요하다. "
         "시간을 늘리든지, 「LLM 이 도는 다섯 군데」 열거를 「업종 읽기·요약·서류 안내·체크리스트·챗봇, 다섯 군데」로 "
         "한 호흡에 줄이든지 둘 중 하나를 해야 한다."),
        ("warn", "Hit@1 1.00 대 0.80 은 `llm/report/embedding_benchmark.md` 와 일치한다."),
    ],
    13: [
        ("fix",
         "**「2026년은 10개 중 8개가 밀립니다」는 틀렸다.** 다시 세면 **서로 다른 법정기한 날짜 10개 중 6개**이고, "
         "**일정 13건 기준으로는 9건**이다. 「10개 중 6개」로 말할 것. 종합소득세 6월 1일은 맞다."),
        ("fix",
         "**「상권분석에 공공데이터 5종」은 과장이다.** 화면에 실제로 붙은 실데이터는 "
         "**상가 17,073곳 · 학교 188개교 · 역 10곳 세 종류**다. 아파트와 유동인구는 추정치다 "
         "(뒤 문장에서 그렇게 말하고 있으니 앞 문장만 「세 종류」로 고치면 앞뒤가 맞는다)."),
        ("warn",
         "**「공고 자동 갱신은 지금도 돌고 있습니다」** — 사실이지만, **오늘(8/20) 아침 실행은 실패했다.** "
         "기업마당 API 가 GitHub Actions 러너에서 응답하지 않았다. 데이터에는 이상이 없다. "
         "질문이 나오면 그렇게 답할 것."),
        ("warn", "39초에 343자 = 초당 8.8자. 빡빡하다. **55초**를 잡는 게 안전하다."),
    ],
    15: [("warn", "발표 중에는 넘기지 않는다. 질의응답 전용.")],
}

BADGE = {"fix": "고칠 것", "warn": "알아둘 것"}


def main() -> int:
    script = load_script(SRC)
    total = sum(s["sec"] for s in script)

    # 장별 누적 (10장 뒤에 영상이 붙는다)
    rows, clock = [], 0
    for s in script:
        chars = sum(len(plain(l)) for l in s["lines"])
        start = clock
        clock += s["sec"]
        if s["n"] == 10:
            clock += VIDEO
        rows.append({"s": s, "start": start, "end": clock, "chars": chars})

    spoken = sum(r["chars"] for r in rows if r["s"]["sec"] > 0)
    need = round(spoken / RATE)

    L: list[str] = []
    w = L.append

    w("# Mars-Fit 발표 대본")
    w("")
    w("2026 AI화성 챌린지 1차 예선 · 팀 11 「쪈임」 · 발표 임대윤")
    w("")
    w("발표 덱(아티팩트 「5.4조를 모르는 사람들」)의 대본을 그대로 뽑은 것이다.")
    w("**덱을 고치면 이 파일도 다시 뽑아야 한다** — 손으로 고치지 말 것.")
    w("")
    w("| | |")
    w("|---|---|")
    w(f"| 대본 (덱 설정값) | {total}초 = **{mmss(total)}** |")
    w(f"| 시연 영상 | {VIDEO}초 = **{mmss(VIDEO)}** (10장 뒤) |")
    w(f"| 합계 | {total + VIDEO}초 = **{mmss(total + VIDEO)}** |")
    w(f"| 발표 시간 | 600초 = 10:00 |")
    w(f"| 덱 기준 여유 | {600 - total - VIDEO}초 |")
    w("")
    w("---")
    w("")
    w("## ⚠ 무대에 서기 전에")
    w("")
    w("### 1. 시간이 덱 계산보다 빠듯하다")
    w("")
    w(f"대본 전체가 **{spoken}자**다. 한국어를 또박또박 읽으면 **초당 {RATE:.0f}자**가 현실적인 상한이다.")
    w(f"그 속도로 읽으면 말만 **{need}초 = {mmss(need)}**, 영상까지 더하면 **{mmss(need + VIDEO)}**다.")
    w(f"덱이 잡아둔 {mmss(total)}는 초당 {spoken / total:.1f}자를 전제로 한다 — **빨리 읽어야 맞는 숫자다.**")
    w("")
    w("> **대비:** 15장(출처)은 원래 안 넘긴다. 시간이 밀리면 **13장의 「신청기간 알림과 OCR 은 2차입니다」**")
    w("> 한 줄과 **11장 넷째 항목(고시공고 9,458건)**을 버린다. 이 둘은 빠져도 논리가 끊기지 않는다.")
    w("")
    w("### 2. 말하기 전에 반드시 고칠 것")
    w("")
    for n in sorted(NOTES):
        for kind, text in NOTES[n]:
            if kind == "fix":
                w(f"- **{n}장** — {text}")
    w("")
    w("---")
    w("")
    w("## 시간 배분")
    w("")
    w("| 장 | 제목 | 초 | 구간 | 글자 | 자/초 |")
    w("|---:|---|---:|---|---:|---:|")
    for r in rows:
        s = r["s"]
        rate = f"{r['chars'] / s['sec']:.1f}" if s["sec"] else "—"
        mark = " ⚠" if s["sec"] and r["chars"] / s["sec"] > 7.5 else ""
        w(f"| {s['n']} | {s['t']} | {s['sec']} | {mmss(r['start'])}–{mmss(r['end'])} "
          f"| {r['chars']} | {rate}{mark} |")
    w(f"| | **합계** | **{total}** | **+영상 {mmss(VIDEO)} = {mmss(total + VIDEO)}** | **{spoken}** | |")
    w("")
    w("⚠ = 초당 7.5자를 넘는다. 그 속도로는 안 읽힌다.")
    w("")
    w("---")
    w("")
    w("## 대본")
    w("")
    w("**굵은 글씨는 힘주어 읽는 곳**이다. 문장 사이에 한 박자씩 둔다.")
    w("")

    for r in rows:
        s = r["s"]
        w("---")
        w("")
        if s["sec"]:
            w(f"### {s['n']}장 · {s['t']}")
            w("")
            w(f"`{mmss(r['start'])} → {mmss(r['end'])}` · **{s['sec']}초** · {r['chars']}자")
        else:
            w(f"### {s['n']}장 · {s['t']} — 넘기지 않음")
            w("")
        w("")
        for line in s["lines"]:
            w(f"> {line}")
            w(">")
        if L[-1] == ">":
            L.pop()
        w("")
        if s["n"] == 10:
            w(f"> ## ▶ 여기서 시연 영상 — {mmss(VIDEO)}")
            w(">")
            w("> 영상이 끝나면 **1초 쉬고** 11장으로 넘어간다.")
            w("")
        for kind, text in NOTES.get(s["n"], []):
            w(f"**［{BADGE[kind]}］** {text}")
            w("")

    w("---")
    w("")
    w("## 부록 — 이 파일 다시 만들기")
    w("")
    w("```bash")
    w("python3 scripts/deck_script_md.py  <덱 html 경로>  docs/발표/발표대본.md")
    w("python3 scripts/deck_script_pdf.py docs/발표/발표대본.md docs/발표/출력/발표대본.pdf")
    w("```")
    w("")
    w("`deck_script_pdf.py` 는 pandoc 없이 fpdf2 로 직접 그린다. 한글은 Noto Sans CJK KR 을")
    w("`/usr/share/fonts/opentype/noto/NotoSansCJK-*.ttc` 에서 뽑아 쓴다. `pip install fpdf2` 필요.")
    w("")
    w("*덱의 `SCRIPT` 배열과 `VIDEO_SEC` 를 읽어 만든다. 2026-08-20 기준.*")

    OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"{OUT} — {len(L)}줄 / 대본 {total}초 + 영상 {VIDEO}초 = {mmss(total + VIDEO)}")
    print(f"낭독 실측 추정: {spoken}자 ÷ {RATE}자/초 = {need}초 → 영상 포함 {mmss(need + VIDEO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
