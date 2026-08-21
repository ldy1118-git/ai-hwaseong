# 프론트엔드 작업 메모

React 18 + Vite 6 + Tailwind. Vercel 이 이 폴더를 빌드해서 배포한다.

저장소 전체 규칙은 루트 `CLAUDE.md` 에 있다. 여기는 화면 쪽만 적는다.

---

## 실행

    npm install
    npm run dev       # http://localhost:3001
    npm run build     # 푸시 전에 반드시 한 번

빌드가 깨진 채로 푸시하면 Vercel 이 그대로 실서비스에 올린다. 사람이
거치는 단계가 없다. 실제로 변수 하나 지우다 말아서 홈 화면이 통째로 빈
적이 있다(`e64fd5b`).

## 라우터는 HashRouter 다

    // main.jsx
    import { HashRouter as BrowserRouter } from 'react-router-dom'

이름만 `BrowserRouter` 로 받아 쓴다. **실제 동작은 해시(`/#/home`) 라우팅
이다.** 진짜 BrowserRouter 로 바꾸면 새로고침·직접 접근에서 404 가 난다.
`vite.config.js` 의 `base: './'` 도 같이 물려 있다.

## LLM 은 서버를 거친다

`utils/llm/llmProvider.js` 의 `generateText()` 만 쓴다. 여기서 우리
서버(`POST /api/llm`)를 부르고, 키는 Vercel 환경변수에만 있다.

**SDK 를 프론트에서 직접 부르지 말 것.** 그러려면 키가 브라우저에 있어야
하는데, `VITE_` 환경변수는 빌드 결과물에 평문으로 박힌다. 실제로 테스트
키를 넣고 빌드했더니 번들 JS 에 세 번 나왔다.

공급자는 서버가 고른다 (groq → xai → gemini). 하나 실패하면 다음으로 넘어간다.

## 색은 토큰으로

`tailwind.config.js` 에 정의된 것만 쓴다. 임의 hex 를 박지 말 것.

    navy #2a3c77   sunset-orange #cb6b3d   warm-text #7a6a58
    primary-bg     warm-gray

## 파일 담당 — 겹치는 곳

| 파일 | 담당 |
|---|---|
| `pages/District.jsx` | 대윤 — 세무일정 (사업자에게만 보이는 「내 매장 현황」) |
| `components/sections/CommercialAnalysisView.jsx` | 성현 — 상권분석 (사업자가 아닌 사람) |
| `components/ui/DocumentStepDrawer.jsx` | 서희 — 서류 상세 창 |
| `pages/Onboarding.jsx` · `pages/NoticeDetail.jsx` · `pages/MissionControl.jsx` | 서희 |
| `components/ui/DeadlineCalendar.jsx` · `pages/Schedule.jsx` | 성현 |
| `pages/ApplicationGuide.jsx` | **서희·성현 둘 다.** 의존관계는 없고 그냥 같은 파일이다 |
| `pages/Home.jsx` · `components/sections/OrbitDashboard.jsx` | 성현 관심공고 먼저 → 메인 UI 개선 나중 |

`District.jsx` 는 원래 1,005 줄에 세무와 상권이 같이 있었다. 두 사람이 같은
파일을 동시에 고치게 돼서 갈랐다(`ae28205`). 다시 합치지 말 것.

`DeadlineCalendar` 는 `Schedule.jsx` 와 `Home.jsx` 두 곳에서 불린다. props
를 바꿀 때 기본값을 채워두면 옛 호출부가 그냥 돌아서 서로 기다릴 일이 없다.

## 세무일정을 고칠 때

`utils/taxSchedule.js` 는 `policy_data/tax_schedule.py` 와 같은 로직이다.
**한쪽만 고치면 화면과 서버가 다른 날짜를 말한다.** 양쪽 다 고칠 것.

## 알려진 것

- 용어 뜻풀이 툴팁이 `onMouseEnter`/`onMouseLeave` 라 **휴대폰에서 안 열린다**
  (`NoticeDetail.jsx`, `OrbitDashboard.jsx` 의 `group-hover`)
- 아파트 단지 수와 유동인구는 목업이다. 화면에 그렇게 적어뒀다
- `utils/demoMode.js` 와 온보딩의 `DemoSkip` 은 대회가 끝나면 지운다
