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
| `components/ui/DeadlineCalendar.jsx` · `pages/Schedule.jsx` | 대윤 — 달력 전부 |
| `pages/ApplicationGuide.jsx` | **서희·성현 둘 다.** 의존관계는 없고 그냥 같은 파일이다 |
| `pages/Home.jsx` · `components/sections/OrbitDashboard.jsx` | 성현 — 메인 UI 개선 |
| `utils/favorites.js` · `utils/notifications.js` · `utils/openNotice.js` | 대윤 — 관심공고·알림 |
| `ui/FavoriteButton.jsx` · `ui/NotificationBell.jsx` · `sections/FavoriteNotices.jsx` | 대윤 |

`District.jsx` 는 원래 1,005 줄에 세무와 상권이 같이 있었다. 두 사람이 같은
파일을 동시에 고치게 돼서 갈랐다(`ae28205`). 다시 합치지 말 것.

`DeadlineCalendar` 는 `Schedule.jsx` 와 `Home.jsx` 두 곳에서 불린다. props
를 바꿀 때 기본값을 채워두면 옛 호출부가 그냥 돌아서 서로 기다릴 일이 없다.

## 관심공고를 화면에 붙일 때

★ 버튼과 알림 종은 **한 줄로 붙게** 만들어놨다. 로직을 복사하지 말 것.

    <FavoriteButton notice={m} />     // API 원본이든 Home 카드든 둘 다 받는다
    <NotificationBell />              // 알림이 없으면 스스로 안 그린다
    <FavoriteNotices />               // 담긴 게 없으면 스스로 안 그린다

목록만 필요하면 `listFavorites()`. 달력에서 「관심공고만 표시」를 할 때
이걸 쓰면 된다.

서류 준비 진행 상태는 `utils/checklistProgress.js` 다. **공고마다 따로**
남는다 — 예전에는 한 건만 저장돼서 두 번째 공고를 열면 첫 번째에서 체크한
것이 말없이 사라졌다. 열쇠 이름(`mars-fit-checklist-progress`)은 그대로 두고
첫 읽기에서 옛 모양을 새 모양으로 옮긴다.

종에 뜨는 알림은 세 가지다.

    담아둔 공고 마감 D-7·D-3·D-1     관심공고에서 그때그때 계산
    새로 뜬 고득점 공고               syncNoticeAlerts() 가 잡아둔 것
    세무 신고기한 D-7·D-3·D-1        taxCalendar 에서 그때그때 계산

무엇을 받을지는 `utils/notifySettings.js` 에 있다. **이 설정을 브라우저와
연구실 서버가 같이 읽는다** — 종은 브라우저가 계산하고 카톡은 새벽에
서버가 보낸다. 한쪽만 보면 화면에는 껐는데 카톡은 계속 온다.

    project/src/utils/notifySettings.js  ←→  scripts/notify_kakao.py

두 번째는 `Home` 이 매칭 결과를 받을 때 `syncNoticeAlerts(results)` 를
부르면서 잡힌다. 지난번에 본 공고 번호(`mars-fit-seen-notices`)와 견준다.
**첫 방문에는 하나도 안 띄운다** — 적어둔 게 없으면 58건이 전부 「새로 뜬
공고」가 된다.

문턱은 `신청가능` + 70점이다. 점수는 조건별 가중평균(0~100)이고 실제
분포에서 최고가 81, 다수가 73이다. `확인필요` 는 우리도 되는지 모른다는
뜻이라 알릴 게 못 된다.

공고 상세로 갈 때는 `openNoticeById(id, navigate)` 를 쓴다. 관심공고에는
공고 원본을 안 담았다 — 원본에는 「신청가능/대상아님」 판정이 들어 있는데
담을 때의 프로필 기준이라 며칠 지나면 틀린 말이 된다. 그래서 열 때 매칭을
다시 돌린다. 마감돼서 사라진 공고면 false 를 돌려준다.

일정 탭의 달력은 층 세 개를 껐다 켤 수 있다 — 전체 공고 · 관심공고 ·
세무일정. 껐던 것은 `mars-fit-schedule-layers` 에 남는다. **층을 하나
더 만들면 `LAYERS_DEFAULT` 에도 넣을 것** — 저장된 값에 그 열쇠가 없으면
예전에 저장한 사람 화면에서 그 층만 조용히 꺼져 있다. 여기에 사장님이 직접 적는 메모(`utils/calendarNotes.js`)가 겹친다.
메모는 층으로 안 뺐다 — 자기가 적은 것이라 몇 개 없고, 껐다 켤 이유가 없다.

오른쪽 단의 「세무 신고기한」과 「상시 접수」는 제목을 눌러 접는다.
접힌 상태는 `mars-fit-schedule-sections` 에 남는다 — 층 토글과 같이
**그 기기에만** 둔다. 이 화면을 어떻게 보고 싶은지는 그 기기에서의
습관이지 사장님의 자료가 아니다.

접는 이유는 셋을 다 켜면 오른쪽이 화면 한 장을 넘어서다. 넓은 화면에서는
두 묶음이 각각 62vh 까지 차고, 좁은 화면에서는 상한이 아예 없다. 아래
있는 상시 접수를 보려면 세무 목록을 통째로 지나가야 했다 — 그런데 상시
접수가 30건이다.

**접어도 제목과 건수는 남긴다.** 접은 목적이 「안 볼 것을 치우는 것」이지
「없는 셈 치는 것」이 아니다. 남은 신고가 세 건인지 없는지는 접어둔 채로도
알아야 한다.

달력 칸을 누르면 그 날의 세무일정·공고·메모가 **오른쪽 단 맨 위**에
뜬다(`ui/DayPanel.jsx`). 같은 칸을 한 번 더 누르면 사라진다 — 닫기 버튼이
없는 이유다.

여기까지 오는 데 두 번 갈아엎었다. 달력 아래에 폈더니 날짜를 누를 때마다
달력이 위아래로 움직였고, 창으로 띄웠더니 다른 날을 보려면 매번 닫아야
했다. 오른쪽은 달력이 그대로 있고 그 자리 내용만 바뀐다.

`DeadlineCalendar` 는 `onSelectDay` 를 받으면 스스로 안 그리고 밖에
알리기만 한다. 안 받으면(홈) 예전처럼 창을 띄운다.
`DeadlineCalendar` 의 `focus={{ date, seq }}` prop 이다. **seq 가 있어야
같은 날짜를 다시 눌러도 반응한다** — 날짜만 넘기면 값이 안 바뀌어서
useEffect 가 안 돈다.

**달력 칸의 열쇠와 메모 저장 열쇠는 형식이 다르다.** 칸은 `'YYYY-M-D'` 로
월이 0부터고, 저장은 `'YYYY-MM-DD'` 다. `noteKey(year, month0, day)` 로만
만들 것 — 칸 열쇠를 그대로 저장하면 1월 메모가 다른 달에 붙는다. `DeadlineCalendar` 의 `taxEvents` prop 은 기본값이 빈 배열이라
홈에서 부르는 옛 호출부는 그대로 돈다.

세무일정을 달력 모양으로 펴는 것은 `utils/taxCalendar.js` 다.
`utils/taxSchedule.js` 는 `policy_data/tax_schedule.py` 와 두 벌이라
화면용 코드를 거기 넣지 말 것.

`applies()` 는 **프로필에 값이 없으면 통과**시킨다. 사업자 형태나 과세유형을
「잘 모르겠어요」로 넘긴 사장님에게는 법인세와 종합소득세가 같이 뜬다.
둘은 양립할 수 없다. 목록을 임의로 줄이지 않고 `ui/TaxProfileHint.jsx` 로
왜 많은지 설명하고 고칠 길을 준다 — 모르는 것을 안다고 치고 지우면 진짜
해야 할 신고가 사라진다.

`taxCalendar.js` 는 **운영중인 사업자에게만** 일정을 준다. `applies()` 가
「프로필에 값이 없으면 통과」라서 안 막으면 예비창업자에게 열 건이 뜨고,
일반과세 부가세와 간이과세 부가세가 같은 날 나란히 나온다.

**마감일이 없는 공고가 절반이다.** 58건 중 30건은 `apply_period` 에 `end` 가
없고 `note` 문자열만 있다(「세부사업별 상이」). 거기서 날짜를 뽑아내지 말 것.
알림은 안 띄우고 목록에는 「마감일 미정」으로 적는다.

## 화면을 떠났다 돌아올 때

보던 스크롤 자리를 되돌려준다(`utils/scrollMemory.js`). **목록 화면만**
기억한다 — 공고 상세는 주소가 `/notice` 하나뿐이라, 기억해두면 다른 공고를
열었을 때 앞 공고의 자리로 내려간다.

**넓은 화면에서는 목록이 안쪽에서 굴러간다.** 공고 목록이 카드 네 장
높이로 잘려 있어서(`OrbitDashboard` 의 `capStyle`) 창은 안 움직인다. 창
스크롤만 기억하면 넓은 화면에서 아무 소용이 없어서, 안쪽 컨테이너용으로
`useRememberedScroll(key, ref)` 가 따로 있다. 열쇠를 직접 주는 이유는 한
화면에 목록이 둘(긴급 마감·지원사업 탐색) 있고 따로 굴러가기 때문이다.

스크롤을 계속 적어둔다. 떠날 때 한 번 읽으면 늦다 — 그때는 새 화면이 이미
그려져서 브라우저가 스크롤을 당겨놓은 뒤다.

되돌릴 때는 문서가 길어질 때까지 몇 프레임 기다린다. 공고 목록은 API 를
받은 뒤에 그려져서, 화면이 뜬 순간엔 그 자리까지 내려갈 수가 없다.

## 세무일정을 고칠 때

`utils/taxSchedule.js` 는 `policy_data/tax_schedule.py` 와 같은 로직이다.
**한쪽만 고치면 화면과 서버가 다른 날짜를 말한다.** 양쪽 다 고칠 것.

데이터(`data/tax_calendar.json`)도 `policy_data/tax_calendar.json` 과 두 벌이다.
맞춰주는 스크립트가 없으니 고친 뒤 `md5sum` 으로 확인할 것.

세무 한 줄은 `ui/TaxRow.jsx` 하나다. 세 화면이 같이 쓴다 — `/district` 의
연간 목록, `/schedule` 오른쪽의 다가오는 기한, 달력에서 날짜를 눌렀을 때의
`DayPanel`. 전에는 상세가 District 안에만 있어서, 달력에서 같은 신고를 봐도
제목과 D-day 뿐이었다.

**들어오는 모양이 두 가지다.** `taxSchedule()` 은 원천세를 `dueDates` 열두
개로 주고 `recurrence: 'monthly'` 를 달아 보낸다. `taxCalendarEvents()` 는
그걸 날짜별로 편다. TaxRow 는 `dueDate` 가 있으면 언제나 그 날짜를 쓴다 —
`recurrence` 를 먼저 보면 9월 10일짜리가 「매월 10일」로 나와 D-day 와 안 맞는다.

원천세는 **dueDate 가 없다.** `e.dueDate < today` 도 `e.dueDate >= today` 도
둘 다 false 라서, 그냥 거르면 지난 목록에도 남은 목록에도 안 들어가고
화면에서 통째로 사라진다(`District.jsx` 의 `past`/`left`).

`/schedule` 오른쪽 목록은 **매월 반복을 제일 가까운 한 건으로 접는다.**
안 접으면 직원 있는 사장님 화면에 「원천세 신고·납부 (매월)」이 열여섯 줄
이어진다. 달력에는 열두 개 점이 그대로 찍힌다 — 목록은 할 일이고 달력은
지도다. 이번 달 것을 완료로 찍으면 다음 달 것으로 넘어간다.

### 신고 완료 표시

`utils/taxDone.js`. 열쇠는 「원본항목번호::기한」이라 해가 바뀌어도 안 겹친다.
**날짜가 정해진 건에만 붙인다** — 「매월 10일」 한 줄에 체크하면 어느 달을
냈다는 말인지 알 수 없다.

완료로 찍으면 인앱 종(`utils/notifications.js`)과 카톡(`scripts/notify_kakao.py`
의 `pick_tax`)에서 같이 빠진다. **열쇠 모양을 한쪽만 고치면 화면에서 지운
신고가 카톡으로 계속 온다.**

## 연매출은 온보딩에서 안 묻는다

`annual_revenue_krw` 는 「내 정보」에서만 채운다. 일부러 그렇게 했다.

공고 81건 중 매출을 조건으로 쓰는 건 **「소상공인 경영안정 바우처」 1건**
뿐이다(자격 문구까지 뒤져도 2건). 그거 하나 때문에 모두에게 매출을 묻는 건
값이 안 된다 — 온보딩이 이미 11~12화면이고, 처음 온 사람에게 「작년 매출이
얼마세요」는 사업자 형태를 묻는 것과 결이 다르다.

**매출 조건 공고가 서너 건으로 늘면 그때 온보딩으로 올릴 것.** 공고는
매일 바뀌니 가끔 다시 세어보면 된다.

저장은 원 단위인데 입력칸은 만원이다(`EDIT_CFG` 의 `scale`). 원으로 받으면
0을 여덟 개 쳐야 한다. `draft` 를 만들 때 나누고 `confirm()` 에서 곱한다 —
한쪽만 하면 8,000만원이 다음에 열었을 때 80000000만원으로 보인다.

## 온보딩 단계는 답에 따라 늘어난다

「직원을 두고 계세요?」에 「네」를 고르면 원천세 납부 주기 질문이 하나 붙는다.
`steps` 가 `data.has_employee` 를 보는 useMemo 라서 그 자리에서 배열이 길어진다.

**선택지를 누르면 `setTimeout(nextCommon, 120)` 으로 넘어간다.** 그 함수는
누른 시점의 클로저라 늘어난 배열을 모른다. `stepsRef` 로 읽는 이유다.

같은 이유로 `finish()` 는 `dataRef.current` 를 저장한다. 전에는 클로저의
`data` 를 저장해서 **마지막 질문의 답이 통째로 빠졌다** — 운영중인 사장님의
「직원 여부」와 예비창업자의 「부모님과 함께 사세요」가 그 자리였다.

편집 창(`InlineEditDrawer`)의 `draft` 는 언제나 문자열이다(`String(v)`).
참/거짓 항목의 선택지 값도 `'true'`/`'false'` 문자열로 두고 `confirm()` 에서
되돌린다. 참값을 그대로 두면 `draft === opt.value` 가 절대 안 맞아서 고른
표시가 안 붙는다.

## 업종은 다섯 가지다

    카페 · 음식점 · 소매업 · 제조업 · 기타

**늘리면 세 군데를 같이 고쳐야 한다.** 온보딩 칩 두 곳과 「내 정보」 편집,
홈의 빠른 수정, 그리고 `backend/matching.py` 의 `CATEGORY_SIGNALS` 다.

마지막 것을 빠뜨리면 조용히 이상해진다. 그 표에 없는 업종은 아래 `RE_MAKER`
가지로 떨어져서 **「제조업 대상 사업이라 제조업은 해당하지 않습니다」** 같은
말이 나온다. 값을 늘리기 전에 표부터 채울 것.

제조업은 원래 「기타」에 접혀 있었다. 온보딩 첫 화면에 「🔧 제조·공방」
버튼이 있는데 고르면 기타가 됐다. 그래서 공방 사장님과 카페 사장님이
반도체 소부장·소공인복합지원센터 같은 공고를 똑같이 「확인필요」로 봤다.
지금은 제조업에게 확인필요, 카페·소매업에게 대상아님으로 갈린다.

**전에 온보딩한 사람은 아직 「기타」다.** 공방을 하시는 분이면 내 정보에서
업종을 다시 골라야 제조업 공고가 올라온다.

## 알려진 것

- 용어 뜻풀이 툴팁이 `onMouseEnter`/`onMouseLeave` 라 **휴대폰에서 안 열린다**
  (`NoticeDetail.jsx`, `OrbitDashboard.jsx` 의 `group-hover`)
- 아파트 단지 수와 유동인구는 목업이다. 화면에 그렇게 적어뒀다
- `utils/demoMode.js` 와 온보딩의 `DemoSkip` 은 대회가 끝나면 지운다
