# Mars-Fit — 작업 메모

화성시 소상공인이 자기 조건에 맞는 지원사업을 찾고 **신청 완료까지**
안내받는 서비스. 2026 AI화성 챌린지 출품작.

배포: https://ai-hwaseong-ten.vercel.app

폴더 구조·API 명세·실행 방법은 `README.md` 에 있다. 여기 옮겨 적지 말 것.
두 군데 적으면 한쪽만 낡는다.

---

## 반드시 지킬 것

**이 저장소는 public 이다.** 주소만 알면 누구나 코드를 본다.

- **키를 커밋하지 않는다.** `.env` 는 gitignore 되어 있다. 실제 키는
  Vercel 환경변수와 GitHub Secrets 에만 넣는다. 프론트에서 `VITE_` 로
  시작하는 변수에 키를 넣으면 빌드 결과물에 평문으로 박힌다.
- **개인정보를 커밋하지 않는다.** `backend/users/` (기기별 온보딩 답변),
  사업자등록증 이미지. 둘 다 gitignore 되어 있다.
- **self-hosted GitHub 러너를 붙이지 않는다.** public 저장소라 아무나
  fork 해서 PR 하나로 그 서버에서 코드를 돌릴 수 있다.

## git

브랜치를 따로 파지 않는다. `main` 에 바로 푸시한다. 셋뿐이고 파일 담당이
갈려 있어서, 브랜치는 충돌을 없애주는 게 아니라 뒤로 미룰 뿐이다.

    git pull --rebase             # 작업 시작 전
    cd project && npm run build   # 푸시 전. 여기서 걸리면 남의 배포가 안 깨진다
    git push

예외 — 여러 파일에 걸치고 하루 넘게 걸리는 작업은 브랜치를 판다.

푸시하면 GitHub Actions 가 빌드를 검사한다(`.github/workflows/build-check.yml`).
빨간불이면 그 커밋은 화면을 못 띄운다는 뜻이다. `project/` 가 바뀐 커밋에만 돈다.

## 공고 자동 갱신

기업마당 API 가 GitHub 러너의 IP 에 응답하지 않는다. 그래서 수집은
**연구실 서버의 cron** 이 맡는다. 매일 06:11(KST).

    scripts/cron_update_notices.sh     실제 로직 (전용 클론 mars-fit-cron 에서 돈다)
    ~/bin/mars-notices.sh              cron 이 부르는 런처. 손으로 돌릴 때도 이것
    mars-fit-cron-logs/last-run.txt    마지막 결과 한 줄

`.github/workflows/update-notices.yml` 은 일정을 껐다. 손으로 돌릴 때만 쓴다.

**서버가 꺼져 있으면 갱신이 조용히 멈춘다.** `last-run.txt` 날짜를 가끔 볼 것.

## 두 벌로 존재하는 로직

세무일정 계산이 JS 와 파이썬 양쪽에 있다. **한쪽만 고치면 화면과 서버가
다른 날짜를 말한다.**

    project/src/utils/taxSchedule.js  ←→  policy_data/tax_schedule.py

파이썬 쪽이 원본이고 날짜 검증도 거기서 했다. 공휴일 목록(`HOLIDAYS`)은
음력이라 자동 계산이 안 된다. **연말에 다음 해를 손으로 채울 것.** 현재
2026·2027 등록됨.

## 담당

| 사람 | 영역 |
|---|---|
| 전서희 | LLM 전부 — 챗봇, 체크리스트, 공고 요약, 온보딩 LLM, 서류준비 창 |
| 전성현 | 상권분석, 관심공고, 달력 |
| 임대윤 | 세무일정, OCR, 알림, 데이터 수집, 배포 |

겹치는 파일은 `project/CLAUDE.md` 에 적어뒀다.

순서가 걸린 것 하나 — 관심공고 저장(성현)이 있어야 알림(대윤)이 뭘 알릴지
정해진다.

## 숫자를 지어내지 않는다

화면에 출처 없는 숫자를 두지 않는 것이 이 서비스의 원칙이다. 매출·재방문율
같은 걸 그렸다가 전부 지웠다 — POS 도 카드매출도 연동한 적이 없었기
때문이다. 하단에 「목업」이라고 적어도, 그 줄을 읽은 사람은 다른 숫자까지
의심한다.

지금 목업인 것은 **아파트 단지 수와 유동인구** 둘뿐이고
(`project/src/components/sections/CommercialAnalysisView.jsx`), 화면에 그렇게
적혀 있다.

## 대회가 끝나면 지울 것

- `project/src/utils/demoMode.js` 와 온보딩의 `DemoSkip` — 시연용 프로필
