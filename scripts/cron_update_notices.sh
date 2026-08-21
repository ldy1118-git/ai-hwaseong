#!/usr/bin/env bash
# 공고를 매일 갱신해서 커밋·푸시한다. cron 이 부른다.
#
# 원래는 GitHub Actions(.github/workflows/update-notices.yml)가 했다.
# 그런데 기업마당 API 가 GitHub 러너의 IP 에 응답하지 않는다. 2026-08-20,
# 08-21 이틀 연속 「공고 수집」 단계에서 죽었다. 같은 스크립트를 이 서버에서
# 돌리면 1,607건이 정상으로 들어온다. 국내 IP 라서 그렇다.
#
# 그래서 수집은 이 서버가 하고, GitHub Actions 는 손으로 돌릴 때만 쓴다.
#
# 이 스크립트는 전용 클론(mars-fit-cron)에서 돈다. 작업 중인 폴더를 건드리지
# 않으려고 일부러 나눠뒀다. 새벽에 자동으로 rebase 가 돌아서 남의 작업이
# 꼬이는 일이 없어야 한다.
#
# 로그:  mars-fit-cron-logs/YYYY-MM.log
# 상태:  mars-fit-cron-logs/last-run.txt   (성공/실패 한 줄)

set -uo pipefail

CLONE="$(cd "$(dirname "$0")/.." && pwd)"
LOGDIR="$(dirname "$CLONE")/mars-fit-cron-logs"
STATUS="$LOGDIR/last-run.txt"

# 키는 작업용 폴더의 .env 한 곳에만 둔다. 키를 바꿀 때 두 군데를 고치는
# 실수를 막으려고 그렇게 했다. 없으면 클론 자기 것을 쓴다.
ENV_MAIN="$(dirname "$CLONE")/AI_hwasung_limdaeyun/.env"
ENV_SELF="$CLONE/.env"

mkdir -p "$LOGDIR"

log() { echo "[$(TZ=Asia/Seoul date '+%m-%d %H:%M:%S')] $*"; }

finish() {   # $1 = 상태, $2 = 설명
    echo "$(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M') $1 — $2" > "$STATUS"
    log "$1 — $2"
    [ "$1" = "실패" ] && exit 1 || exit 0
}

log "───────────── 시작"

# ── 키 ───────────────────────────────────────────────────────────
if   [ -f "$ENV_MAIN" ]; then set -a; . "$ENV_MAIN"; set +a
elif [ -f "$ENV_SELF" ]; then set -a; . "$ENV_SELF"; set +a
fi
[ -n "${BIZINFO_API_KEY:-}" ] || finish "실패" "BIZINFO_API_KEY 를 못 찾았다 ($ENV_MAIN)"

# ── 최신 코드로 맞춘다 ───────────────────────────────────────────
# reset --hard 를 쓴다. 이 클론에는 사람이 손댈 것이 없으므로 남의 작업을
# 날릴 위험이 없고, 어제 실행이 어중간하게 끝났어도 깨끗하게 시작한다.
cd "$CLONE" || finish "실패" "클론 폴더가 없다: $CLONE"
git fetch -q origin || finish "실패" "git fetch 실패 — 네트워크 확인"
git reset -q --hard origin/main
git clean -qfd policy_data || true

# ── 파이프라인 ───────────────────────────────────────────────────
log "수집·추출·검사 시작"
if ! ./scripts/update_notices.sh; then
    finish "실패" "update_notices.sh 가 죽었다 — 위 로그를 볼 것"
fi

# ── 바뀐 게 없으면 조용히 끝낸다 ─────────────────────────────────
# git diff 가 아니라 git status 로 본다. diff 는 새로 생긴 파일을 못 봐서,
# 새 공고만 뜨고 기존 공고는 그대로인 날에 「바뀐 것 없음」으로 판단하고
# 새 공고를 통째로 놓친다. 공고가 새로 뜨는 게 이 작업의 본체다.
changed=$(git status --porcelain -- policy_data/notices | wc -l)
if [ "$changed" -eq 0 ]; then
    finish "성공" "바뀐 공고 없음"
fi
log "파일 ${changed}개 변경"
git diff --stat -- policy_data/notices | tail -5

# 공고가 늘면 서류·조건 총량도 는다. 기준선을 같이 올려두지 않으면
# 다음 실행 때 guard.py 가 낡은 기준으로 재서 헛경고를 낸다.
python3 policy_data/guard.py --save

git add policy_data/notices policy_data/baseline.json
git commit -q -m "공고 자동 갱신 ($(TZ=Asia/Seoul date '+%Y-%m-%d'))

기업마당 API 에서 받아 파일 ${changed}개가 바뀌었다.
scripts/cron_update_notices.sh 를 이 서버의 cron 이 매일 06:11(KST)에 돌린다." \
    || finish "실패" "커밋 실패"

# ── 푸시. 그 사이 남이 올렸으면 한 번 더 시도한다 ────────────────
if ! git push -q origin main 2>/dev/null; then
    log "푸시 거절됨 — rebase 후 재시도"
    git pull -q --rebase origin main || finish "실패" "rebase 충돌 — 손으로 볼 것"
    git push -q origin main || finish "실패" "재시도 푸시도 실패"
fi

finish "성공" "공고 ${changed}건 갱신 후 푸시"
