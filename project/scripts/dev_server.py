"""
로컬 개발용 매칭 서버 래퍼.
팀 레포(ai-hwaseong)는 수정하지 않고 CORS 헤더만 덧씌워 실행.

실행:
    python3 scripts/dev_server.py
    python3 scripts/dev_server.py --port 8001
"""

import argparse
import json
import sys
from pathlib import Path

MATCHING_DIR = Path(__file__).resolve().parent.parent.parent / "ai-hwaseong" / "matching"
sys.path.insert(0, str(MATCHING_DIR))

import matching  # noqa: E402 — sys.path 설정 후 import

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def _inject_cors(handler_self):
    for key, val in CORS_HEADERS.items():
        handler_self.send_header(key, val)


# ── _send_json 패치 ──────────────────────────────────────────────
_orig_send_json = matching.MatchingRequestHandler._send_json

def _send_json_cors(self, payload, status=200):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    self.send_response(status)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(body)))
    _inject_cors(self)
    self.end_headers()
    self.wfile.write(body)

matching.MatchingRequestHandler._send_json = _send_json_cors


# ── OPTIONS preflight 처리 ────────────────────────────────────────
def _do_options(self):
    self.send_response(204)
    _inject_cors(self)
    self.end_headers()

matching.MatchingRequestHandler.do_OPTIONS = _do_options


# ── 실행 ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mars-Fit 로컬 개발 서버")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    print(f"[dev_server] 매칭 API: http://localhost:{args.port}/api/match")
    print(f"[dev_server] 헬스체크: http://localhost:{args.port}/api/health")
    print(f"[dev_server] CORS: 허용 (로컬 개발 전용)")
    matching.serve(args.host, args.port)
