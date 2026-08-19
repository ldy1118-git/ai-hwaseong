"""POST /api/llm — LLM 을 서버에서 대신 부른다.

**이게 있는 이유는 API 키 때문이다.**
프론트에서 VITE_ 로 시작하는 환경변수는 빌드 결과물에 그대로 박힌다.
배포하면 개발자도구를 여는 누구나 키를 꺼낼 수 있다. 여기로 우회하면
키가 서버에만 남는다.

제공자는 **키가 꽂혀 있는 걸 알아서 고른다.** 셋 중 아무거나 하나만
Vercel 환경변수에 넣으면 챗봇이 돈다. 절대 저장소에 커밋하지 않는다.

    GROQ_API_KEY     Groq   — LLaMA 3.3 70B 를 LPU 로 굴린다. 무료 한도가 제일 넉넉
    XAI_API_KEY      Grok   — xAI 자체 모델
    GEMINI_API_KEY   Gemini — 구글

Groq 과 Grok 은 다른 회사다. 이름만 비슷하다. 둘 다 OpenAI 호환
엔드포인트라 코드는 한 벌로 끝나고, 주소와 모델명만 다르다.

여러 키가 꽂혀 있으면 위 순서대로 고른다. **첫 번째가 실패하면 다음
것으로 넘어간다.** 발표 도중에 한쪽이 쿼터를 다 쓰거나 죽어도 챗봇이
멈추지 않게 하려는 것이다. 시연 중에 이게 멈추면 복구할 시간이 없다.

요청  { "prompt": "...", "system": "...", "json": true, "model": "...",
        "provider": "groq"|"xai"|"gemini",  ← 생략하면 알아서 고른다
        "history": [...] }
응답  { "text": "...", "provider": "groq" }
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
GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
TIMEOUT = 55  # Vercel 무료 플랜 함수 실행 한도가 60초다

# urllib 은 User-Agent 를 안 붙이면 "Python-urllib/3.x" 로 보낸다. Groq 앞단의
# Cloudflare 가 그걸 보고 봇으로 판정해서 403 error code 1010 을 돌려준다.
# 키가 맞아도 못 뚫는다 — 응답이 Groq 이 아니라 Cloudflare 에서 나오기 때문에
# 에러 본문에 힌트도 없다. 가짜 키로 재보니 UA 없으면 403/1010, 붙이면
# 401 invalid_api_key 로 바뀐다. 통과 지점이 다르다.
USER_AGENT = "mars-fit/1.0 (+https://ai-hwaseong-ten.vercel.app)"

# 제공자별 설정. 고르는 순서이기도 하다 — 앞에 있는 키가 꽂혀 있으면 그걸 쓴다.
#
# Groq 을 앞에 둔 이유는 무료 한도다. 성현이 벤치마크에서 Gemini 무료는
# 하루 20건에 걸려 테스트가 중단됐다(llm/report/pt.md 7번). 시연 당일에
# 심사위원이 여러 번 눌러보는 상황을 생각하면 한도가 넉넉한 쪽이 앞이다.
#
# 모델명은 환경변수로 덮을 수 있다. Grok 은 모델명이 자주 바뀌어서
# 코드를 고치지 않고 XAI_MODEL 로 바꿀 수 있게 열어둔다.
PROVIDERS = {
    "groq": {
        "env": "GROQ_API_KEY",
        "url": "https://api.groq.com/openai/v1/chat/completions",
        # llama-3.3-70b-versatile 은 2026-06-17 폐기 공지가 나갔고 8월부터
        # 응답이 끊겼다. 성현이 벤치마크(llm/report/)가 8월 초라 그 경계에
        # 딱 걸렸다 — 보고서의 수치는 지금 이 모델의 것이 아니다.
        # Groq 이 지정한 대체가 openai/gpt-oss-120b 다.
        "model": os.environ.get("GROQ_MODEL", "").strip() or "openai/gpt-oss-120b",
        "label": "Groq",
    },
    "xai": {
        "env": "XAI_API_KEY",
        "url": "https://api.x.ai/v1/chat/completions",
        "model": os.environ.get("XAI_MODEL", "").strip() or "grok-3",
        "label": "Grok (xAI)",
    },
    "gemini": {
        "env": "GEMINI_API_KEY",
        "url": None,  # 얘만 OpenAI 호환이 아니라 따로 부른다
        "model": os.environ.get("GEMINI_MODEL", "").strip() or "gemini-3.6-flash",
        "label": "Gemini",
    },
}

# 하위호환. 예전 코드가 이 이름을 읽는다.
DEFAULT_MODEL = PROVIDERS["gemini"]["model"]


# 사람들이 부르는 이름을 받아준다. xAI 의 모델 이름이 Grok 이라 그렇게
# 쓰는 게 자연스럽고, Groq 과 헷갈려서 잘못 쓰는 일도 잦다. 막지 않는다.
ALIASES = {
    "grok": "xai",
    "x.ai": "xai",
    "google": "gemini",
    "llama": "groq",
}


# 한 제공자에 키를 몇 개까지 꽂을 수 있게 할지. 이 이상은 환경변수
# 관리가 더 헷갈려서 얻는 것보다 잃는 게 크다.
MAX_KEYS = 5


def clean_key(raw: str) -> str:
    """옮겨 담다 붙은 것을 벗겨낸다.

    앞뒤 공백은 물론이고 감싼 따옴표도 벗긴다. 대시보드에 값을 넣을 때
    "gsk_..." 처럼 따옴표째 붙여넣는 일이 잦은데, Vercel 은 그걸 값의
    일부로 저장한다. 그러면 Groq 이 401 invalid_api_key 를 돌려주고,
    밖에서는 키가 폐기된 것과 구별이 안 된다.

    안쪽에 낀 공백은 손대지 않는다. 그건 키가 잘려 들어온 것이라
    조용히 이어붙이면 엉뚱한 키가 만들어진다. 그냥 401 로 실패하게 둔다.
    """
    return raw.strip().strip("\"'").strip()


def read_keys(env: str) -> list[str]:
    """한 제공자에 꽂힌 키를 전부, 적어둔 순서대로 돌려준다.

        GROQ_API_KEY      첫 번째
        GROQ_API_KEY_2    앞엣것이 한도에 걸리면 이걸로
        GROQ_API_KEY_3    ...

    Groq 무료 등급의 하루 토큰 한도는 **키가 아니라 계정 단위**다.
    429 본문에 organization 이 찍혀 나온다. 그래서 같은 계정에서 키만
    더 뽑는 것은 의미가 없다. **서로 다른 계정의 키**를 넣어야 한도가
    실제로 늘어난다. 이걸 모르고 넣으면 두 개를 꽂고도 그대로 막힌다.

    같은 값이 두 번 들어오면 한 번만 센다. 같은 키를 두 칸에 붙여넣는
    실수는 잦은데, 그러면 429 를 두 번 맞고 시간만 버린다.
    """
    keys, seen = [], set()
    for suffix in [""] + [f"_{n}" for n in range(2, MAX_KEYS + 1)]:
        key = clean_key(os.environ.get(env + suffix, ""))
        if key and key not in seen:
            seen.add(key)
            keys.append(key)
    return keys


def available() -> list[str]:
    """키가 실제로 꽂혀 있는 제공자를 우선순위대로."""
    return [name for name, spec in PROVIDERS.items()
            if read_keys(spec["env"])]


def call_openai_compatible(url: str, key: str, model: str, system: str,
                           prompt: str, want_json: bool, history: list) -> str:
    """Groq·Grok 처럼 OpenAI 형식을 쓰는 곳을 부른다.

    주소와 모델명만 다르고 요청 모양은 같다. 그래서 한 벌로 끝난다.
    """
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    for turn in history or []:
        # 프론트가 쓰는 이름이 화면마다 다르다. 전부 받아준다.
        role = "assistant" if turn.get("role") in ("mars", "bot", "model", "assistant") else "user"
        text = turn.get("text") or turn.get("content") or ""
        if text:
            messages.append({"role": role, "content": str(text)})
    messages.append({"role": "user", "content": prompt})

    body = {
        "model": model,
        "messages": messages,
        # 같은 입력에 같은 출력이 나와야 벤치마크가 의미가 있다.
        "temperature": 0,
    }
    if want_json:
        body["response_format"] = {"type": "json_object"}
        # OpenAI 형식의 JSON 모드는 대화 안에 "json" 이라는 낱말이 없으면
        # 400 을 돌려준다. 우리 프롬프트는 한국어라 그 낱말이 없을 때가
        # 많다. 없으면 넣어준다 — 이것 없이 배포하면 서류 체크리스트가
        # 통째로 실패한다.
        if "json" not in (system + prompt).lower():
            messages[-1]["content"] += "\n\nRespond with a JSON object."

    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {key}",
                 "User-Agent": USER_AGENT},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        result = json.loads(response.read().decode("utf-8"))

    choices = result.get("choices") or []
    if not choices:
        raise RuntimeError(f"응답이 비었습니다: {str(result)[:200]}")
    return choices[0].get("message", {}).get("content") or ""


def call_gemini(key: str, model: str, system: str, prompt: str,
                want_json: bool, history: list, schema=None) -> str:
    contents = []
    for turn in history or []:
        # 프론트가 쓰는 이름이 화면마다 다르다. 전부 받아준다.
        role = "model" if turn.get("role") in ("mars", "bot", "model", "assistant") else "user"
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
        if schema:
            body["generationConfig"]["responseSchema"] = schema

    request = urllib.request.Request(
        GEMINI_ENDPOINT.format(model=model),
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": key,
                 "User-Agent": USER_AGENT},
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
        ready = available()
        if not ready:
            return send_json(self, {
                "error": "LLM API 키가 하나도 설정되지 않았습니다",
                "fix": "Vercel → Settings → Environment Variables 에 아래 중 "
                       "하나를 넣고 재배포하세요",
                "accepted": {name: spec["env"] for name, spec in PROVIDERS.items()},
            }, 503)

        payload = read_json(self)
        prompt = payload.get("prompt") or ""
        if not isinstance(prompt, str) or not prompt.strip():
            return send_json(self, {"error": "prompt 가 필요합니다"}, 400)

        # 프론트가 provider 를 지정하면 그것만 쓴다. 아니면 꽂힌 순서대로.
        wanted = str(payload.get("provider") or "").strip().lower()
        wanted = ALIASES.get(wanted, wanted)
        if wanted:
            if wanted not in PROVIDERS:
                return send_json(self, {
                    "error": f"모르는 provider: {wanted}",
                    "accepted": sorted(PROVIDERS),
                }, 400)
            if wanted not in ready:
                return send_json(self, {
                    "error": f"{PROVIDERS[wanted]['label']} 키가 설정되지 않았습니다",
                    "env": PROVIDERS[wanted]["env"],
                }, 503)
            ready = [wanted]

        system = str(payload.get("system") or "")
        want_json = bool(payload.get("json"))
        history = payload.get("history") or []
        # 모델명은 제공자마다 다르다. 프론트가 준 모델명을 다른 제공자에
        # 그대로 넘기면 404 가 난다. 지정한 제공자가 하나일 때만 존중한다.
        override = str(payload.get("model") or "") if len(ready) == 1 else ""

        # 제공자를 순서대로 돌고, 한 제공자 안에서는 꽂힌 키를 순서대로
        # 돈다. 하루 한도(429)에 걸린 키는 그냥 다음 키로 넘어간다.
        # 죽은 키(401)도 같은 길로 건너뛴다 — 시연 중에 한 개가 막혔다고
        # 화면이 멈추는 것보다 조용히 넘어가는 편이 낫다. 다 실패하면
        # 아래에서 무엇이 왜 실패했는지 전부 보여준다.
        failures = []
        for name in ready:
            spec = PROVIDERS[name]
            model = override or spec["model"]
            keys = read_keys(spec["env"])
            for slot, key in enumerate(keys, 1):
                # 키가 하나뿐이면 번호를 붙이지 않는다. 붙이면 로그가
                # 괜히 복잡해 보인다.
                who = spec["label"] if len(keys) == 1 else f"{spec['label']} 키{slot}"
                try:
                    if name == "gemini":
                        text = call_gemini(
                            key=key, model=model, system=system, prompt=prompt,
                            want_json=want_json, history=history,
                            schema=payload.get("schema"),
                        )
                    else:
                        text = call_openai_compatible(
                            url=spec["url"], key=key, model=model, system=system,
                            prompt=prompt, want_json=want_json, history=history,
                        )
                except urllib.error.HTTPError as error:
                    # 본문에 키가 실려 돌아오는 일은 없지만 그대로 흘리지 않는다.
                    detail = error.read().decode("utf-8", "replace")[:300]
                    failures.append(f"{who} ({error.code}): {detail}")
                    continue
                except Exception as error:
                    failures.append(f"{who}: {type(error).__name__}: {error}")
                    continue

                return send_json(self, {
                    "text": text, "provider": name, "model": model,
                    # 몇 번째 키로 나갔는지. 시연 전에 한도가 어디까지
                    # 찼는지 밖에서 보려면 이게 있어야 한다. 키 값은 아니다.
                    "key_slot": slot,
                })

        # 여기까지 왔으면 꽂힌 키가 전부 실패한 것이다. 어느 것이 왜
        # 실패했는지 다 보여준다 — 하나만 보여주면 원인을 못 찾는다.
        send_json(self, {"error": "LLM 호출 실패", "tried": failures}, 502)

    def do_GET(self) -> None:  # noqa: N802
        # 키가 제대로 꽂혔는지만 알려준다. 키 값 자체는 절대 내보내지 않는다.
        send_json(self, {
            "error": "POST 로 호출하세요",
            "providers": {
                name: {"configured": bool(read_keys(spec["env"])),
                       "keys": len(read_keys(spec["env"])),
                       "env": spec["env"], "model": spec["model"]}
                for name, spec in PROVIDERS.items()
            },
            "will_use": (available() or [None])[0],
        }, 405)
