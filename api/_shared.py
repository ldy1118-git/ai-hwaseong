"""Vercel 파이썬 함수들이 같이 쓰는 것들.

파일 이름이 _ 로 시작하면 Vercel 이 라우트로 잡지 않는다.

이 폴더의 함수들은 backend/matching.py 를 **HTTP 핸들러째로 쓰지 않고**
순수 함수만 골라 부른다. matching.py 의 핸들러는 backend/users/ 에
매칭 이력과 프로필을 파일로 쓰는데, 서버리스는 파일시스템이 읽기 전용이라
그 경로를 타면 500 이 난다.

즉 여기서는 매칭 이력이 남지 않는다. 로컬 서버(scripts/run_server.sh)는
그대로 남겨두므로 개발 중에는 이력이 필요하면 그쪽을 쓰면 된다.
"""

from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# vercel.json 의 includeFiles 로 같이 올라온다.
for folder in ("backend", "policy_data"):
    path = str(ROOT / folder)
    if path not in sys.path:
        sys.path.insert(0, path)


def cors(handler: BaseHTTPRequestHandler) -> None:
    """어디서 부르든 열어둔다.

    같은 도메인에서 서빙되면 사실 필요 없지만, 로컬 Vite(5173)에서
    배포된 API 를 부르며 개발하는 경우가 있어서 남긴다.
    """
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
    handler.send_header("Access-Control-Max-Age", "86400")


def send_json(handler: BaseHTTPRequestHandler, payload, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    cors(handler)
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler: BaseHTTPRequestHandler) -> dict:
    """요청 본문을 읽는다. 비어 있거나 깨졌으면 빈 dict."""
    try:
        length = int(handler.headers.get("Content-Length") or 0)
    except ValueError:
        return {}
    if length <= 0:
        return {}
    try:
        return json.loads(handler.rfile.read(length).decode("utf-8")) or {}
    except (ValueError, UnicodeDecodeError):
        return {}


class Base(BaseHTTPRequestHandler):
    """프리플라이트 응답과 로그 억제만 담당한다."""

    def do_OPTIONS(self) -> None:          # noqa: N802  BaseHTTPRequestHandler 규약
        self.send_response(204)
        cors(self)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *args) -> None:  # Vercel 로그에 접근 로그까지 쌓지 않는다
        pass
