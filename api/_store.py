"""Supabase 저장소. 표준 라이브러리만 쓴다.

psycopg 같은 드라이버를 넣으면 requirements.txt 가 생기고 함수 용량이
커진다. Supabase 는 PostgREST 를 HTTP 로 열어주므로 urllib 로 충분하다.
이 파일 덕분에 api/ 전체가 여전히 의존성 0 이다.

환경변수 (Vercel → Settings → Environment Variables)
    SUPABASE_URL                 https://xxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY    service_role 키

**service_role 키는 RLS 를 통과한다.** 서버에서만 쓸 것.
프론트로 내려보내면 남의 데이터를 다 읽을 수 있게 된다.
그래서 VITE_ 로 시작하는 이름을 절대 붙이지 않는다.

테이블은 docs/supabase_schema.sql 참고.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request

TIMEOUT = 10


class StoreError(RuntimeError):
    """설정 누락이나 Supabase 응답 오류. 호출부가 503/502 로 바꿔 내보낸다."""


def _config() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise StoreError(
            "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다. "
            "Vercel → Settings → Environment Variables 에 추가하고 재배포하세요"
        )
    return url, key


def _call(method: str, table: str, *, params: dict | None = None,
          body=None, prefer: str | None = None):
    base, key = _config()
    query = ("?" + urllib.parse.urlencode(params)) if params else ""
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer

    request = urllib.request.Request(
        f"{base}/rest/v1/{table}{query}",
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        raise StoreError(f"Supabase {error.code}: {detail}") from error
    except Exception as error:
        raise StoreError(f"Supabase 연결 실패: {error}") from error

    return json.loads(raw) if raw.strip() else []


# ---------------------------------------------------------------- users

def find_user_by_provider(provider_id: str) -> dict | None:
    rows = _call("GET", "users", params={
        "provider_id": f"eq.{provider_id}",
        "select": "id,provider_id,username",
        "limit": "1",
    })
    return rows[0] if rows else None


def create_user(provider_id: str, username: str | None) -> dict:
    """카카오 닉네임 동의를 안 받으면 username 이 None 으로 온다.

    비즈 앱 전환(사업자등록증 필요) 전에는 이메일·전화번호를 못 받으므로
    닉네임조차 없을 수 있다. 그때는 회원번호 뒷자리로 이름을 만든다.
    """
    name = (username or "").strip() or f"사장님{provider_id[-4:]}"
    rows = _call("POST", "users",
                 body={"provider_id": provider_id, "username": name},
                 prefer="return=representation")
    if not rows:
        raise StoreError("사용자 생성 후 응답이 비었습니다")
    return rows[0]


# ------------------------------------------------------------- profiles

def get_profile(user_id: int) -> dict | None:
    rows = _call("GET", "user_profiles", params={
        "user_id": f"eq.{user_id}",
        "select": "user_id,profile,updated_at",
        "limit": "1",
    })
    return rows[0] if rows else None


def upsert_profile(user_id: int, profile: dict) -> dict:
    """없으면 만들고 있으면 갱신. 온보딩을 다시 해도 중복이 안 생긴다.

    user_id 가 기본키라 merge-duplicates 가 그걸 충돌 기준으로 잡는다.
    """
    rows = _call("POST", "user_profiles",
                 params={"on_conflict": "user_id"},
                 body={"user_id": user_id, "profile": profile},
                 prefer="resolution=merge-duplicates,return=representation")
    if not rows:
        raise StoreError("프로필 저장 후 응답이 비었습니다")
    return rows[0]


def merge_profile(user_id: int, patch: dict) -> dict:
    """일부 항목만 고칠 때. 기존 값 위에 덮어쓴다.

    None 인 값은 무시한다 — 프론트가 안 건드린 항목을 null 로 보내도
    기존 값이 지워지지 않게 한다. backend/matching.py 의
    merge_user_profile() 과 같은 규칙이다.
    """
    current = (get_profile(user_id) or {}).get("profile") or {}
    current.update({k: v for k, v in patch.items() if v is not None})
    return upsert_profile(user_id, current)


def delete_profile(user_id: int) -> None:
    """저장된 온보딩 답변을 지운다. 없어도 오류가 아니다.

    users 행은 남긴다. 카카오로 다시 들어오면 같은 사람으로 이어지고,
    온보딩만 처음부터 다시 물어본다 — 「탈퇴」로 사용자가 기대하는 것은
    자기가 답한 내용이 사라지는 것이지 로그인 이력이 아니다.
    """
    _call("DELETE", "user_profiles", params={"user_id": f"eq.{user_id}"})


def onboarding_completed(user_id: int) -> bool:
    """길벗이 이동 프로필 존재 여부로 판단한 것과 같은 방식."""
    row = get_profile(user_id)
    return bool(row and row.get("profile"))
