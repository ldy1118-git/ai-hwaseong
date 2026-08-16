"""POST /api/auth/kakao — 카카오 인가 코드로 로그인한다.

길벗(github.com/Gilbut2026) 의 KakaoOAuthService 와 같은 흐름이다.

    프론트가 카카오에서 code 를 받아 여기로 보낸다
      1. code + client_secret → 카카오 액세스 토큰      (kauth)
      2. 액세스 토큰 → 사용자 정보                       (kapi)
      3. provider_id(카카오 회원번호)로 사용자 조회
      4. 없으면 생성
      5. 우리 JWT 발급
      6. 온보딩 완료 여부 판단
    → { token, new_user, onboarding_completed, user }

**client_secret 은 여기(서버)에만 둔다.** 프론트는 code 만 넘긴다.
프론트에서 직접 토큰을 교환하면 시크릿이 번들에 박힌다.

환경변수
    KAKAO_CLIENT_ID       REST API 키
    KAKAO_CLIENT_SECRET   (선택) 콘솔에서 보안 > Client Secret 을 켰다면
    KAKAO_REDIRECT_URI    콘솔에 등록한 값과 **정확히** 같아야 한다

주의: 이메일·전화번호·생년월일은 비즈 앱 전환(사업자등록증 필요) 후에만
받을 수 있다. 해커톤 팀은 못 하므로 닉네임만 쓰고, 그마저 없을 수 있다.
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
import urllib.parse
import urllib.request

import _auth
import _store
from _shared import Base, read_json, send_json

TOKEN_URL = "https://kauth.kakao.com/oauth/token"
USERINFO_URL = "https://kapi.kakao.com/v2/user/me"
TIMEOUT = 10


def exchange_code(code: str) -> str:
    client_id = os.environ.get("KAKAO_CLIENT_ID", "").strip()
    redirect_uri = os.environ.get("KAKAO_REDIRECT_URI", "").strip()
    secret = os.environ.get("KAKAO_CLIENT_SECRET", "").strip()
    if not client_id or not redirect_uri:
        raise RuntimeError(
            "KAKAO_CLIENT_ID / KAKAO_REDIRECT_URI 가 설정되지 않았습니다"
        )

    form = {
        "grant_type": "authorization_code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "code": code,
    }
    if secret:
        form["client_secret"] = secret

    request = urllib.request.Request(
        TOKEN_URL,
        data=urllib.parse.urlencode(form).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded;charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        # redirect_uri 불일치가 여기서 제일 많이 터진다. 원문을 그대로 넘긴다.
        raise RuntimeError(f"카카오 토큰 발급 실패 ({error.code}): {detail}") from error

    token = payload.get("access_token")
    if not token:
        raise RuntimeError("카카오 응답에 access_token 이 없습니다")
    return token


def fetch_user(kakao_token: str) -> tuple[str, str | None]:
    request = urllib.request.Request(
        USERINFO_URL,
        headers={"Authorization": f"Bearer {kakao_token}", "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"카카오 사용자 조회 실패 ({error.code}): {detail}") from error

    if payload.get("id") is None:
        raise RuntimeError("카카오 응답에 사용자 ID 가 없습니다")

    nickname = (payload.get("kakao_account") or {}).get("profile", {}).get("nickname")
    return str(payload["id"]), nickname


class handler(Base):  # noqa: N801
    def do_POST(self) -> None:  # noqa: N802
        code = (read_json(self).get("code") or "").strip()
        if not code:
            return send_json(self, {"error": "code 가 필요합니다"}, 400)

        try:
            provider_id, nickname = fetch_user(exchange_code(code))
        except RuntimeError as error:
            return send_json(self, {"error": str(error)}, 502)

        try:
            user = _store.find_user_by_provider(provider_id)
            new_user = user is None
            if new_user:
                user = _store.create_user(provider_id, nickname)
            token = _auth.issue(int(user["id"]))
            completed = _store.onboarding_completed(int(user["id"]))
        except _store.StoreError as error:
            return send_json(self, {"error": str(error)}, 503)
        except _auth.AuthError as error:
            return send_json(self, {"error": str(error)}, 503)

        # 프론트가 이 응답만 보고 온보딩으로 갈지 홈으로 갈지 정한다.
        send_json(self, {
            "token": token,
            "new_user": new_user,
            "onboarding_completed": completed,
            "user": {"id": user["id"], "username": user["username"]},
        })

    def do_GET(self) -> None:  # noqa: N802
        # 설정이 꽂혔는지만 알려준다. 값 자체는 절대 내보내지 않는다.
        send_json(self, {
            "error": "POST 로 호출하세요",
            "example": {"code": "카카오에서 받은 인가 코드"},
            "configured": {
                "KAKAO_CLIENT_ID": bool(os.environ.get("KAKAO_CLIENT_ID", "").strip()),
                "KAKAO_REDIRECT_URI": os.environ.get("KAKAO_REDIRECT_URI", "") or None,
                "SUPABASE_URL": bool(os.environ.get("SUPABASE_URL", "").strip()),
                "JWT_SECRET": bool(os.environ.get("JWT_SECRET", "").strip()),
            },
        }, 405)
