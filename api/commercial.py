"""POST /api/commercial — 위치 기반 상권 데이터 필터링.

요청  { "lat": 37.2001, "lng": 127.0735,
        "radii": { "schools": 500, "restaurants": 500, "cafes": 500,
                   "academies": 500, "stations": 500 } }
응답  { "counts": { "schools": 5, ... },
        "markers": { "schools": [{lat, lng, name, level}], ... } }

상가·학교·역 데이터는 외부 서버(pjrx.kr)에만 있다.
Vercel 은 중계만 한다.

필요한 환경변수 (Vercel 대시보드):
    OCR_BACKEND_URL     https://pjrx.kr
    OCR_SHARED_SECRET   외부 서버와 같은 값
"""

from __future__ import annotations

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import json
import urllib.error
import urllib.request

from _shared import Base, read_json, send_json

BACKEND = (_os.environ.get("OCR_BACKEND_URL") or "").rstrip("/")
SECRET  = _os.environ.get("OCR_SHARED_SECRET") or ""

TIMEOUT = 15


class handler(Base):  # noqa: N801
    def do_POST(self) -> None:  # noqa: N802
        if not BACKEND or not SECRET:
            return send_json(self, {"error": "외부 서버가 연결되지 않았습니다"}, 503)

        payload = read_json(self)
        if payload.get("lat") is None or payload.get("lng") is None:
            return send_json(self, {"error": "lat·lng 가 필요합니다"}, 400)

        body = json.dumps(payload).encode("utf-8")
        req  = urllib.request.Request(
            f"{BACKEND}/commercial",
            data=body,
            headers={"Content-Type": "application/json", "X-Mars-Secret": SECRET},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
                return send_json(self, json.loads(res.read().decode("utf-8")))
        except urllib.error.HTTPError as e:
            try:
                relayed = json.loads(e.read().decode("utf-8"))
            except Exception:
                relayed = {"error": f"외부 서버가 {e.code} 로 답했습니다"}
            return send_json(self, relayed, e.code if e.code >= 400 else 502)
        except urllib.error.URLError as e:
            return send_json(self, {"error": "상권 서버에 닿지 못했습니다", "detail": str(getattr(e, "reason", e))}, 503)
        except TimeoutError:
            return send_json(self, {"error": "상권 서버 응답 시간 초과"}, 504)

    def do_GET(self) -> None:  # noqa: N802
        send_json(self, {"error": "POST 로 호출하세요", "backend_set": bool(BACKEND)}, 405)
