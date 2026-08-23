#!/usr/bin/env python3
"""발표대본.md → PDF.

pandoc·wkhtmltopdf 가 없는 서버라 fpdf2 로 직접 그린다.
한글 글꼴은 Noto Sans CJK KR 을 TTC 에서 뽑아 쓴다.

    python3 scripts/deck_script_pdf.py docs/발표/발표대본.md docs/발표/출력/발표대본.pdf
"""
from __future__ import annotations
import re, sys
from pathlib import Path
from fpdf import FPDF
from fontTools.ttLib import TTFont

TTC_R = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
TTC_B = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
KR_INDEX = 1                      # TTC 안에서 KR 페이스 위치
# ASCII 다이어그램은 등폭이어야 줄이 맞는다. 한글은 이 글꼴에 없어서
# 넓은 글자만 CJK 글꼴로 따로 그린다.
MONO = "/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf"
CACHE = Path(__file__).resolve().parent.parent / ".fontcache"

NAVY = (42, 60, 119)
INK = (26, 26, 26)
MUTED = (122, 106, 88)
ALARM = (203, 107, 61)
QUOTE_BG = (246, 245, 240)
NOTE_BG = (253, 244, 236)
RULE = (206, 200, 188)

# 글꼴에 없는 기호는 글자로 바꾼다. 없는 채로 넘기면 빈칸이 된다.
SUBST = {"⚠": "[!]", "▶": "▷", "☞": "→", "✅": "[O]", "❌": "[X]"}


def ensure_font(ttc: str, out: Path) -> Path:
    if not out.exists():
        TTFont(ttc, fontNumber=KR_INDEX).save(str(out))
    return out


def clean(text: str) -> str:
    text = text.replace("`", "")
    text = re.sub(r"<(https?://[^>]+)>", r"\1", text)
    for a, b in SUBST.items():
        text = text.replace(a, b)
    return text


def mono_cmap() -> set[int]:
    f = TTFont(MONO)
    out: set[int] = set()
    for t in f["cmap"].tables:
        out |= set(t.cmap.keys())
    return out


def wide(ch: str) -> bool:
    """터미널에서 두 칸을 먹는 글자인지. 한글·한자·전각 기호."""
    o = ord(ch)
    return (0x1100 <= o <= 0x115F or 0x2E80 <= o <= 0xA4CF or
            0xAC00 <= o <= 0xD7A3 or 0xF900 <= o <= 0xFAFF or
            0xFE30 <= o <= 0xFE6F or 0xFF00 <= o <= 0xFF60 or
            0xFFE0 <= o <= 0xFFE6)


class Deck(FPDF):
    def __init__(self, title: str):
        super().__init__(format="A4")
        self.doc_title = title
        self.set_margins(18, 20, 18)
        self.set_auto_page_break(True, margin=20)
        self.add_font("nk", "", str(ensure_font(TTC_R, CACHE / "NotoKR-Regular.otf")))
        self.add_font("nk", "B", str(ensure_font(TTC_B, CACHE / "NotoKR-Bold.otf")))
        self.add_font("mono", "", MONO)
        self.mono_cmap = mono_cmap()
        self.set_font("nk", size=10)

    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("nk", size=7.5)
        self.set_text_color(*MUTED)
        self.set_y(11)
        self.cell(0, 5, self.doc_title, align="L")
        self.set_draw_color(*RULE)
        self.set_line_width(0.2)
        self.line(18, 17.5, self.w - 18, 17.5)
        self.set_text_color(*INK)
        # 머리글이 커서를 오른쪽 끝·위쪽에 두고 끝난다. 되돌리지 않으면
        # 다음 블록이 폭 0 으로 계산돼서 렌더가 통째로 실패한다.
        self.set_xy(self.l_margin, self.t_margin)

    def footer(self):
        self.set_y(-14)
        self.set_font("nk", size=7.5)
        self.set_text_color(*MUTED)
        self.cell(0, 5, str(self.page_no()), align="C")
        self.set_text_color(*INK)
        self.set_x(self.l_margin)

    # ── 블록 ──────────────────────────────────────────────
    def h1(self, text):
        self.set_x(self.l_margin)
        self.ln(2)
        self.set_font("nk", "B", 20)
        self.set_text_color(*NAVY)
        self.multi_cell(0, 10, clean(text))
        self.set_text_color(*INK)
        self.ln(1)

    def h2(self, text):
        self.set_x(self.l_margin)
        self.ln(5)
        if self.will_page_break(20):
            self.add_page()
        self.set_draw_color(*NAVY)
        self.set_line_width(0.5)
        y = self.get_y()
        self.line(18, y, self.w - 18, y)
        self.ln(2)
        self.set_font("nk", "B", 13.5)
        self.set_text_color(*NAVY)
        self.multi_cell(0, 7, clean(text))
        self.set_text_color(*INK)
        self.ln(1)

    def h3(self, text):
        self.set_x(self.l_margin)
        self.ln(3)
        if self.will_page_break(34):
            self.add_page()
        self.set_font("nk", "B", 11.5)
        self.set_text_color(*NAVY)
        self.multi_cell(0, 6, clean(text))
        self.set_text_color(*INK)
        self.ln(0.5)

    def h4(self, text):
        self.set_x(self.l_margin)
        self.ln(2.5)
        if self.will_page_break(24):
            self.add_page()
        self.set_font("nk", "B", 10)
        self.set_text_color(*INK)
        self.multi_cell(0, 5.6, clean(text))
        self.ln(0.5)

    def para(self, text, size=9.5, indent=0.0):
        self.set_font("nk", size=size)
        self.set_x(18 + indent)
        self.multi_cell(self.w - 36 - indent, 5.2, clean(text), markdown=True)
        self.ln(1)

    def bullet(self, text):
        self.set_font("nk", size=9.5)
        self.set_x(20)
        self.cell(4, 5.2, "·")
        self.multi_cell(self.w - 42, 5.2, clean(text), markdown=True)
        self.ln(0.6)

    def numbered(self, marker, text):
        self.set_font("nk", size=9.5)
        self.set_x(20)
        w = self.get_string_width(marker) + 1.5
        self.set_font("nk", "B", 9.5)
        self.cell(w, 5.2, marker)
        self.set_font("nk", size=9.5)
        self.multi_cell(self.w - 38 - w, 5.2, clean(text), markdown=True)
        self.ln(0.6)

    def rule(self):
        self.set_x(self.l_margin)
        self.ln(2)
        self.set_draw_color(*RULE)
        self.set_line_width(0.2)
        y = self.get_y()
        self.line(18, y, self.w - 18, y)
        self.ln(3)

    def code(self, lines):
        """ASCII 다이어그램. 터미널처럼 한 칸씩 찍어야 선이 맞는다.

        한글은 두 칸, 나머지는 한 칸으로 잡고 좌표를 직접 계산한다.
        비례 글꼴로 통째로 흘리면 └ ┼ 같은 선이 어긋난다.
        """
        lines = [clean(b).rstrip() for b in lines]
        while lines and not lines[0]:
            lines.pop(0)
        while lines and not lines[-1]:
            lines.pop()
        if not lines:
            return
        cols = max(sum(2 if wide(c) else 1 for c in b) for b in lines)
        avail = self.w - 36 - 6

        self.set_font("mono", size=10)
        cw10 = self.get_string_width("M")           # 10pt 일 때 한 칸 너비
        size = min(8.5, 10 * avail / (cols * cw10)) if cols else 8.5
        size = max(4.2, size)
        cw = cw10 * size / 10
        self.set_font("nk", size=10)
        kr = 10 * (cw * 2) / self.get_string_width("가")   # 두 칸을 채우는 한글 크기
        lead = max(3.2, cw * 2.05)

        h = lead * len(lines) + 4
        if self.will_page_break(h) and h < self.eph - 8:
            self.add_page()
        top = self.get_y()
        drawn = 0
        while drawn < len(lines):
            room = int((self.h - self.b_margin - self.get_y() - 4) / lead)
            chunk = lines[drawn:drawn + max(1, room)]
            top = self.get_y()
            self.set_fill_color(*QUOTE_BG)
            self.rect(18, top, self.w - 36, lead * len(chunk) + 4, style="F")
            y = top + 2
            for b in chunk:
                x = 21.0
                for ch in b:
                    w = cw * 2 if wide(ch) else cw
                    if ch != " ":
                        if wide(ch):
                            self.set_font("nk", size=kr)
                        elif ord(ch) in self.mono_cmap:
                            self.set_font("mono", size=size)
                        else:
                            # ① 처럼 등폭 글꼴에 없는 기호. CJK 글꼴로 그리되
                            # 한 칸을 넘지 않게 줄인다.
                            self.set_font("nk", size=10)
                            gw = self.get_string_width(ch) or cw
                            self.set_font("nk", size=min(size, 10 * cw / gw))
                        self.set_xy(x, y)
                        self.cell(w, lead, ch, align="C")
                    x += w
                y += lead
            self.set_xy(self.l_margin, top + lead * len(chunk) + 4)
            drawn += len(chunk)
            if drawn < len(lines):
                self.add_page()
        self.ln(2)

    def box(self, lines, bg, bar, size=10.0, lead=5.6):
        """왼쪽 색 막대 + 옅은 배경. 대본 대사와 주의사항에 쓴다."""
        self.set_x(self.l_margin)
        pad, barw = 3.5, 1.8
        inner = self.w - 36 - pad * 2 - barw
        self.set_font("nk", size=size)
        top = self.get_y()
        # 높이를 먼저 재서 페이지를 넘길지 정한다
        h = pad
        for ln_ in lines:
            if ln_.startswith("## "):
                self.set_font("nk", "B", size + 2.5)
                n = len(self.multi_cell(inner, lead + 2, clean(ln_[3:]).replace("**", ""),
                                        dry_run=True, output="LINES"))
                h += (lead + 2) * max(1, n)
                self.set_font("nk", size=size)
            else:
                h += lead * max(1, len(self.multi_cell(inner, lead, clean(ln_), markdown=True,
                                                       dry_run=True, output="LINES")))
            h += 1.2
        h += pad - 1.2
        if self.will_page_break(h):
            self.add_page()
            top = self.get_y()
        self.set_fill_color(*bg)
        self.rect(18, top, self.w - 36, h, style="F")
        self.set_fill_color(*bar)
        self.rect(18, top, barw, h, style="F")
        self.set_xy(18 + barw + pad, top + pad * 0.55)
        for ln_ in lines:
            self.set_x(18 + barw + pad)
            if ln_.startswith("## "):
                self.set_font("nk", "B", size + 2.5)
                self.set_text_color(*bar)
                self.multi_cell(inner, lead + 2, clean(ln_[3:]).replace("**", ""))
                self.set_text_color(*INK)
                self.set_font("nk", size=size)
            else:
                self.multi_cell(inner, lead, clean(ln_), markdown=True)
            self.ln(1.2)
        self.set_y(top + h + 2.5)

    def table(self, rows):
        """셀 안에서 줄바꿈되는 표. 긴 설명 칸이 있어도 넘치지 않는다."""
        self.set_x(self.l_margin)
        if all(not c.strip() for c in rows[0]):
            rows = rows[1:]                      # 「| | |」 처럼 비어 있는 머리글은 버린다
            head, body = None, rows
        else:
            head, body = rows[0], rows[1:]
        if not rows:
            return
        cols = len(rows[0])
        avail = self.w - 36
        pad, lead = 1.8, 4.6
        size = 8.5 if cols <= 4 else 7.8
        self.set_font("nk", size=size)

        # 1) 칸마다 「안 접었을 때 필요한 폭」을 잰다
        nat = []
        for i in range(cols):
            longest = 0.0
            for r in rows:
                txt = clean(r[i])
                self.set_font("nk", "B" if "**" in txt else "", size)
                longest = max(longest, self.get_string_width(txt.replace("**", "")))
            nat.append(longest + pad * 2 + 1)
        self.set_font("nk", size=size)

        # 2) 합이 남으면 비례로 늘리고, 넘치면 좁은 칸부터 제 폭을 주고
        #    남은 자리를 넓은 칸끼리 나눈다. 설명 칸만 접히고 숫자 칸은 안 접힌다.
        total = sum(nat)
        if total <= avail:
            widths = [w * avail / total for w in nat]
        else:
            widths = list(nat)
            idx, remaining = list(range(cols)), avail
            while idx:
                fair = remaining / len(idx)
                small = [i for i in idx if widths[i] <= fair]
                if not small or len(small) == len(idx):
                    break
                remaining -= sum(widths[i] for i in small)
                idx = [i for i in idx if i not in small]
            if idx:
                fair = remaining / len(idx)
                for i in idx:
                    widths[i] = fair

        aligns = []
        for i in range(cols):
            vals = [clean(r[i]).replace("**", "").strip() for r in body]
            numeric = [v for v in vals if v]
            aligns.append("R" if numeric and all(
                re.fullmatch(r"[\d,.]+", v) for v in numeric) else "L")

        def row_lines(cells, bold):
            """굵은 칸은 더 넓게 잡히니 칸마다 실제 글꼴로 재야 높이가 맞는다."""
            n = 1
            for i, c in enumerate(cells):
                txt = clean(c)
                self.set_font("nk", "B" if bold or "**" in txt else "", size)
                txt = txt.replace("**", "")
                if not txt:
                    continue
                n = max(n, len(self.multi_cell(widths[i] - pad * 2, lead, txt,
                                               dry_run=True, output="LINES")))
            return n

        def draw_head():
            if not head:
                return
            h = row_lines(head, True) * lead + 2.4
            y = self.get_y()
            self.set_fill_color(*NAVY)
            self.rect(18, y, avail, h, style="F")
            self.set_text_color(255, 255, 255)
            self.set_font("nk", "B", size)
            x = 18.0
            for i, c in enumerate(head):
                self.set_xy(x + pad, y + 1.2)
                self.multi_cell(widths[i] - pad * 2, lead,
                                clean(c).replace("**", ""), align=aligns[i])
                x += widths[i]
            self.set_text_color(*INK)
            self.set_xy(self.l_margin, y + h)

        if self.will_page_break(18):
            self.add_page()
        draw_head()

        self.set_draw_color(*RULE)
        self.set_line_width(0.15)
        for k, r in enumerate(body):
            h = row_lines(r, False) * lead + 2.4
            if self.will_page_break(h):
                self.add_page()
                draw_head()
            y = self.get_y()
            if k % 2 == 1:
                self.set_fill_color(250, 249, 245)
                self.rect(18, y, avail, h, style="F")
            x = 18.0
            for i, c in enumerate(r):
                txt = clean(c)
                self.set_font("nk", "B" if "**" in txt else "", size)
                self.set_xy(x + pad, y + 1.2)
                self.multi_cell(widths[i] - pad * 2, lead, txt.replace("**", ""),
                                align=aligns[i])
                x += widths[i]
            self.set_draw_color(*RULE)
            self.line(18, y + h, 18 + avail, y + h)
            self.set_xy(self.l_margin, y + h)
        self.ln(2.5)


def parse(md: str):
    """md 를 블록 목록으로. 이 파일이 쓰는 문법만 다룬다."""
    blocks, lines, i = [], md.split("\n"), 0
    while i < len(lines):
        ln_ = lines[i]
        if not ln_.strip():
            i += 1
            continue
        if ln_.startswith("```"):
            buf = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i]); i += 1
            i += 1
            blocks.append(("code", buf))
        elif ln_.startswith("#### "):
            blocks.append(("h4", ln_[5:])); i += 1
        elif ln_.startswith("### "):
            blocks.append(("h3", ln_[4:])); i += 1
        elif ln_.startswith("## "):
            blocks.append(("h2", ln_[3:])); i += 1
        elif ln_.startswith("# "):
            blocks.append(("h1", ln_[2:])); i += 1
        elif ln_.startswith("---"):
            blocks.append(("rule", None)); i += 1
        elif ln_.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                filled = [c for c in cells if c]
                # 구분선(|---|---|)만 버린다. 「| | |」 처럼 빈 머리글은 남겨야
                # 첫 데이터 행이 머리글로 올라가지 않는다.
                is_sep = bool(filled) and all(
                    re.fullmatch(r":?-{2,}:?", c) for c in filled)
                if not is_sep:
                    rows.append(cells)
                i += 1
            if rows:
                blocks.append(("table", rows))
        elif ln_.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].startswith(">"):
                t = lines[i][1:].strip()
                if t:
                    buf.append(t)
                i += 1
            blocks.append(("quote", buf))
        elif ln_.startswith("- "):
            buf = []
            while i < len(lines) and lines[i].startswith("- "):
                buf.append(lines[i][2:]); i += 1
            blocks.append(("list", buf))
        elif re.match(r"^\d+\. ", ln_):
            buf = []
            while i < len(lines) and re.match(r"^\d+\. ", lines[i]):
                m = re.match(r"^(\d+)\. (.*)$", lines[i])
                buf.append((m.group(1) + ".", m.group(2))); i += 1
            blocks.append(("olist", buf))
        else:
            buf = []
            while i < len(lines) and lines[i].strip() and not re.match(
                    r"^(#{1,4} |---|\||>|- |\d+\. |```)", lines[i]):
                buf.append(lines[i].strip()); i += 1
            blocks.append(("para", " ".join(buf)))
    return blocks


def main() -> int:
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    md = src.read_text(encoding="utf-8")
    title = md.split("\n", 1)[0].lstrip("# ").strip()

    pdf = Deck(title)
    pdf.add_page()

    for kind, payload in parse(md):
        if kind == "h1":
            pdf.h1(payload)
        elif kind == "h2":
            pdf.h2(payload)
        elif kind == "h3":
            pdf.h3(payload)
        elif kind == "h4":
            pdf.h4(payload)
        elif kind == "rule":
            pdf.rule()
        elif kind == "table":
            pdf.table(payload)
        elif kind == "list":
            for b in payload:
                pdf.bullet(b)
            pdf.ln(1)
        elif kind == "olist":
            for marker, text in payload:
                pdf.numbered(marker, text)
            pdf.ln(1)
        elif kind == "code":
            pdf.code(payload)
        elif kind == "quote":
            pdf.box(payload, QUOTE_BG, NAVY)
        elif kind == "para":
            t = payload
            if t.startswith("**［고칠 것］**"):
                pdf.box([t], NOTE_BG, ALARM, size=9.0, lead=5.0)
            elif t.startswith("**［알아둘 것］**"):
                pdf.box([t], QUOTE_BG, MUTED, size=9.0, lead=5.0)
            else:
                pdf.para(t)

    pdf.output(str(out))
    print(f"{out} — {pdf.page_no()}쪽")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
