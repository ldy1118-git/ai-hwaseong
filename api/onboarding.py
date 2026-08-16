"""/api/users/me/onboarding — 온보딩 결과 저장·조회.

    PUT   온보딩 완료. 없으면 만들고 있으면 갱신(upsert)
    GET   저장된 프로필 조회
    PATCH 일부 항목만 수정. None 은 무시하고 덮어쓴다

길벗의 UserOnboardingController 와 같은 경로·같은 메서드다.
PUT 인 이유는 멱등이라서다 — 온보딩을 두 번 마쳐도 프로필이 둘이 되지 않는다.

Authorization: Bearer <JWT> 가 필요하다. /api/auth/kakao 가 발급한다.

저장 형태를 길벗과 다르게 잡았다. 길벗은 7개 질문이 고정이라 컬럼을
하나씩 만들었는데, 우리 프로필은 10개 키에 계속 바뀌고 매칭 엔진에
dict 그대로 넘어간다. 그래서 jsonb 한 칸에 통째로 넣는다. 질문이
늘어도 마이그레이션이 필요 없다.
"""

from __future__ import annotations

import _auth
import _store
from _shared import Base, read_json, send_json

# 매칭 엔진이 아는 키만 받는다. 모르는 키는 조용히 버린다.
# policy_data/schema.md 와 같은 목록이다.
PROFILE_KEYS = {
    "region", "business_status", "category", "career_experience", "asset_group",
    "age", "business_period_months", "annual_revenue_krw", "marital_status",
    "living_with_parents",
}


def clean(raw) -> tuple[dict, list[str]]:
    """아는 키만 남기고, 버린 키를 같이 돌려준다.

    조용히 버리기만 하면 프론트가 키 이름을 틀렸을 때 아무도 모른다.
    실제로 그 사고가 나기 쉬운 구조라 응답에 ignored 로 실어 보낸다.
    """
    if not isinstance(raw, dict):
        return {}, []
    kept = {k: v for k, v in raw.items() if k in PROFILE_KEYS}
    ignored = sorted(set(raw) - PROFILE_KEYS)
    return kept, ignored


class handler(Base):  # noqa: N801
    def _user(self):
        return _auth.user_id_from(self)

    def do_GET(self) -> None:  # noqa: N802
        try:
            row = _store.get_profile(self._user())
        except _auth.AuthError as error:
            return send_json(self, {"error": str(error)}, 401)
        except _store.StoreError as error:
            return send_json(self, {"error": str(error)}, 503)

        send_json(self, {
            "profile": (row or {}).get("profile") or {},
            "onboarding_completed": bool(row and row.get("profile")),
            "updated_at": (row or {}).get("updated_at"),
        })

    def do_PUT(self) -> None:  # noqa: N802
        payload = read_json(self)
        profile, ignored = clean(payload.get("profile", payload))
        if not profile:
            return send_json(self, {
                "error": "저장할 프로필이 없습니다",
                "known_keys": sorted(PROFILE_KEYS),
            }, 400)

        try:
            row = _store.upsert_profile(self._user(), profile)
        except _auth.AuthError as error:
            return send_json(self, {"error": str(error)}, 401)
        except _store.StoreError as error:
            return send_json(self, {"error": str(error)}, 503)

        send_json(self, {
            "profile": row.get("profile"),
            "onboarding_completed": True,
            "ignored_keys": ignored,
        })

    def do_PATCH(self) -> None:  # noqa: N802
        payload = read_json(self)
        patch, ignored = clean(payload.get("profile", payload))
        if not patch:
            return send_json(self, {"error": "수정할 항목이 없습니다"}, 400)

        try:
            row = _store.merge_profile(self._user(), patch)
        except _auth.AuthError as error:
            return send_json(self, {"error": str(error)}, 401)
        except _store.StoreError as error:
            return send_json(self, {"error": str(error)}, 503)

        send_json(self, {"profile": row.get("profile"), "ignored_keys": ignored})

    def do_POST(self) -> None:  # noqa: N802
        # PUT 을 쓰라고 알려주되 그냥 처리해준다. 여기서 막으면 디버깅만 길어진다.
        self.do_PUT()
