#!/usr/bin/env python3
"""새로 뜬 공고를 카카오톡으로 알린다. 연구실 서버 cron 이 부른다.

왜 Vercel 이 아닌가 — 서버리스 함수는 요청이 와야 돈다. 알림은 아무도
안 부를 때 나가야 한다. 공고 갱신 cron 이 이미 매일 06:11 에 돌고 있어서
그 뒤에 붙였다(`scripts/cron_update_notices.sh`).

    ① Supabase 에서 알림 켠 사람 + 그 사람 프로필을 읽는다
    ② 각자 프로필로 매칭을 돌린다
    ③ 「신청가능」이고 70점 이상인데 아직 안 보낸 공고를 고른다
    ④ refresh_token 으로 access_token 을 새로 받아 「나에게 보내기」
    ⑤ 보낸 뒤에 기록한다

**보낸 뒤에 기록한다.** 순서를 바꾸면 발송이 실패했는데 보낸 것으로 남아
영영 안 간다.

환경변수 (연구실 서버 .env)
    SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
    KAKAO_CLIENT_ID / KAKAO_CLIENT_SECRET(선택)
    KAKAO_NOTIFY_LINK    메시지에서 눌렀을 때 열 주소 (배포된 사이트)

손으로 돌려볼 때:
    python3 scripts/notify_kakao.py --dry-run    보내지 않고 누구에게 뭐가
                                                 갈지만 찍는다
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "policy_data"))

import _store            # noqa: E402
import matching          # noqa: E402

TOKEN_URL = "https://kauth.kakao.com/oauth/token"
MEMO_URL = "https://kapi.kakao.com/v2/api/talk/memo/default/send"
TIMEOUT = 10

# 인앱 종과 같은 기준이어야 한다. 한쪽만 고치면 카톡은 왔는데 화면에는
# 없거나 그 반대가 된다(`project/src/utils/notifications.js`).
SCORE_MIN = 70
# 한 사람에게 하루 세 건까지. 그 이상은 알림이 아니라 스팸이다.
MAX_PER_USER = 3


def load_env() -> None:
    """.env 를 읽어 환경변수로 올린다. cron 은 셸 프로필을 안 읽는다."""
    path = ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def refresh_access_token(refresh_token: str) -> dict:
    """refresh_token 으로 access_token 을 새로 받는다.

    카카오는 refresh_token 이 만료에 가까우면 새 것을 같이 준다. 오면
    저장해둔다 — 안 그러면 두 달 뒤에 조용히 멈춘다.
    """
    form = {
        "grant_type": "refresh_token",
        "client_id": os.environ.get("KAKAO_CLIENT_ID", "").strip(),
        "refresh_token": refresh_token,
    }
    secret = os.environ.get("KAKAO_CLIENT_SECRET", "").strip()
    if secret:
        form["client_secret"] = secret

    request = urllib.request.Request(
        TOKEN_URL,
        data=urllib.parse.urlencode(form).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded;charset=utf-8"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return json.loads(response.read().decode("utf-8"))


def send_memo(access_token: str, text: str, link: str) -> None:
    """「나에게 보내기」. 사장님 카톡의 「나와의 채팅」에 뜬다."""
    template = {
        "object_type": "text",
        "text": text,
        "link": {"web_url": link, "mobile_web_url": link},
        "button_title": "공고 보러가기",
    }
    request = urllib.request.Request(
        MEMO_URL,
        data=urllib.parse.urlencode({
            "template_object": json.dumps(template, ensure_ascii=False),
        }).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        response.read()


def message_for(rows: list[dict]) -> str:
    """여러 건이어도 카톡은 한 번만 보낸다. 세 건이면 세 번 울린다."""
    if len(rows) == 1:
        row = rows[0]
        return (
            "새로 뜬 지원사업이 조건에 잘 맞아요\n\n"
            f"「{row['notice_title']}」\n"
            f"매칭 {row['match_score']}점"
            + (f"\n마감 {row['apply_period']['end']}"
               if (row.get("apply_period") or {}).get("end") else "")
        )
    lines = [f"조건에 맞는 지원사업 {len(rows)}건이 새로 떴어요\n"]
    for row in rows:
        lines.append(f"· {row['notice_title']} ({row['match_score']}점)")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="보내지 않고 누구에게 뭐가 갈지만 찍는다")
    args = parser.parse_args()

    load_env()

    # cron 이 부를 때는 cron_update_notices.sh 가 작업용 폴더의 .env 를 이미
    # export 해둔다. 손으로 돌릴 때는 위 load_env() 가 읽는다. 둘 다 아니면
    # 여기서 멈춘다 — 없는 채로 가면 Supabase 오류 메시지가 「Vercel 에
    # 넣으세요」라고 나와서 엉뚱한 데를 보게 된다.
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
                           "KAKAO_CLIENT_ID") if not os.environ.get(k, "").strip()]
    if missing:
        print(f"실패 — {', '.join(missing)} 이(가) 없다.", file=sys.stderr)
        print(f"       {ROOT / '.env'} 에 넣을 것. Vercel 에 있는 것과 같은 값이다.",
              file=sys.stderr)
        return 1

    link = os.environ.get("KAKAO_NOTIFY_LINK", "").strip() \
        or "https://ai-hwaseong-ten.vercel.app"

    try:
        targets = _store.list_kakao_notify()
    except _store.StoreError as error:
        print(f"실패 — {error}", file=sys.stderr)
        return 1

    if not targets:
        print("알림을 켠 사람이 없다")
        return 0

    policies = matching.load_policies_from_folder(matching.default_notices_folder())
    sent_total = 0

    for target in targets:
        user_id = target["user_id"]

        row = _store.get_profile(user_id)
        profile = (row or {}).get("profile") or {}
        if not profile:
            # 로그인만 하고 온보딩을 안 했다. 매칭할 조건이 없다.
            print(f"  건너뜀 user={user_id} — 프로필 없음")
            continue

        results = matching.match_policies(policies, profile)
        picked = [
            r for r in results
            if r.get("overall_status") == "신청가능"
            and int(r.get("match_score", 0)) >= SCORE_MIN
        ]
        picked.sort(key=lambda r: -int(r.get("match_score", 0)))

        fresh = []
        for r in picked:
            if len(fresh) >= MAX_PER_USER:
                break
            if not _store.already_sent(user_id, r["notice_id"], "new"):
                fresh.append(r)

        if not fresh:
            print(f"  없음 user={user_id}")
            continue

        text = message_for(fresh)
        if args.dry_run:
            print(f"  [보냄안함] user={user_id} — {len(fresh)}건")
            print("    " + text.replace("\n", "\n    "))
            continue

        try:
            tokens = refresh_access_token(target["refresh_token"])
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:200]
            # 사장님이 카카오 쪽에서 연결을 끊었을 수 있다. 그러면 이 토큰은
            # 영영 안 산다 — 매일 실패 로그를 남기지 말고 정리한다.
            print(f"  토큰 실패 user={user_id} ({error.code}) {detail}", file=sys.stderr)
            if error.code in (400, 401):
                _store.clear_kakao_notify(user_id)
                print(f"  알림 끔 user={user_id} — 카카오 연결이 끊겼다")
            continue
        except Exception as error:
            print(f"  토큰 실패 user={user_id} — {error}", file=sys.stderr)
            continue

        # 새 refresh_token 이 딸려 오면 갈아끼운다. 안 하면 두 달 뒤 멈춘다.
        if tokens.get("refresh_token"):
            _store.set_kakao_notify(user_id, tokens["refresh_token"])

        try:
            send_memo(tokens["access_token"], text, link)
        except Exception as error:
            print(f"  발송 실패 user={user_id} — {error}", file=sys.stderr)
            continue

        # 보낸 뒤에 적는다. 반대로 하면 실패한 것이 보낸 것으로 남는다.
        for r in fresh:
            _store.mark_sent(user_id, r["notice_id"], "new")
        sent_total += 1
        print(f"  보냄 user={user_id} — {len(fresh)}건")

    print(f"끝 — {sent_total}명에게 보냄")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
