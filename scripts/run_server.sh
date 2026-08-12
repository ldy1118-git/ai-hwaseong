#!/usr/bin/env bash
# 리눅스 서버에서 매칭 웹 서버를 띄우는 스크립트
#
#   ./scripts/run_server.sh          8000 포트로 실행
#   ./scripts/run_server.sh 8123     포트 지정
#
# OMP_NUM_THREADS 를 반드시 제한한다. 연구실 서버는 코어가 80개라
# torch/OpenMP 스레드가 폭주해 easyocr 호출이 멈추는 현상이 있다.

set -euo pipefail

PORT="${1:-8000}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_PYTHON="$ROOT/.venv/bin/python"

if [[ ! -x "$VENV_PYTHON" ]]; then
  echo "가상환경이 없습니다: $VENV_PYTHON" >&2
  echo "먼저 아래를 실행하세요:" >&2
  echo "  python3 -m venv $ROOT/.venv" >&2
  echo "  $ROOT/.venv/bin/python -m pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision" >&2
  echo "  $ROOT/.venv/bin/python -m pip install easyocr" >&2
  exit 1
fi

echo "matching 웹 서버 시작 → http://127.0.0.1:$PORT/index.html"
echo "중지하려면 Ctrl+C"

cd "$ROOT/matching"
exec env OMP_NUM_THREADS=4 "$VENV_PYTHON" matching.py --serve --port "$PORT"
