#!/usr/bin/env bash
# 공고를 최신으로 갱신한다.
#
#     ./scripts/update_notices.sh          수집 → 추출 → 검사
#     ./scripts/update_notices.sh --check  검사만 (아무것도 안 바꾼다)
#
# 발표 전날 한 번 돌릴 것. 공고에는 마감일이 있어서 며칠만 지나도
# 이미 끝난 사업이 화면에 남는다.
#
# GitHub Actions(.github/workflows/update-notices.yml)가 매일 아침
# 이걸 돌리고, 바뀐 게 있으면 자동으로 커밋한다. 이 스크립트는 손으로
# 돌릴 때와 CI 양쪽에서 같이 쓴다.
#
# BIZINFO_API_KEY 가 필요하다. .env 나 환경변수로 넘긴다.

set -euo pipefail
cd "$(dirname "$0")/.."

# venv 가 있으면 쓰고, 없으면 시스템 파이썬. 어차피 외부 패키지가 없다.
PY=".venv/bin/python"
[ -x "$PY" ] || PY="python3"

if [ "${1:-}" = "--check" ]; then
    exec "$PY" policy_data/validate.py
fi

echo "── 1/4  기업마당에서 공고 받기"
"$PY" policy_data/collect.py --raw

echo
echo "── 2/5  첨부 공고문 텍스트 뽑기"
# pdftotext 가 없으면 첨부를 하나도 못 읽는다. 그래도 파이프라인은 "성공"으로
# 끝나고, extract.py 가 서류를 기본값 2개로 채운 결과가 그대로 남는다.
# 실제로 GitHub Actions 에서 그렇게 데이터가 깎인 적이 있다(2026-08-17).
if ! command -v pdftotext >/dev/null 2>&1; then
    echo "  ★ pdftotext 가 없습니다. 첨부 PDF 를 못 읽어 데이터가 깎입니다."
    echo "     설치:  sudo apt-get install -y poppler-utils"
    exit 1
fi
"$PY" policy_data/fetch_docs.py || echo "  (일부 첨부 실패 — 나머지로 진행)"

echo
echo "── 3/5  자격요건·서류 추출"
"$PY" policy_data/extract.py

echo
echo "── 4/5  매칭 엔진에 넣어서 검사"
"$PY" policy_data/validate.py

echo
echo "── 5/5  데이터가 줄지 않았는지 확인"
"$PY" policy_data/guard.py

echo
echo "완료. 바뀐 내용을 확인하고 커밋하세요."
echo "    git diff --stat policy_data/notices"
echo "    python3 policy_data/guard.py --save   # 공고가 늘었으면 기준도 갱신"
echo "    git add policy_data/notices policy_data/baseline.json && git commit -m '공고 갱신'"
