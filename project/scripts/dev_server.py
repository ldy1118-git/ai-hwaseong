"""
로컬 개발용 서버 래퍼.
- /api/match        : ai-hwaseong/matching 엔진 (CORS 래퍼)
- /api/health       : 헬스체크
- /api/llm          : LLM 호출 (모델명으로 자동 라우팅: gemini-* → Gemini, 나머지 → Groq)
- /api/terms/lookup : 공고문 용어 조회 (policy_data/terms.py)

실행:
    python3 scripts/dev_server.py
    python3 scripts/dev_server.py --port 8001
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

# ── 경로 설정 ──────────────────────────────────────────────────
MATCHING_DIR = Path(__file__).resolve().parent.parent.parent / "ai-hwaseong" / "matching"
POLICY_DIR   = Path(__file__).resolve().parent.parent.parent / "policy_data"
sys.path.insert(0, str(MATCHING_DIR))
sys.path.insert(0, str(POLICY_DIR))

import matching  # noqa: E402

# ── .env 에서 Gemini 키 로드 ───────────────────────────────────
def _load_env():
    env_file = Path(__file__).resolve().parent.parent / ".env"
    env = {}
    if not env_file.exists():
        return env
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)=(.*)$', line)
        if m:
            env[m.group(1)] = m.group(2).strip("\"'")
    return env

_ENV = _load_env()
GEMINI_KEY      = _ENV.get("VITE_GEMINI_API_KEY", "")
GROQ_KEY        = _ENV.get("VITE_GROQ_API_KEY", "")
DEFAULT_MODEL   = "groq/compound-mini"  # Groq 기본
GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GROQ_ENDPOINT   = "https://api.groq.com/openai/v1/chat/completions"

def _extract_json(text):
    """마크다운 코드블록이나 <think> 태그를 제거하고 첫 번째 JSON 객체/배열을 반환."""
    # <think>...</think> 제거
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
    # ```json ... ``` 추출
    m = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    if m:
        return m.group(1).strip()
    # { ... } 또는 [ ... ] 직접 추출
    m = re.search(r'(\{[\s\S]*\}|\[[\s\S]*\])', text)
    if m:
        return m.group(1).strip()
    return text

# ── CORS 헤더 ──────────────────────────────────────────────────
CORS_HEADERS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}

def _inject_cors(handler_self):
    for key, val in CORS_HEADERS.items():
        handler_self.send_header(key, val)

def _send_json(handler_self, payload, status=200):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler_self.send_response(status)
    handler_self.send_header("Content-Type", "application/json; charset=utf-8")
    handler_self.send_header("Content-Length", str(len(body)))
    _inject_cors(handler_self)
    handler_self.end_headers()
    handler_self.wfile.write(body)

def _read_json(handler_self):
    try:
        length = int(handler_self.headers.get("Content-Length") or 0)
    except ValueError:
        return {}
    if length <= 0:
        return {}
    try:
        return json.loads(handler_self.rfile.read(length).decode("utf-8")) or {}
    except (ValueError, UnicodeDecodeError):
        return {}

# ── Gemini 호출 ────────────────────────────────────────────────
def _call_gemini(key, model, system, prompt, want_json, history, schema=None):
    contents = []
    for turn in history or []:
        role = "model" if turn.get("role") in ("mars", "bot", "model", "assistant") else "user"
        text = turn.get("text") or turn.get("content") or ""
        if text:
            contents.append({"role": role, "parts": [{"text": str(text)}]})
    contents.append({"role": "user", "parts": [{"text": prompt}]})

    body = {
        "contents": contents,
        "generationConfig": {"temperature": 0},
    }
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    if want_json:
        body["generationConfig"]["responseMimeType"] = "application/json"
        if schema:
            body["generationConfig"]["responseSchema"] = schema

    request = urllib.request.Request(
        GEMINI_ENDPOINT.format(model=model),
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.loads(response.read().decode("utf-8"))

    candidates = result.get("candidates") or []
    if not candidates:
        raise RuntimeError(f"응답이 비었습니다: {result.get('promptFeedback')}")
    parts = candidates[0].get("content", {}).get("parts") or []
    return "".join(part.get("text", "") for part in parts)

# ── /api/match CORS 패치 ───────────────────────────────────────
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

# ── Gemini Vision (OCR) ────────────────────────────────────────
def _call_gemini_vision(key, model, image_b64, mime_type):
    body = {
        "contents": [{
            "role": "user",
            "parts": [
                {"inlineData": {"mimeType": mime_type, "data": image_b64}},
                {"text": (
                    "이 사업자등록증 이미지에서 다음 정보를 추출해서 JSON으로만 응답하세요.\n"
                    '{"상호명":"사업체이름","개업일":"YYYYMMDD","업종":"카페|음식점|소매업|기타","주소":"사업장주소","대표자":"대표자이름"}\n'
                    "- 업종은 반드시 카페/음식점/소매업/기타 중 하나로만 분류하세요\n"
                    "- 개업일이 보이면 YYYYMMDD 형식으로 변환하세요 (예: 2020년 3월 15일 → 20200315)\n"
                    "- 정보가 없거나 읽기 어려우면 빈 문자열로 두세요"
                )},
            ],
        }],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
    }
    request = urllib.request.Request(
        GEMINI_ENDPOINT.format(model=model),
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.loads(response.read().decode("utf-8"))
    candidates = result.get("candidates") or []
    if not candidates:
        raise RuntimeError(f"응답이 비었습니다: {result.get('promptFeedback')}")
    parts = candidates[0].get("content", {}).get("parts") or []
    return "".join(part.get("text", "") for part in parts)

# ── Groq 호출 ─────────────────────────────────────────────────
def _call_groq(key, model, system, prompt, want_json, history):
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    for turn in history or []:
        role = "assistant" if turn.get("role") in ("mars", "bot", "model", "assistant") else "user"
        text = turn.get("text") or turn.get("content") or ""
        if text:
            messages.append({"role": role, "content": str(text)})
    messages.append({"role": "user", "content": prompt})

    body = {
        "model": model,
        "messages": messages,
        "temperature": 0,
    }
    if want_json:
        body["response_format"] = {"type": "json_object"}
        # Groq requires the word "json" in the prompt when using json_object mode
        last_msg = messages[-1]
        if "json" not in last_msg["content"].lower():
            last_msg["content"] += "\n\nJSON 형식으로만 답해주세요."

    request = urllib.request.Request(
        GROQ_ENDPOINT,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
            "User-Agent": "Mozilla/5.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.loads(response.read().decode("utf-8"))

    choices = result.get("choices") or []
    if not choices:
        raise RuntimeError(f"응답이 비었습니다: {result}")
    return choices[0]["message"]["content"]

# ── /api/llm 라우트를 가로채는 do_POST 확장 ────────────────────
_orig_do_post = matching.MatchingRequestHandler.do_POST

def _do_post(self):
    from urllib.parse import urlparse
    path = urlparse(self.path).path

    if path == "/api/ocr":
        if not GEMINI_KEY:
            return _send_json(self, {"error": "Gemini 키가 없어요. 직접 입력해주세요."}, 503)
        payload = _read_json(self)
        image_b64 = payload.get("image", "")
        if "," in image_b64:                      # data URL → raw base64
            image_b64 = image_b64.split(",", 1)[1]
        if not image_b64:
            return _send_json(self, {"error": "image 필드가 필요합니다"}, 400)
        mime_type = payload.get("mimeType", "image/jpeg")
        try:
            raw = _call_gemini_vision(GEMINI_KEY, "gemini-3.6-flash", image_b64, mime_type)
            parsed = json.loads(_extract_json(raw))
            return _send_json(self, {"result": parsed})
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:300]
            return _send_json(self, {"error": f"OCR 실패 ({e.code})", "detail": detail}, 502)
        except Exception as e:
            return _send_json(self, {"error": f"OCR 오류: {e}"}, 502)

    if path == "/api/terms/lookup":
        import terms
        payload = _read_json(self)
        text  = payload.get("text") or ""
        names = payload.get("documents") or []
        try:
            found    = terms.find_terms(text)
            docs     = [d for d in (terms.find_document(str(n)) for n in names) if d]
            glossary = terms.glossary_for(text)
            return _send_json(self, {"terms": found, "documents": docs, "glossary": glossary})
        except Exception as e:
            return _send_json(self, {"error": f"용어 조회 실패: {e}"}, 500)

    if path != "/api/llm":
        return _orig_do_post(self)

    payload    = _read_json(self)
    prompt     = payload.get("prompt") or ""
    if not prompt.strip():
        return _send_json(self, {"error": "prompt 가 필요합니다"}, 400)

    model      = str(payload.get("model") or DEFAULT_MODEL)
    system     = str(payload.get("system") or "")
    want_json  = bool(payload.get("json"))
    history    = payload.get("history") or []
    use_gemini = model.startswith("gemini")

    try:
        if use_gemini:
            if not GEMINI_KEY:
                return _send_json(self, {"error": "VITE_GEMINI_API_KEY 가 project/.env 에 없습니다"}, 503)
            text = _call_gemini(
                key=GEMINI_KEY, model=model, system=system,
                prompt=prompt, want_json=want_json, history=history,
                schema=payload.get("schema"),
            )
        else:
            if not GROQ_KEY:
                return _send_json(self, {"error": "VITE_GROQ_API_KEY 가 project/.env 에 없습니다"}, 503)
            text = _call_groq(
                key=GROQ_KEY, model=model, system=system,
                prompt=prompt, want_json=want_json, history=history,
            )
        if want_json:
            text = _extract_json(text)
        _send_json(self, {"text": text, "model": model})
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        provider = "Gemini" if use_gemini else "Groq"
        _send_json(self, {"error": f"{provider} 호출 실패 ({e.code})", "detail": detail}, 502)
    except Exception as e:
        _send_json(self, {"error": f"LLM 오류: {e}"}, 502)

matching.MatchingRequestHandler.do_POST = _do_post

# ── OPTIONS preflight ──────────────────────────────────────────
def _do_options(self):
    self.send_response(204)
    _inject_cors(self)
    self.end_headers()

matching.MatchingRequestHandler.do_OPTIONS = _do_options

# ── 실행 ──────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mars-Fit 로컬 개발 서버")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    gemini_status = f"키 확인됨 ({GEMINI_KEY[:8]}...)" if GEMINI_KEY else "⚠ 키 없음"
    groq_status   = f"키 확인됨 ({GROQ_KEY[:8]}...)"   if GROQ_KEY   else "⚠ 키 없음"
    print(f"[dev_server] 매칭 API  : http://localhost:{args.port}/api/match")
    print(f"[dev_server] LLM API   : http://localhost:{args.port}/api/llm")
    print(f"[dev_server]   Groq    : {groq_status}  (기본)")
    print(f"[dev_server]   Gemini  : {gemini_status}")
    print(f"[dev_server] 헬스체크  : http://localhost:{args.port}/api/health")
    print(f"[dev_server] CORS      : 허용 (로컬 개발 전용)")
    matching.serve(args.host, args.port)
