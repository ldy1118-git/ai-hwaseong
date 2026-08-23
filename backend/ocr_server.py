"""사업자등록증을 읽어주는 전용 서버. 연구실 서버에서 돈다.

왜 여기 있냐면 — easyocr 는 torch 까지 합쳐 1.4GB 다. Vercel 함수 하나는
250MB 까지라 올라가지 않는다. 그래서 사진 읽는 일만 이 서버가 맡고,
Vercel(`api/ocr.py`)은 중계만 한다.

    브라우저 ──HTTPS──▶ Vercel /api/ocr ──HTTPS(터널)──▶ 여기

띄우는 법은 손으로 하지 말고 `~/bin/mars-ocr.sh` 를 쓴다. 이 파일만
띄우면 터널이 없어서 바깥에서 못 부른다.

**사진을 저장하지 않는다.** 메모리에서 읽고 필드만 돌려준다. 원본
텍스트(raw_text)도 안 준다 — 등록증 전문이라 이름·생년월일이 다 들어 있다.
"""

from __future__ import annotations

import base64
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import OCR  # noqa: E402  위의 sys.path 다음이어야 한다

# 터널이 이 포트로만 붙는다. 0.0.0.0 이 아니라 localhost 인 것이 중요하다 —
# 연구실 망 안의 다른 사람이 직접 두드리지 못한다.
HOST = "127.0.0.1"
PORT = int(os.environ.get("OCR_PORT", "8900"))

# 브라우저에서 1600px 로 줄여 보내면 보통 600KB 아래다. 그보다 크면
# 리사이즈가 안 걸린 것이거나 우리 요청이 아니다.
MAX_IMAGE_BYTES = 6 * 1024 * 1024

SECRET = os.environ.get("OCR_SHARED_SECRET", "")


def _send(handler: BaseHTTPRequestHandler, payload: dict, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _decode_image(value: str) -> bytes:
    """data URL 이든 순수 base64 든 바이트로 만든다."""
    if value.startswith("data:"):
        _, _, value = value.partition(",")
    # base64 는 4의 배수여야 하는데 중간에서 패딩이 잘려 오는 경우가 있다.
    value += "=" * (-len(value) % 4)
    return base64.b64decode(value, validate=False)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args) -> None:  # noqa: N802
        # 접근 로그에 경로만 남긴다. 본문에는 등록증이 들어 있어서 안 찍는다.
        sys.stderr.write(f"{self.address_string()} {fmt % args}\n")

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/") in ("/health", ""):
            return _send(self, {"ok": True, "warm": OCR.warm_up()})
        _send(self, {"error": "POST /ocr 로 호출하세요"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/ocr":
            return _send(self, {"error": "없는 경로"}, 404)

        # 터널 주소는 랜덤이지만 알아내면 아무나 부를 수 있다. 비밀번호로 막는다.
        if not SECRET:
            return _send(self, {"error": "서버에 OCR_SHARED_SECRET 이 없습니다"}, 500)
        if self.headers.get("X-Mars-Secret") != SECRET:
            return _send(self, {"error": "인증 실패"}, 401)

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return _send(self, {"error": "본문 길이를 읽을 수 없습니다"}, 400)
        if length <= 0:
            return _send(self, {"error": "본문이 비었습니다"}, 400)
        if length > MAX_IMAGE_BYTES * 2:  # base64 는 원본보다 1.33배 크다
            return _send(self, {"error": "사진이 너무 큽니다"}, 413)

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return _send(self, {"error": "JSON 이 아닙니다"}, 400)

        image = payload.get("image")
        if not isinstance(image, str) or not image:
            return _send(self, {"error": "image 가 없습니다"}, 400)

        try:
            data = _decode_image(image)
        except Exception:
            return _send(self, {"error": "이미지를 해석할 수 없습니다"}, 400)
        if len(data) > MAX_IMAGE_BYTES:
            return _send(self, {"error": "사진이 너무 큽니다"}, 413)

        try:
            result = OCR.extract_from_bytes(data)
        except RuntimeError as error:          # OCR 엔진 자체가 없을 때
            return _send(self, {"error": str(error)}, 503)
        except Exception as error:             # 사진이 깨졌거나 글자를 못 찾았을 때
            return _send(self, {"error": f"읽지 못했습니다: {error}"}, 422)
        finally:
            del data                           # 사진을 오래 들고 있지 않는다

        if not result.get("result"):
            return _send(self, {"error": "사업자등록증에서 글자를 찾지 못했습니다"}, 422)

        return _send(self, result)


def main() -> None:
    if not SECRET:
        print("OCR_SHARED_SECRET 이 없습니다. .env 를 읽었는지 확인하세요.", file=sys.stderr)
        raise SystemExit(1)

    # 모델을 먼저 올린다. 이걸 안 하면 첫 손님이 78초를 기다린다.
    print("easyocr 모델을 올리는 중...", file=sys.stderr, flush=True)
    if not OCR.warm_up():
        print("easyocr 가 설치돼 있지 않습니다.", file=sys.stderr)
        raise SystemExit(1)
    print(f"준비됨 — http://{HOST}:{PORT}", file=sys.stderr, flush=True)

    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
