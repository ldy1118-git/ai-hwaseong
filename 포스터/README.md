# 발표 포스터

2026 AI화성 챌린지 최우수상 발표용. **900 × 1200 mm 세로.**

    Mars-Fit_포스터.pdf             보낼 것
    Mars-Fit_포스터.pptx            제출물. 파워포인트에서 바로 고치면 된다
    Mars-Fit_포스터_미리보기.png     지금 모양
    poster.py                       pptx·HTML 을 만들어내는 코드
    topdf.mjs                       print.html 을 PDF 로 찍는다
    화면/                            포스터에 들어간 화면 사진

## 손으로 고칠 때

`Mars-Fit_포스터.pptx` 를 열어서 고치면 된다. 글자 몇 개 바꾸는 정도는
그게 빠르다. **다만 `poster.py` 를 다시 돌리면 덮어쓴다.**

## 코드로 다시 만들 때

    pip install python-pptx qrcode pillow
    python3 poster.py

같은 자리에 `Mars-Fit_포스터.pptx` 와 `preview.html` 이 나온다. 끝에
섹션별 높이와 「이상 없음/문제 있음」 판정이 찍힌다.

**미리보기를 꼭 볼 것.** pptx 렌더러가 없어서 글이 상자를 넘치는지 눈으로
확인할 길이 그것뿐이다. `preview.html` 은 같은 좌표를 HTML 로 다시 그린
것이라 브라우저로 열면 된다. 빨간 점선은 글상자 경계다.

## PDF

    node topdf.mjs print.html Mars-Fit_포스터.pdf

`poster.py` 가 `print.html`(눈금 없는 인쇄용)도 같이 내보낸다. 크로미움이
그걸 900x1200mm 한 장으로 찍는다. 글자는 벡터로 들어가서 300 DPI 로 키워도
안 깨진다.

**단위를 조심할 것.** 좌표는 전부 mm 로 계산해 두었는데, 미리보기는 1px = 1mm
로 그린다. 인쇄용을 그대로 px 로 내보내면 900px 이 238mm 밖에 안 돼서 내용이
왼쪽 위 27% 에만 몰린다. 그래서 `emit_html(unit='mm')` 로 따로 뽑는다.

**글꼴이 다르다.** 이 PDF 는 `Noto Sans CJK KR` 로 찍힌다. 서버에 나눔스퀘어도
맑은 고딕도 없기 때문이다. **양식 글꼴 그대로 된 PDF 가 필요하면 pptx 를
파워포인트에서 열어 「다른 이름으로 저장 → PDF」 로 내보낼 것.**

## 크기·글자는 연구실 양식을 따랐다

예시 포스터 10개를 900×1200 으로 환산해 재보니 본문이 22~28pt(중앙값 24)
였다. 처음에 19~21pt 로 잡았다가 20% 작아서 `SCALE = 1.22` 로 키웠다.
색은 양식의 네이비 `#003670` 그대로다 — Mars-Fit 브랜드 네이비(`#2a3c77`)와
거의 같아서 화면 사진과 잘 붙는다.

## 숫자에는 기준일이 붙어 있다

공고 74건, 조건 309개 판정, 서류 195개·52종, 상가 30,297 …… 전부
`/api/match` 와 `pjrx.kr/health` 에서 받은 실측값이다.

**「오늘」이라고 쓰지 않는다.** 인쇄한 뒤에는 그 「오늘」이 언제인지 알 수
없다. 기준일은 `poster.py` 맨 위 `ASOF` 한 곳에 있고 포스터 네 군데에 찍힌다.

공고는 매일 06:11 에 새로 받으므로 건수가 바뀐다. **인쇄 직전에 다시 재고
`ASOF` 를 그날로 고칠 것.**

    curl -s https://ai-hwaseong-ten.vercel.app/api/health     # 공고 수
    curl -s https://pjrx.kr/health                            # 상가·학교·역·아파트

    # 판정 분포와 서류 수 (운영중 음식점 프로필 기준)
    curl -s -X POST https://ai-hwaseong-ten.vercel.app/api/match \
      -H 'Content-Type: application/json' \
      -d '{"user_profile":{"age":45,"region":"화성시","business_status":"운영중",
           "category":"음식점","career_experience":"있음","asset_group":"일반",
           "business_period_months":24,"marital_status":"기혼",
           "living_with_parents":false,"entity_type":"개인",
           "vat_type":"일반과세","has_employee":true}}'

## 화면 사진

배포본(`ai-hwaseong-ten.vercel.app`)에서 시연용 프로필로 찍었다. 폰
390×844, 3배 해상도. **진짜 사장님 화면이나 사업자등록증을 여기 두지 말 것** —
`.gitignore` 의 png 예외가 이 폴더까지 통과시킨다.
