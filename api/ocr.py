"""POST /api/ocr — 사업자등록증 사진을 읽어 온보딩 칸을 채울 값을 돌려준다.

요청  { "image": "data:image/jpeg;base64,...", "mimeType": "image/jpeg" }
응답  { "result": { "상호명": ..., "업종": ..., "개업일": "20250801", ... },
        "profile": { "category": ..., "vat_type": ..., ... } }

**이 파일은 글자를 읽지 않는다.** 넘겨주기만 한다.

easyocr 는 torch 까지 1.4GB 인데 Vercel 함수는 250MB 까지다. 그래서 진짜
OCR 은 연구실 서버(`backend/ocr_server.py`)가 한다. 브라우저가 그 서버를
직접 못 부르는 이유는 두 가지 —
  · 사이트는 https 인데 서버는 http 라 브라우저가 막는다(mixed content)
  · 서버 주소를 프론트에 박으면 아무나 두드린다
서버끼리는 그 제한이 없으니 여기서 대신 부른다.

필요한 환경변수 (Vercel 대시보드에만 넣는다. 코드에 적지 않는다)
    OCR_BACKEND_URL      https://....trycloudflare.com   ← 터널 켤 때마다 바뀜
    OCR_SHARED_SECRET    연구실 서버 .env 의 것과 같은 값
"""

from __future__ import annotations

# Vercel 런타임은 sys.path 에 /var/task 만 넣는다. 옆 파일(_shared)을 부르려면
# 이 폴더를 직접 넣어야 한다. 없으면 FUNCTION_INVOCATION_FAILED 로 죽는다.
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import json
import urllib.error
import urllib.request

from _shared import Base, read_json, send_json

BACKEND = (_os.environ.get("OCR_BACKEND_URL") or "").rstrip("/")
SECRET = _os.environ.get("OCR_SHARED_SECRET") or ""

# 모델이 올라와 있으면 4초 안에 끝난다. 40초를 넘기면 서버가 자고 있는 것이다.
# vercel.json 의 maxDuration 이 60이라 그보다 낮게 둔다.
TIMEOUT = 40


class handler(Base):  # noqa: N801  Vercel 이 이 이름을 찾는다
    def do_POST(self) -> None:  # noqa: N802
        if not BACKEND or not SECRET:
            return send_json(self, {
                "error": "OCR 서버가 아직 연결되지 않았어요. 직접 입력해주세요.",
            }, 503)

        payload = read_json(self)
        image = payload.get("image")
        if not isinstance(image, str) or not image:
            return send_json(self, {"error": "사진이 오지 않았어요"}, 400)

        body = json.dumps({
            "image": image,
            "mimeType": payload.get("mimeType") or "image/jpeg",
        }).encode("utf-8")

        request = urllib.request.Request(
            f"{BACKEND}/ocr",
            data=body,
            headers={"Content-Type": "application/json", "X-Mars-Secret": SECRET},
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                return send_json(self, json.loads(response.read().decode("utf-8")))
        except urllib.error.HTTPError as error:
            # 저쪽이 이유를 적어 보냈으면 그대로 전한다. 400·422 는 사진 문제라
            # 사용자가 다시 찍으면 되고, 500 대는 서버 문제라 손이 필요하다.
            try:
                relayed = json.loads(error.read().decode("utf-8"))
            except Exception:
                relayed = {"error": f"OCR 서버가 {error.code} 로 답했어요"}
            if error.code == 401:  # 비밀번호가 어긋난 것 — 사용자 잘못이 아니다
                relayed = {"error": "OCR 서버 설정이 어긋났어요. 직접 입력해주세요."}
            return send_json(self, relayed, error.code if error.code >= 400 else 502)
        except urllib.error.URLError as error:
            # 터널이 꺼졌거나 주소가 바뀐 것. 시연 중이면 여기부터 본다.
            return send_json(self, {
                "error": "OCR 서버에 닿지 못했어요. 직접 입력해주세요.",
                "detail": str(getattr(error, "reason", error)),
            }, 503)
        except TimeoutError:
            return send_json(self, {
                "error": "읽는 데 너무 오래 걸렸어요. 다시 시도하거나 직접 입력해주세요.",
            }, 504)

    def do_GET(self) -> None:  # noqa: N802
        # 브라우저로 열어봤을 때 어디까지 됐는지 알려준다. 비밀번호는 안 보여준다.
        send_json(self, {
            "error": "POST 로 호출하세요",
            "backend_set": bool(BACKEND),
            "secret_set": bool(SECRET),
        }, 405)
