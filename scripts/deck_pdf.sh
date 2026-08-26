#!/usr/bin/env bash
# 슬라이드 HTML → PDF.
#
#   ./scripts/deck_pdf.sh                       전체
#   ./scripts/deck_pdf.sh 4                     4장만
#
# **크롬으로 뽑는다.** 덱이 웹폰트(Nunito·Noto Sans KR)로 그려져서 다른
# 렌더러를 쓰면 글꼴이 바뀌어 깨진다. 1차 슬라이드.pdf 도 크롬으로 뽑은
# 것이다(PDF 안에 Producer: Skia/PDF, Creator: Chromium 이 남아 있다).
#
# 이 서버에는 크롬이 따로 안 깔려 있고, playwright 가 받아둔 것을 쓴다.
# apt 로 깔 필요 없다.
set -euo pipefail

CHROME="$HOME/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome"
SRC="$(cd "$(dirname "$0")/.." && pwd)/docs/발표/2차_슬라이드.html"
OUT="$(dirname "$SRC")/출력"
mkdir -p "$OUT"

[ -x "$CHROME" ] || { echo "크롬이 없다: $CHROME" >&2; exit 1; }

# virtual-time-budget 을 넉넉히 준다. 글꼴을 구글에서 받아오는데 그 전에
# 찍으면 기본 글꼴로 나온다.
"$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --run-all-compositor-stages-before-draw --virtual-time-budget=9000 \
  --print-to-pdf="$OUT/2차_슬라이드.pdf" --no-pdf-header-footer \
  "file://$SRC" >/dev/null 2>&1

if [ $# -ge 1 ]; then
    pdftocairo -pdf -f "$1" -l "$1" "$OUT/2차_슬라이드.pdf" "$OUT/2차_슬라이드_$1장.pdf"
    echo "$OUT/2차_슬라이드_$1장.pdf"
fi
pdfinfo "$OUT/2차_슬라이드.pdf" | grep -E 'Pages|Page size'
echo "$OUT/2차_슬라이드.pdf"
