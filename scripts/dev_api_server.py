"""
로컬 개발용 API 서버 (포트 8000).

backend/matching.py 의 OCR 의존성을 모킹해서 매칭 기능만 띄운다.
Vercel 배포에서는 api/ 핸들러를 그대로 사용하므로 이 파일은 로컬 전용.

사용:  python3 scripts/dev_api_server.py
"""
from __future__ import annotations

import json
import sys
import types
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# OCR 모듈 모킹 — easyocr 없이 매칭만 돌린다
_ocr_stub = types.ModuleType("OCR")
_ocr_stub.extract_business_registration = lambda *a, **kw: {}  # type: ignore
sys.modules["OCR"] = _ocr_stub

sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "policy_data"))

import matching  # noqa: E402  (OCR 모킹 후 import)

_policies = matching.load_policies_from_folder(matching.default_notices_folder())
print(f"[dev-api] 공고 {len(_policies)}건 로드 완료", flush=True)


def _cors(h: BaseHTTPRequestHandler) -> None:
    h.send_header("Access-Control-Allow-Origin", "*")
    h.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    h.send_header("Access-Control-Allow-Headers", "Content-Type")


def _send(h: BaseHTTPRequestHandler, payload, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode()
    h.send_response(status)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(body)))
    _cors(h)
    h.end_headers()
    h.wfile.write(body)


def _read(h: BaseHTTPRequestHandler) -> dict:
    try:
        length = int(h.headers.get("Content-Length") or 0)
    except ValueError:
        return {}
    if length <= 0:
        return {}
    try:
        return json.loads(h.rfile.read(length).decode()) or {}
    except Exception:
        return {}


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        _cors(self)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/api/health":
            _send(self, {"ok": True, "notices": len(_policies)})
        else:
            _send(self, {"error": "not found"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        if self.path == "/api/match":
            payload = _read(self)
            profile = payload.get("user_profile") or {}
            try:
                results = matching.match_policies(_policies, profile)
                _send(self, {"count": len(results), "results": results})
            except Exception as e:
                _send(self, {"error": str(e)}, 500)
        else:
            _send(self, {"error": "not found"}, 404)

    def log_message(self, fmt, *args) -> None:  # noqa: N802
        print(f"[dev-api] {self.address_string()} {fmt % args}", flush=True)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("", port), Handler)
    print(f"[dev-api] http://localhost:{port} 에서 대기 중 (Ctrl+C 로 종료)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[dev-api] 종료")
