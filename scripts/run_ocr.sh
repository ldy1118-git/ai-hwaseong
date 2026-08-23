#!/usr/bin/env bash
# 사업자등록증 OCR 서버 + Cloudflare 터널을 같이 띄운다.
#
#     scripts/run_ocr.sh start    띄우고 바깥 주소를 알려준다
#     scripts/run_ocr.sh stop     둘 다 내린다
#     scripts/run_ocr.sh status   지금 주소와 살아있는지
#
# 처음 한 번 (자세한 건 backend/ocr_server.py 위쪽 주석)
#     python3 -m venv .venv
#     .venv/bin/pip install easyocr opencv-python-headless numpy
#     echo "OCR_SHARED_SECRET=$(python3 -c 'import secrets;print(secrets.token_urlsafe(32))')" >> .env
#     curl -fsSL -o ~/bin/cloudflared \
#         https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
#     chmod +x ~/bin/cloudflared
#
# 터널 주소는 켤 때마다 바뀐다(무료 빠른 터널이라 그렇다). 켠 다음 나오는
# 주소를 Vercel 환경변수 OCR_BACKEND_URL 에 넣어야 화면이 그 서버를 본다.
#
# 이미 https 도메인이 있는 서버라면 터널이 필요 없다. NO_TUNNEL=1 로 띄우고
# 리버스 프록시를 127.0.0.1:8900 으로 붙이면 주소가 안 바뀐다.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="${OCR_RUN_DIR:-$REPO/.ocr-run}"
PORT="${OCR_PORT:-8900}"
CLOUDFLARED="${CLOUDFLARED:-$(command -v cloudflared || echo "$HOME/bin/cloudflared")}"

# venv 가 있으면 그걸 쓰고, 없으면 시스템 파이썬으로 돈다.
PYTHON="$REPO/.venv/bin/python"
[ -x "$PYTHON" ] || PYTHON="$(command -v python3)"

mkdir -p "$RUN"
URL_FILE="$RUN/url.txt"
LOG_SERVER="$RUN/server.log"
LOG_TUNNEL="$RUN/tunnel.log"
PID_SERVER="$RUN/server.pid"
PID_TUNNEL="$RUN/tunnel.pid"

alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }
healthy() { curl -fsS --max-time 3 "http://127.0.0.1:$PORT/health" > /dev/null 2>&1; }

stop_all() {
    for pidfile in "$PID_TUNNEL" "$PID_SERVER"; do
        alive "$pidfile" && kill "$(cat "$pidfile")" 2>/dev/null || true
        : > "$pidfile" 2>/dev/null || true
    done
    : > "$URL_FILE" 2>/dev/null || true
}

case "${1:-start}" in
status)
    alive "$PID_SERVER" && echo "OCR 서버  살아있음 (pid $(cat "$PID_SERVER"))" || echo "OCR 서버  꺼짐"
    alive "$PID_TUNNEL" && echo "터널      살아있음 (pid $(cat "$PID_TUNNEL"))" || echo "터널      꺼짐"
    [ -s "$URL_FILE" ] && echo "주소      $(cat "$URL_FILE")" || echo "주소      없음"
    exit 0
    ;;
stop)
    stop_all; echo "내렸다."; exit 0 ;;
start) ;;
*)
    echo "쓰는 법: scripts/run_ocr.sh [start|stop|status]" >&2; exit 1 ;;
esac

if alive "$PID_SERVER" || alive "$PID_TUNNEL"; then
    echo "이미 떠 있다. 다시 띄우려면 먼저 'scripts/run_ocr.sh stop'." >&2
    exec "$0" status
fi

# .env 에서 비밀번호를 읽는다. export 해야 파이썬이 본다.
if [ -f "$REPO/.env" ]; then
    set -a; . "$REPO/.env"; set +a
fi
if [ -z "${OCR_SHARED_SECRET:-}" ]; then
    echo "OCR_SHARED_SECRET 이 $REPO/.env 에 없다. 위쪽 주석의 '처음 한 번'을 볼 것." >&2
    exit 1
fi

# ── OCR 서버 ────────────────────────────────────────────────
# 모델 올리는 시간이 서버 부하에 크게 흔들린다. 한가하면 15초, 다른 작업이
# 돌고 있으면 2분 가까이 걸린 적이 있다(load 76). 넉넉히 기다린다.
echo "OCR 서버를 띄우는 중... (모델 올리는 데 15초~3분. 서버가 바쁘면 더)"
OCR_PORT="$PORT" setsid nohup "$PYTHON" "$REPO/backend/ocr_server.py" \
    > "$LOG_SERVER" 2>&1 < /dev/null &
echo $! > "$PID_SERVER"

for _ in $(seq 1 90); do
    healthy && break
    if ! alive "$PID_SERVER"; then
        echo "OCR 서버가 죽었다. 로그:" >&2; tail -25 "$LOG_SERVER" >&2
        stop_all; exit 1
    fi
    sleep 4
done
if ! healthy; then
    echo "6분을 기다려도 안 뜬다. 로그:" >&2; tail -25 "$LOG_SERVER" >&2
    stop_all; exit 1
fi
echo "OCR 서버 준비됨 — http://127.0.0.1:$PORT"

if [ "${NO_TUNNEL:-}" = "1" ]; then
    echo "NO_TUNNEL=1 이라 터널은 안 연다. 리버스 프록시를 127.0.0.1:$PORT 로 붙일 것."
    exit 0
fi

# ── 터널 ────────────────────────────────────────────────────
if [ ! -x "$CLOUDFLARED" ]; then
    echo "cloudflared 가 없다($CLOUDFLARED). 위쪽 주석의 '처음 한 번'을 볼 것." >&2
    stop_all; exit 1
fi

echo "터널을 여는 중..."
: > "$LOG_TUNNEL"
setsid nohup "$CLOUDFLARED" tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" \
    > "$LOG_TUNNEL" 2>&1 < /dev/null &
echo $! > "$PID_TUNNEL"

url=""
for _ in $(seq 1 30); do
    url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_TUNNEL" | head -1 || true)
    [ -n "$url" ] && break
    if ! alive "$PID_TUNNEL"; then
        echo "터널이 죽었다. 로그:" >&2; tail -25 "$LOG_TUNNEL" >&2
        stop_all; exit 1
    fi
    sleep 2
done
if [ -z "$url" ]; then
    echo "터널 주소가 안 나온다. 로그:" >&2; tail -25 "$LOG_TUNNEL" >&2
    stop_all; exit 1
fi

echo "$url" > "$URL_FILE"

echo
echo "────────────────────────────────────────────────"
echo "  Vercel 환경변수 OCR_BACKEND_URL 에 이걸 넣는다"
echo
echo "     $url"
echo
echo "  Vercel → 프로젝트 → Settings → Environment Variables"
echo "  넣은 뒤 재배포해야 반영된다 (Deployments → ⋯ → Redeploy)"
echo "────────────────────────────────────────────────"
echo
echo "확인:   curl $url/health"
echo "내리기: scripts/run_ocr.sh stop"
