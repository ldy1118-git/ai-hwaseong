"""
로컬 개발용 API 서버 (포트 8000).

backend/matching.py 의 OCR 의존성을 모킹해서 매칭 기능만 띄운다.
.env 의 VITE_GROQ_API_KEY / VITE_GEMINI_API_KEY 를 읽어서 LLM 도 처리한다.
Vercel 배포에서는 api/ 핸들러를 그대로 사용하므로 이 파일은 로컬 전용.

사용:  python3 scripts/dev_api_server.py
"""
from __future__ import annotations

import json
import os
import sys
import types
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ── .env 로드 (VITE_ 접두사 → 서버 환경변수 이름으로 매핑) ─────────────
_env_file = ROOT / "project" / ".env"
if _env_file.exists():
    for line in _env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip()
        # VITE_ 접두사 제거 후 환경변수에 등록 (이미 있으면 덮지 않는다)
        server_key = key.removeprefix("VITE_")
        if server_key not in os.environ:
            os.environ[server_key] = val

# ── OCR 모듈 모킹 (easyocr 없이 매칭만 돌린다) ──────────────────────────
_ocr_stub = types.ModuleType("OCR")
_ocr_stub.extract_business_registration = lambda *a, **kw: {}  # type: ignore
sys.modules["OCR"] = _ocr_stub

sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "policy_data"))
sys.path.insert(0, str(ROOT / "api"))

import matching  # noqa: E402
import llm as llm_handler  # noqa: E402  (api/llm.py)
import terms as terms_handler  # noqa: E402  (policy_data/terms.py)

_policies = matching.load_policies_from_folder(matching.default_notices_folder())
print(f"[dev-api] 공고 {len(_policies)}건 로드 완료", flush=True)

_llm_ready = llm_handler.available()
print(f"[dev-api] LLM 제공자: {_llm_ready or ['없음 — GROQ_API_KEY 또는 GEMINI_API_KEY 필요']}", flush=True)


# ── 공용 HTTP 유틸 ────────────────────────────────────────────────────────
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


# ── /api/llm 처리 (api/llm.py 로직 재사용) ──────────────────────────────
def _handle_llm(h: BaseHTTPRequestHandler, payload: dict) -> None:
    ready = llm_handler.available()
    if not ready:
        return _send(h, {"error": "LLM API 키 없음 — .env 에 VITE_GROQ_API_KEY 또는 VITE_GEMINI_API_KEY 를 넣으세요"}, 503)

    prompt = payload.get("prompt") or ""
    if not prompt.strip():
        return _send(h, {"error": "prompt 가 필요합니다"}, 400)

    wanted = str(payload.get("provider") or "").strip().lower()
    wanted = llm_handler.ALIASES.get(wanted, wanted)
    if wanted:
        ready = [wanted] if wanted in ready else []
        if not ready:
            return _send(h, {"error": f"제공자 '{wanted}' 키가 없습니다"}, 503)

    system    = str(payload.get("system") or "")
    want_json = bool(payload.get("json"))
    history   = payload.get("history") or []
    override  = str(payload.get("model") or "") if len(ready) == 1 else ""

    failures = []
    for name in ready:
        spec  = llm_handler.PROVIDERS[name]
        key   = os.environ.get(spec["env"], "").strip()
        model = override or spec["model"]
        try:
            if name == "gemini":
                text = llm_handler.call_gemini(
                    key=key, model=model, system=system, prompt=prompt,
                    want_json=want_json, history=history,
                    schema=payload.get("schema"),
                )
            else:
                text = llm_handler.call_openai_compatible(
                    url=spec["url"], key=key, model=model, system=system,
                    prompt=prompt, want_json=want_json, history=history,
                )
            return _send(h, {"text": text, "provider": name, "model": model})
        except Exception as e:
            failures.append(f"{spec['label']}: {e}")

    _send(h, {"error": "LLM 호출 실패", "tried": failures}, 502)


# ── HTTP 핸들러 ───────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        _cors(self)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/api/health":
            _send(self, {"ok": True, "notices": len(_policies), "llm": _llm_ready})
        else:
            _send(self, {"error": "not found"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        payload = _read(self)
        if self.path == "/api/match":
            profile = payload.get("user_profile") or {}
            try:
                results = matching.match_policies(_policies, profile)
                _send(self, {"count": len(results), "results": results})
            except Exception as e:
                _send(self, {"error": str(e)}, 500)
        elif self.path == "/api/llm":
            _handle_llm(self, payload)
        elif self.path == "/api/terms/lookup":
            text  = payload.get("text") or ""
            names = payload.get("documents") or []
            if not isinstance(names, list):
                names = []
            try:
                found    = terms_handler.find_terms(text)
                docs     = [d for d in (terms_handler.find_document(str(n)) for n in names) if d]
                glossary = terms_handler.glossary_for(text)
                _send(self, {"terms": found, "documents": docs, "glossary": glossary})
            except Exception as e:
                _send(self, {"error": f"용어 조회 실패: {e}"}, 500)
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
