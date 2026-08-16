"""JWT 발급·검증. 표준 라이브러리만 쓴다 (PyJWT 불필요).

HS256 이면 hmac + hashlib 으로 충분하다. 서명 검증은 반드시
hmac.compare_digest 로 한다 — == 로 비교하면 실행 시간 차이로
서명을 한 바이트씩 맞춰볼 수 있다.

환경변수
    JWT_SECRET    아무 긴 랜덤 문자열. 바뀌면 기존 토큰이 전부 무효가 된다.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

ALGORITHM = "HS256"
TTL_SECONDS = 60 * 60 * 24 * 14  # 2주. 해커톤 시연 중에 만료되면 곤란하다.


class AuthError(RuntimeError):
    pass


def _secret() -> bytes:
    value = os.environ.get("JWT_SECRET", "").strip()
    if not value:
        raise AuthError(
            "JWT_SECRET 이 설정되지 않았습니다. "
            "Vercel → Settings → Environment Variables 에 긴 랜덤 문자열을 넣으세요"
        )
    return value.encode("utf-8")


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(message: str) -> str:
    return _b64(hmac.new(_secret(), message.encode("ascii"), hashlib.sha256).digest())


def issue(user_id: int) -> dict:
    now = int(time.time())
    header = _b64(json.dumps({"alg": ALGORITHM, "typ": "JWT"},
                             separators=(",", ":")).encode())
    payload = _b64(json.dumps({"sub": str(user_id), "iat": now,
                               "exp": now + TTL_SECONDS},
                              separators=(",", ":")).encode())
    body = f"{header}.{payload}"
    return {
        "access_token": f"{body}.{_sign(body)}",
        "token_type": "Bearer",
        "expires_in": TTL_SECONDS,
    }


def verify(token: str) -> int:
    """유효하면 user_id, 아니면 AuthError."""
    try:
        header, payload, signature = token.split(".")
    except ValueError:
        raise AuthError("토큰 형식이 올바르지 않습니다") from None

    if not hmac.compare_digest(_sign(f"{header}.{payload}"), signature):
        raise AuthError("토큰 서명이 맞지 않습니다")

    try:
        claims = json.loads(_unb64(payload))
    except Exception:
        raise AuthError("토큰을 읽을 수 없습니다") from None

    if int(claims.get("exp", 0)) < int(time.time()):
        raise AuthError("토큰이 만료되었습니다. 다시 로그인해주세요")

    try:
        return int(claims["sub"])
    except (KeyError, TypeError, ValueError):
        raise AuthError("토큰에 사용자 정보가 없습니다") from None


def user_id_from(handler) -> int:
    """Authorization: Bearer <token> 에서 user_id 를 꺼낸다."""
    raw = handler.headers.get("Authorization") or ""
    if not raw.startswith("Bearer "):
        raise AuthError("로그인이 필요합니다")
    return verify(raw[len("Bearer "):].strip())
