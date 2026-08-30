"""POST /api/recommend — 업종 → 화성시 내 적합 위치 추천.

요청  { "categories": ["카페", "음식점"], "top_n": 3 }
응답  { "recommendations": [
          {"category": "카페", "locations": [{"lat": ..., "lng": ..., "count": ...}, ...]},
          ...
       ]}

외부 서버(pjrx.kr)가 상가 밀집도 그리드 클러스터링으로 위치를 선정한다.
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
        if not payload.get("categories"):
            return send_json(self, {"error": "categories 가 필요합니다"}, 400)

        body = json.dumps(payload).encode("utf-8")
        req  = urllib.request.Request(
            f"{BACKEND}/recommend",
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
            return send_json(self, {"error": f"외부 서버에 연결할 수 없습니다: {e.reason}"}, 503)
        except Exception as e:
            return send_json(self, {"error": str(e)}, 500)
