"""GET/PUT /api/users/me/state — 기기 사이로 이어지는 것들.

    GET  → { "state": {...} }
    PUT  { "state": {...} } → { "ok": true }

관심공고·달력 메모·서류 진행·신청 완료가 여기 들어간다. 온보딩 답변은
`/api/users/me/onboarding` 쪽이라 여기 없다 — 그건 매칭 엔진이 직접 쓰는
값이라 모양이 정해져 있고, 이쪽은 화면이 알아서 쓰는 자유로운 덩이다.

**서버는 내용을 해석하지 않는다.** 무엇이 들어있든 그대로 넣고 그대로
꺼내준다. 합치는 판단은 브라우저가 한다(`project/src/utils/userState.js`) —
무엇을 지웠는지는 그 기기만 안다.

로그인이 필수가 아닌 서비스라 여기 없는 사람도 많다. 그 사람들은 기기에만
쌓이고, 나중에 로그인하면 그때 올라간다.
"""

from __future__ import annotations

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import _auth
import _store
from _shared import Base, read_json, send_json

# 사장님 한 명이 담는 양은 수십 KB 를 넘지 않는다. 그보다 크면 우리 화면이
# 보낸 게 아니다.
MAX_KEYS = 40


class handler(Base):  # noqa: N801  Vercel 이 이 이름을 찾는다
    def _user(self) -> int:
        return _auth.user_id_from(self)

    def do_GET(self) -> None:  # noqa: N802
        try:
            user_id = self._user()
        except _auth.AuthError as error:
            return send_json(self, {"error": str(error)}, 401)
        try:
            return send_json(self, {"state": _store.get_state(user_id)})
        except _store.StoreError as error:
            return send_json(self, {"error": str(error)}, 503)

    def do_PUT(self) -> None:  # noqa: N802
        try:
            user_id = self._user()
        except _auth.AuthError as error:
            return send_json(self, {"error": str(error)}, 401)

        state = read_json(self).get("state")
        if not isinstance(state, dict):
            return send_json(self, {"error": "state 는 객체여야 합니다"}, 400)
        if len(state) > MAX_KEYS:
            return send_json(self, {"error": "state 가 너무 큽니다"}, 413)

        try:
            _store.put_state(user_id, state)
        except _store.StoreError as error:
            return send_json(self, {"error": str(error)}, 503)
        return send_json(self, {"ok": True})

    def do_POST(self) -> None:  # noqa: N802
        # PUT 을 못 보내는 환경이 있어서 같이 받아준다.
        self.do_PUT()
