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
    scripts/notify_kakao.py --dry-run          보내지 않고 누구에게 뭐가 갈지만
    scripts/notify_kakao.py --demo --user 3    시연용. 제일 잘 맞는 1건을 지금

시연 모드는 보낸 기록을 안 남긴다. 리허설에서 한 번 써버리면 정작 심사
때 안 오는 일이 없게. `--user` 로 좁히지 않으면 켜둔 사람 전부에게 간다.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "policy_data"))

import _store            # noqa: E402
import matching          # noqa: E402
import tax_schedule      # noqa: E402

TOKEN_URL = "https://kauth.kakao.com/oauth/token"
MEMO_URL = "https://kapi.kakao.com/v2/api/talk/memo/default/send"
TIMEOUT = 10

# 사장님이 아무것도 안 고쳤을 때 쓰는 값. 고쳤으면 user_state.settings 에
# 들어 있고 그쪽이 이긴다.
#
# 인앱 종과 같은 기준이어야 한다. 한쪽만 고치면 카톡은 왔는데 화면에는
# 없거나 그 반대가 된다(`project/src/utils/notifySettings.js` 의 DEFAULTS).
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


def tax_events(profile: dict, year: int) -> list[dict]:
    """세무 신고기한을 달력에 찍을 수 있는 모양으로 편다.

    `project/src/utils/taxCalendar.js` 와 같은 일을 한다. 두 벌인 것이
    마음에 걸리지만 원본(`policy_data/tax_schedule.py`)이 파이썬이고 화면은
    JS 라 어차피 계산이 양쪽에 있다. **한쪽만 고치면 카톡과 화면이 다른
    날짜를 말한다.**

    운영중인 사업자에게만. applies() 가 「프로필에 값이 없으면 통과」라서
    안 막으면 예비창업자에게 열 건이 뜨고, 일반과세 부가세와 간이과세
    부가세가 같은 날 나란히 나온다.

    「해당되면 이것도」(if_applicable)는 넣지 않는다. 프로필만으로는 해당
    여부를 알 수 없어서, 안 해도 되는 신고를 알리게 된다.
    """
    if profile.get("business_status") != "운영중":
        return []

    out = []
    for year_ in (year, year + 1):
        for event in tax_schedule.schedule(profile, year_)["must_do"]:
            if event.get("due_dates"):
                for index, due in enumerate(event["due_dates"], start=1):
                    if due.get("date"):
                        out.append({"id": f"{event['id']}-{year_}-{index}",
                                    "base": event["id"],
                                    "title": event["title"], "due": due["date"]})
            elif event.get("due_date"):
                out.append({"id": f"{event['id']}-{year_}",
                            "base": event["id"],
                            "title": event["title"], "due": event["due_date"]})
    return sorted(out, key=lambda e: e["due"])


def pick_tax(profile: dict, settings: dict, today: date, sent: set[str],
             done: dict | None = None) -> list[dict]:
    """오늘 보낼 세무 알림. 화면(`utils/notifications.js`)과 같은 규칙이다.

    고른 시점 중 **아직 안 지난 것 하나**만 쓴다. 30·7·1 을 다 골랐는데
    D-5 에 처음 켰다면 셋이 한꺼번에 나가면 안 된다.

    보낸 기록으로 걸러서 같은 문턱을 두 번 안 보낸다. cron 이 하루 걸러도
    다음 날 잡히도록 「딱 그날」이 아니라 「그 문턱 안에 들어왔나」로 본다.

    `done` 은 화면에서 「완료」로 찍은 것이다(user_state.taxDone). 7월에
    부가세를 내고 체크했는데 D-1 에 카톡이 오면 안 된다. 열쇠 모양은
    `project/src/utils/taxDone.js` 의 taxDoneKey() 와 같아야 한다 —
    「원본항목번호::기한」. 한쪽만 고치면 화면은 지웠는데 카톡은 계속 온다.
    """
    if not settings.get("tax", True):
        return []
    leads = sorted(int(n) for n in (settings.get("taxLead") or [7, 1]))
    if not leads:
        return []

    done = done or {}
    out = []
    for event in tax_events(profile, today.year):
        if done.get(f"{event['base']}::{event['due']}"):
            continue
        try:
            due = date.fromisoformat(event["due"])
        except ValueError:
            continue
        left = (due - today).days
        if left < 0:
            continue
        lead = next((n for n in leads if left <= n), None)
        if lead is None:
            continue
        if f"{event['id']}::{lead}" in sent:
            continue
        out.append({**event, "left": left, "lead": lead})
    return out


def message_for_tax(rows: list[dict]) -> str:
    if len(rows) == 1:
        row = rows[0]
        when = ("오늘까지예요" if row["left"] == 0
                else "내일까지예요" if row["left"] == 1
                else f"{row['left']}일 남았어요")
        return f"세무 신고기한이 다가와요\n\n「{row['title']}」\n{when}"
    lines = ["세무 신고기한이 다가와요\n"]
    for row in rows:
        when = "오늘" if row["left"] == 0 else "내일" if row["left"] == 1 else f"{row['left']}일 뒤"
        lines.append(f"· {row['title']} ({when})")
    return "\n".join(lines)


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


def _send_to(target: dict, user_id: int, text: str, link: str) -> bool:
    """토큰을 새로 받아 보낸다. 보냈으면 True.

    시연 모드와 평소 발송이 같은 길을 쓰게 하려고 뺐다. 두 벌로 두면
    한쪽만 고쳐서 시연 때만 다르게 도는 일이 생긴다.
    """
    try:
        tokens = refresh_access_token(target["refresh_token"])
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:200]
        print(f"  토큰 실패 user={user_id} ({error.code}) {detail}", file=sys.stderr)

        # 지울지 말지는 **오류 종류**로 가른다. 상태 코드로 가르면 안 된다.
        #
        #   invalid_grant   사장님이 카카오에서 연결을 끊었거나 토큰이
        #                   만료됐다. 이 토큰은 영영 안 산다 → 정리한다.
        #   invalid_client  우리 KAKAO_CLIENT_ID/SECRET 이 틀렸다.
        #                   서버 설정 문제인데 사장님 동의를 지우면 안 된다.
        #
        # 처음에는 400·401 이면 무조건 지웠다. 그랬더니 연구실 서버에
        # KAKAO_CLIENT_SECRET 을 안 넣은 상태에서 한 번 돌린 것만으로
        # 켜둔 사람의 동의가 날아갔다. 다시 켜달라고 할 수도 없다 —
        # 연락 수단이 그 동의였기 때문이다.
        if '"invalid_grant"' in detail:
            _store.clear_kakao_notify(user_id)
            print(f"  알림 끔 user={user_id} — 카카오 연결이 끊겼다")
        return False
    except Exception as error:
        print(f"  토큰 실패 user={user_id} — {error}", file=sys.stderr)
        return False

    # 새 refresh_token 이 딸려 오면 갈아끼운다. 안 하면 두 달 뒤 멈춘다.
    if tokens.get("refresh_token"):
        _store.set_kakao_notify(user_id, tokens["refresh_token"])

    try:
        send_memo(tokens["access_token"], text, link)
    except Exception as error:
        print(f"  발송 실패 user={user_id} — {error}", file=sys.stderr)
        return False
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="보내지 않고 누구에게 뭐가 갈지만 찍는다")
    parser.add_argument("--demo", action="store_true",
                        help="시연용. 제일 잘 맞는 공고 1건을 지금 보낸다. "
                             "보낸 기록을 안 남겨서 몇 번이든 다시 된다")
    parser.add_argument("--user", type=int, default=None,
                        help="이 사람에게만. 시연 때 남의 카톡까지 울리지 않게")
    args = parser.parse_args()

    load_env()

    # cron 이 부를 때는 cron_update_notices.sh 가 작업용 폴더의 .env 를 이미
    # export 해둔다. 손으로 돌릴 때는 위 load_env() 가 읽는다. 둘 다 아니면
    # 여기서 멈춘다 — 없는 채로 가면 Supabase 오류 메시지가 「Vercel 에
    # 넣으세요」라고 나와서 엉뚱한 데를 보게 된다.
    # KAKAO_CLIENT_SECRET 은 콘솔에서 Client Secret 을 켠 경우에만 필요하다.
    # 켰는데 안 넣으면 토큰 갱신이 KOE010(invalid_client)으로 전부 실패한다.
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

    if args.user is not None:
        targets = [t for t in targets if t["user_id"] == args.user]
        if not targets:
            print(f"user={args.user} 는 알림을 안 켰다", file=sys.stderr)
            return 1

    if not targets:
        print("알림을 켠 사람이 없다")
        return 0

    if args.demo:
        # 시연용이라 여럿에게 가면 안 된다. 누구에게 가는지 먼저 밝힌다.
        who = ", ".join(str(t["user_id"]) for t in targets)
        print(f"시연 모드 — user={who} 에게 1건씩 보낸다 (기록 안 남김)")

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

        # 화면에서 고른 알림 설정. 여기를 안 보면 사장님이 「새 공고 알림」을
        # 껐는데 카톡은 계속 오는, 제일 나쁜 모양이 된다.
        try:
            state = _store.get_state(user_id) or {}
        except _store.StoreError:
            state = {}
        settings = state.get("settings") or {}
        tax_done = state.get("taxDone") or {}
        # 새 공고를 껐어도 세무 알림은 받을 수 있다. 여기서 끊지 않고
        # 아래에서 공고 목록만 비운다.
        score_min = int(settings.get("minScore") or SCORE_MIN)

        results = matching.match_policies(policies, profile)
        picked = [
            r for r in results
            if r.get("overall_status") == "신청가능"
            and int(r.get("match_score", 0)) >= score_min
        ]
        picked.sort(key=lambda r: -int(r.get("match_score", 0)))

        # 시연 모드는 보낸 기록을 무시하고 제일 잘 맞는 것 하나를 보낸다.
        # 기록을 안 남기므로 몇 번이든 다시 된다 — 리허설에서 한 번 써버리면
        # 정작 심사 때 안 오는 일이 없게.
        if args.demo:
            if not picked:
                print(f"  없음 user={user_id} — 조건에 맞는 공고가 없다")
                continue
            text = message_for(picked[:1])
            if args.dry_run:
                print(f"  [보냄안함] user={user_id}")
                print("    " + text.replace("\n", "\n    "))
                continue
            if _send_to(target, user_id, text, link):
                sent_total += 1
                print(f"  보냄 user={user_id} — 1건 (기록 안 남김)")
            continue

        # ── 세무 신고기한 ──
        # 첫 실행 기준선(아래)에 안 걸리게 먼저 계산한다. 닷새 뒤 신고기한이
        # 있는데 「처음이라」고 넘어가면 그 신고를 놓친다. 공고는 스무 건이
        # 쌓여 있어서 기준선이 필요하지만, 세무는 날짜가 정해진 몇 건뿐이라
        # 지금 걸린 것이 곧 알려야 할 것이다.
        tax_sent = _store.sent_notice_ids(user_id, "tax")
        tax_rows = pick_tax(profile, settings, date.today(), tax_sent, tax_done)

        sent = _store.sent_notice_ids(user_id, "new")

        # 알림을 켠 직후에는 아무것도 안 보낸다.
        #
        # 여기 걸리는 공고가 스무 건이 넘는데, 그건 「새로 떴다」가 아니라
        # 처음부터 있던 것이다. 하루 세 건씩 보내면 아흐레 동안 카톡이
        # 온다 — 사장님은 그 전에 알림을 꺼버린다.
        #
        # 그래서 첫 실행에는 지금 걸리는 것을 전부 「보냄」으로 적어두고
        # 넘어간다. 인앱 종도 첫 방문에는 목록만 적어두고 아무것도 안 띄운다
        # (`project/src/utils/notifications.js`). 같은 규칙이다.
        if not sent:
            for r in picked:
                _store.mark_sent(user_id, r["notice_id"], "new")
            print(f"  기준선 user={user_id} — 공고 {len(picked)}건 적어둠 (첫 실행이라 안 보냄)")
            fresh = []
        else:
            fresh = [r for r in picked if r["notice_id"] not in sent][:MAX_PER_USER]

        if not settings.get("newNotices", True):
            fresh = []

        if not fresh and not tax_rows:
            print(f"  없음 user={user_id}")
            continue

        # 한 통에 묶는다. 따로 보내면 아침에 두 번 울린다.
        parts = []
        if tax_rows:
            parts.append(message_for_tax(tax_rows))
        if fresh:
            parts.append(message_for(fresh))
        text = "\n\n───────────\n\n".join(parts)

        if args.dry_run:
            print(f"  [보냄안함] user={user_id} — 공고 {len(fresh)}건 · 세무 {len(tax_rows)}건")
            print("    " + text.replace("\n", "\n    "))
            continue

        if not _send_to(target, user_id, text, link):
            continue

        # 보낸 뒤에 적는다. 반대로 하면 실패한 것이 보낸 것으로 남는다.
        for r in fresh:
            _store.mark_sent(user_id, r["notice_id"], "new")
        for r in tax_rows:
            _store.mark_sent(user_id, f"{r['id']}::{r['lead']}", "tax")
        sent_total += 1
        print(f"  보냄 user={user_id} — 공고 {len(fresh)}건 · 세무 {len(tax_rows)}건")

    print(f"끝 — {sent_total}명에게 보냄")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
