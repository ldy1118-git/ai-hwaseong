"""POST /api/llm — LLM 을 서버에서 대신 부른다.

**이게 있는 이유는 API 키 때문이다.**
프론트에서 VITE_ 로 시작하는 환경변수는 빌드 결과물에 그대로 박힌다.
배포하면 개발자도구를 여는 누구나 키를 꺼낼 수 있다. 여기로 우회하면
키가 서버에만 남는다.

Vercel 대시보드 → Settings → Environment Variables 에 GEMINI_API_KEY 를
넣어둘 것. 절대 저장소에 커밋하지 않는다.

요청  { "prompt": "...", "system": "...", "json": true, "model": "...", "history": [...] }
응답  { "text": "..." }
"""

from __future__ import annotations

# Vercel 런타임은 sys.path 에 /var/task 만 넣는다. 이 파일이 있는 api/ 는
# 들어가지 않아서 옆 파일(_shared 등)을 import 할 수 없다. 직접 넣어준다.
# 이것 없이 배포하면 전부 FUNCTION_INVOCATION_FAILED 로 죽는다.
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import json
import os
import urllib.error
import urllib.request

from _shared import Base, read_json, send_json

# 별칭(gemini-flash-latest)은 시점에 따라 가리키는 모델이 바뀌어서
# 벤치마크 결과 추적이 안 된다. 버전을 고정한다. (project/CLAUDE.md 규칙)
DEFAULT_MODEL = "gemini-3.6-flash"
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
TIMEOUT = 55  # Vercel 무료 플랜 함수 실행 한도가 60초다


def call_gemini(key: str, model: str, system: str, prompt: str,
                want_json: bool, history: list) -> str:
    contents = []
    for turn in history or []:
        role = "model" if turn.get("role") in ("mars", "model", "assistant") else "user"
        text = turn.get("text") or turn.get("content") or ""
        if text:
            contents.append({"role": role, "parts": [{"text": str(text)}]})
    contents.append({"role": "user", "parts": [{"text": prompt}]})

    body = {
        "contents": contents,
        # 같은 입력에 같은 출력이 나와야 벤치마크가 의미가 있다.
        "generationConfig": {"temperature": 0},
    }
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    if want_json:
        body["generationConfig"]["responseMimeType"] = "application/json"

    request = urllib.request.Request(
        ENDPOINT.format(model=model),
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        result = json.loads(response.read().decode("utf-8"))

    candidates = result.get("candidates") or []
    if not candidates:
        # 안전필터에 걸리면 candidates 가 비어서 온다. 원인을 남겨야 디버깅이 된다.
        raise RuntimeError(f"응답이 비었습니다: {result.get('promptFeedback')}")
    parts = candidates[0].get("content", {}).get("parts") or []
    return "".join(part.get("text", "") for part in parts)


class handler(Base):  # noqa: N801
    def do_POST(self) -> None:  # noqa: N802
        key = os.environ.get("GEMINI_API_KEY", "").strip()
        if not key:
            return send_json(self, {
                "error": "GEMINI_API_KEY 가 설정되지 않았습니다",
                "fix": "Vercel → Settings → Environment Variables 에 추가하고 재배포하세요",
            }, 503)

        payload = read_json(self)
        prompt = payload.get("prompt") or ""
        if not isinstance(prompt, str) or not prompt.strip():
            return send_json(self, {"error": "prompt 가 필요합니다"}, 400)

        try:
            text = call_gemini(
                key=key,
                model=str(payload.get("model") or DEFAULT_MODEL),
                system=str(payload.get("system") or ""),
                prompt=prompt,
                want_json=bool(payload.get("json")),
                history=payload.get("history") or [],
            )
        except urllib.error.HTTPError as error:
            # 본문에 키가 실려 돌아오는 일은 없지만, 그대로 흘리지 않는다.
            detail = error.read().decode("utf-8", "replace")[:400]
            return send_json(self, {"error": f"LLM 호출 실패 ({error.code})",
                                    "detail": detail}, 502)
        except Exception as error:
            return send_json(self, {"error": f"LLM 호출 실패: {error}"}, 502)

        send_json(self, {"text": text})

    def do_GET(self) -> None:  # noqa: N802
        # 키가 제대로 꽂혔는지만 알려준다. 키 값 자체는 절대 내보내지 않는다.
        send_json(self, {
            "error": "POST 로 호출하세요",
            "key_configured": bool(os.environ.get("GEMINI_API_KEY", "").strip()),
            "model": DEFAULT_MODEL,
        }, 405)
