"""슬라이드 높이 어림. 렌더링을 못 보니 글자 폭으로 줄 수를 세서 잰다.
한글은 글자 폭이 대략 1em, 숫자·영문은 0.55em 으로 잡는다."""
import re, sys, math, pathlib

AVAIL_W, AVAIL_H = 1280 - 144, 720 - 144      # padding 72
_css = pathlib.Path("docs/발표/2차_슬라이드.html").read_text()
CREW_H4  = int(re.search(r'\.crew-col > h4 \{[^}]*?font-size: (\d+)px', _css, re.S).group(1))
CREW_ROW = int(re.search(r'\.crew-col \.row \{[^}]*?font-size: (\d+)px', _css, re.S).group(1))

def text_w(t, fs):
    w = 0
    for ch in t:
        if ch.isspace(): w += fs * .3
        elif '가' <= ch <= '힣': w += fs * 1.0
        else: w += fs * .55
    return w

def block_h(t, fs, lh, box_w, mb=0, mt=0):
    if not t.strip(): return mt + mb
    lines = max(1, math.ceil(text_w(t, fs) / box_w))
    return mt + lines * fs * lh + mb

def strip_tags(h):
    h = re.sub(r'<br\s*/?>', ' ⏎ ', h)
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', h)).strip()

def lines_of(h, fs, lh, box_w, mb=0):
    """<br> 은 줄바꿈으로 센다"""
    total = 0
    for seg in strip_tags(h).split('⏎'):
        total += block_h(seg, fs, lh, box_w)
    return total + mb

s = pathlib.Path("docs/발표/2차_슬라이드.html").read_text()
body = s[s.index('<div class="stage"'):s.index('<div id="chrome">')]
slides = re.split(r'<section class="slide', body)[1:]

for i, raw in enumerate(slides, 1):
    sl = raw.split('</section>')[0]
    pad = re.search(r'padding:(\d+)px (\d+)px', raw[:200])
    AVAIL_H = 720 - (int(pad.group(1)) * 2 if pad else 144)
    AVAIL_W = 1280 - (int(pad.group(2)) * 2 if pad else 144)
    col = re.search(r'<div class="col"[^>]*style="gap:(\d+)px"', sl)
    gap = int(col.group(1)) if col else 30
    h = 0; parts = []
    def add(name, v):
        global h
        if v <= 0: return
        h += v; parts.append(f"{name} {v:.0f}")

    for m in re.finditer(r'<p class="eyebrow"[^>]*>(.*?)</p>', sl, re.S): add("eyebrow", lines_of(m.group(1), 19, 1.3, AVAIL_W))
    for m in re.finditer(r'<p class="kicker"[^>]*>(.*?)</p>', sl, re.S):  add("kicker", lines_of(m.group(1), 27, 1.35, AVAIL_W))
    for m in re.finditer(r'<p class="quoted[^"]*"[^>]*>(.*?)</p>', sl, re.S): add("quoted", lines_of(m.group(1), 19, 1.6, AVAIL_W-27) + 24)
    add("rule", sl.count('class="rule"') * 1)
    # crew-cols: 세 칸 중 제일 높은 칸
    cc = re.findall(r'<div class="crew-col">(.*?)</div>\s*(?=<div class="crew-col">|</div>)', sl, re.S)
    if cc:
        colw = (AVAIL_W - 60) / 3
        tall = 0
        for c in cc:
            ch = 0
            for m in re.finditer(r'<h4>(.*?)</h4>', c, re.S): ch += lines_of(m.group(1), CREW_H4, 1.3, colw) + 20 + 2
            for m in re.finditer(r'<p class="row[^"]*">(.*?)</p>', c, re.S):
                r = m.group(1)
                why = re.search(r'<span class="why">(.*?)</span>', r, re.S)
                if why:
                    ch += lines_of(re.sub(r'<span class="why">.*?</span>', '', r, flags=re.S), CREW_ROW, 1.45, colw-14)
                    ch += lines_of(why.group(1), 15, 1.4, colw-14) + 4
                else:
                    ch += lines_of(r, CREW_ROW, 1.45, colw-14)
                ch += 10
            tall = max(tall, ch)
        add("crew-cols", tall)
    steps_h = 0
    for m in re.finditer(r'<div class="step-row">(.*?)</div>\s*(?=<div class="step-row">|</div>)', sl, re.S):
        r = m.group(1)
        w1 = re.search(r'<p class="what">(.*?)</p>', r, re.S)
        w2 = re.search(r'<p class="how">(.*?)</p>', r, re.S)
        colw = (AVAIL_W - 44 - 52) / 2
        steps_h += max(lines_of(w1.group(1),24,1.3,colw) if w1 else 0,
                       lines_of(w2.group(1),18,1.5,colw) if w2 else 0) + 24
    if steps_h: add("steps", steps_h)
    claims_h = 0
    for m in re.finditer(r'<div class="claim">(.*?)</div>\s*(?=<div class="claim">|</div>)', sl, re.S):
        b = re.search(r'<p class="body-t">(.*?)</p>', m.group(1), re.S)
        claims_h += (lines_of(b.group(1),19,1.5,AVAIL_W-200-210-60) if b else 30) + 26
    if claims_h: add("claims", claims_h)
    for m in re.finditer(r'<div class="ai-col[^"]*">(.*?)(?=<div class="ai-col|</div>\s*</div>)', sl, re.S):
        c = m.group(1); colw = (AVAIL_W-44)/2; ch = 0
        for x in re.finditer(r'<h4>(.*?)</h4>', c, re.S): ch += lines_of(x.group(1),15,1.3,colw)+14
        for x in re.finditer(r'<p class="v"[^>]*>(.*?)</p>', c, re.S): ch += lines_of(x.group(1),16,1.5,colw*.62)+10
        add("ai-col", ch)
    # 받아온 파일 표
    for m in re.finditer(r'<table class="csvtbl[^"]*">(.*?)</table>', sl, re.S):
        tb = m.group(1); h2 = 0
        head = re.search(r'<tr><th>(.*?)</tr>', tb, re.S)
        if head: h2 += 14*1.3 + 7 + 9 + 2
        for r in re.findall(r'<tr><td>(.*?)</tr>', tb, re.S):
            tds = re.findall(r'(?:^|<td>)(.*?)(?=</td>)', r, re.S)
            w3 = 'w3' in m.group(0) if False else ('class="csvtbl w3"' in sl)
            ws = ([AVAIL_W*.15-14, AVAIL_W*.22-14, AVAIL_W*.63-14] if w3
                  else [AVAIL_W*.32-14, AVAIL_W*.68-14, AVAIL_W*.48-14])
            hh = 0
            tdfs, ifs, pad = (21, 17, 18) if w3 else (17, 15, 10)
            for ci, td in enumerate(tds[:3]):
                it = re.search(r'<i>(.*?)</i>', td, re.S)
                base = re.sub(r'<i>.*?</i>', '', td, flags=re.S)
                c = lines_of(base, tdfs, 1.4, ws[ci])
                if it: c += lines_of(it.group(1), ifs, 1.4, ws[ci]) + 4
                hh = max(hh, c)
            h2 += hh + pad + 1
        add("표", h2)
    # 두 갈래
    for m in re.finditer(r'<div class="flowcols">(.*?)\n              </div>', sl, re.S):
        cols = re.split(r'<div class="flowcol[^"]*">', m.group(1))[1:]
        colw = (AVAIL_W - 34)/2 - 18
        tall = 0
        for c in cols:
            ch = 0
            for x in re.finditer(r'<h4>(.*?)</h4>', c, re.S): ch += lines_of(x.group(1), 20, 1.3, colw) + 11
            for x in re.finditer(r'<p class="fl">(.*?)</p>', c, re.S):
                t = x.group(1)
                sub = re.search(r'<span class="sub">(.*?)</span>', t, re.S)
                if sub:
                    ch += lines_of(re.sub(r'<span class="sub">.*?</span>','',t,flags=re.S), 17, 1.45, colw)
                    ch += lines_of(sub.group(1), 15, 1.45, colw-14) + 3
                else:
                    ch += lines_of(t, 17, 1.45, colw)
                ch += 9
            for x in re.finditer(r'<p class="note">(.*?)</p>', c, re.S):
                ch += lines_of(x.group(1), 15, 1.4, colw) + 11 + 9
            tall = max(tall, ch)
        add("두갈래", tall)
    for m in re.finditer(r'<div class="aside-note">(.*?)</div>', sl, re.S):
        sp = re.search(r'<span>(.*?)</span>', m.group(1), re.S)
        add("aside", (lines_of(sp.group(1),17,1.5,AVAIL_W-70) if sp else 40) + 16 + 3)
    for m in re.finditer(r'<div class="verdict">(.*?)</div>', sl, re.S):
        v = m.group(1)
        for x in re.finditer(r'<p class="fact">(.*?)</p>', v, re.S): add("fact", lines_of(x.group(1),24,1.5,AVAIL_W))
        for x in re.finditer(r'<p class="then">(.*?)</p>', v, re.S): add("then", lines_of(x.group(1),34,1.3,AVAIL_W)+12)
    for m in re.finditer(r'<div class="ba">', sl):
        add("나란히", 452 + 16*1.4 + 7)
    if 'archslide' in raw[:120]:
        add("그림(꽉 채움)", AVAIL_H)
    for m in re.finditer(r'<div class="archgrid">(.*?)\n              </div>', sl, re.S):
        cols = re.split(r'<div class="ab[^"]*">', m.group(1))[1:]
        colw = (AVAIL_W - 30)/3 - 28
        hs = []
        for c in cols:
            ch = 0
            for x in re.finditer(r'<p class="t">(.*?)</p>', c, re.S): ch += lines_of(x.group(1), 18, 1.3, colw-30) + 7
            for x in re.finditer(r'<p class="f">(.*?)</p>', c, re.S):
                t = x.group(1)
                n = re.search(r'<span class="n">(.*?)</span>', t, re.S)
                if n:
                    ch += lines_of(re.sub(r'<span class="n">.*?</span>','',t,flags=re.S), 15, 1.5, colw)
                    ch += lines_of(n.group(1), 14, 1.5, colw) + 12
                else:
                    ch += lines_of(t, 15, 1.5, colw)
            hs.append(ch + 24 + 2)
        rows = [max(hs[0:3] or [0]), max(hs[3:6] or [0])]
        add("구조도", sum(rows) + 13)
    for m in re.finditer(r'<div class="kkcols">(.*?)\n              </div>', sl, re.S):
        blk = m.group(1)
        bh = 15*1.4 + 9 + (527 * 520/960) + 2   # 머리글 + 캡처(480px 로 줄임)
        wh = 0
        for x in re.finditer(r'<p class="w">(.*?)</p>', blk, re.S):
            wh += lines_of(x.group(1), 21, 1.5, AVAIL_W-520-34-16) + 16
        add("카톡", max(bh, wh))
    for m in re.finditer(r'<p class="formula">(.*?)</p>', sl, re.S):
        add("식", lines_of(m.group(1), 20, 1.4, AVAIL_W-32) + 22)
    for m in re.finditer(r'<p class="closing"[^>]*>(.*?)</p>', sl, re.S):
        fs = 23 if 'font-size:23px' in m.group(0) else (24 if 'font-size:24px' in m.group(0) else 26)
        t = m.group(1)
        src = re.search(r'<span class="srcline">(.*?)</span>', t, re.S)
        h2 = 0
        if src:
            t = re.sub(r'<span class="srcline">.*?</span>', '', t, flags=re.S)
            h2 = lines_of(src.group(1), 17, 1.5, AVAIL_W) + 9
        add("closing", lines_of(t, fs, 1.45, AVAIL_W) + h2)
    for m in re.finditer(r'<div class="strip">(.*?)</div>\s*</div>', sl, re.S):
        add("strip", 36 + 7 + 17*1.4*2)
    for m in re.finditer(r'<div class="pairs">(.*?)</div>\s*<hr', sl, re.S):
        blk = m.group(1); tot = 0
        rows = re.split(r'<div class="pair">', blk)[1:]
        for r in rows:
            fs = int(re.search(r'font-size:(\d+)px', r).group(1)) if 'font-size:' in r else 66
            labs = re.findall(r'<p class="label">(.*?)</p>', r, re.S)
            colw = (AVAIL_W - 190 - 72) / 2
            lab_h = max((lines_of(l, 17, 1.4, colw) for l in labs), default=0)
            tot += fs*.88 + 8 + lab_h
        add("pairs", tot + (len(rows)-1)*22)
    n_children = len(parts)
    h += max(0, n_children - 1) * gap
    fit = min(1, AVAIL_H / h) if h else 1
    mark = "✅" if fit > .99 else ("⚠️ " if fit > .9 else "❌")
    print(f"  {mark} {i}장  높이 {h:6.0f}px / {AVAIL_H}  →  {fit*100:5.1f}% 로 축소   [{' · '.join(parts)}]")
