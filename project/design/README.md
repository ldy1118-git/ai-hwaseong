# UI 에셋

`src/` 가 import 하는 이미지다. **없으면 빌드가 실패한다.**
`import marsImg from '../../design/mars.png'` 처럼 코드에서 직접 참조하므로
파일 이름을 바꾸면 안 된다.

| 파일 | 쓰이는 곳 |
|---|---|
| `logo.png` | Header · Landing · Auth · Onboarding |
| `mars.png` | MarsGreeting · MarsAvatar · FloatingChatButton · Landing 히어로 |
| `search.png` | ApplicationGuide 로딩 화면 |
| `find.png` | **아직 import 하는 곳이 없다** |
| `cheer.png` | DocumentStepDrawer — 응원하는 마이다 |

서희 원본으로 교체 완료 (2026-08-16). 빌드 3.64초 통과.

교체할 때는 같은 이름으로 덮어쓰면 된다. 코드는 손댈 필요 없다.

```bash
git pull                       # .gitignore 예외를 먼저 받아야 한다
cp <원본> project/design/mars.png
git add project/design/*.png && git commit && git push
```

`git pull` 을 건너뛰면 `*.png` 규칙에 걸려 `git add` 가 조용히 무시된다.

## 용량

번들에 그대로 들어간다. 지금 셋을 합쳐 468KB 로, JS(315KB)보다 크다.
느리다는 말이 나오면 여기부터 줄이면 된다 — 화면에서 쓰는 최대 크기가
`mars.png` 210px 인데 원본이 330px 이라 절반으로 줄여도 티가 안 난다.

---

## .gitignore 주의

루트와 `project/` 양쪽에 `*.png` 규칙이 있다. 사업자등록증 이미지 같은
개인정보가 저장소에 올라가는 걸 막으려고 넣은 것이다.

이 폴더와 `public/` 만 예외로 열어놨다. **다른 곳에 이미지를 두면 커밋이
안 된다.** 그리고 그 규칙은 그대로 두는 게 맞다 — `backend/users/` 아래에
실제 사업자등록증 업로드본이 쌓이고 있고, 그건 절대 올라가면 안 된다.
