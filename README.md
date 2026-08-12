# 화성시 소상공인 지원사업 매칭 서비스

2026 화성시 AI 해커톤 출품작. 창업 준비자와 소상공인이 자기 조건에 맞는
지원사업을 찾고, **신청 완료까지** 안내받는 서비스.

차별점은 정보 나열이 아니라 신청 동행이다. 행정 용어를 쉽게 풀어주고,
필요 서류를 어디서 어떻게 발급받는지까지 알려준다.

---

## 폴더 구조

```
AI_hwasung_limdaeyun/
├── matching/            매칭 엔진 + 웹 서버 (담당: 성현)
│   ├── matching.py        조건 판정·점수화·HTTP 서버
│   ├── OCR.py             사업자등록증 OCR 및 필드 추출
│   ├── index.html         채팅형 프론트엔드
│   └── notices/           공고 JSON 19건
├── llm/                 LLM / RAG (담당: 서희)
├── policy_data/         공고 수집·요건 추출·용어 사전 (담당: 대윤)
├── scripts/
│   ├── run_server.sh      리눅스 서버 실행
│   └── test.bat           윈도우 실행
├── docs/
│   ├── meetings/          회의록 + 원본 녹취
│   └── 화성시_소상공인_서비스_기획안.docx
└── .venv/               가상환경 (git 제외)
```

개인정보(사업자등록증 이미지, 사용자 프로필)는 저장소에 두지 않는다.
실제 파일은 `../_private_hwaseong/users/` 에 있고 `.gitignore`로도 막아뒀다.
서버는 `matching/users/` 를 필요할 때 자동으로 다시 만든다.

---

## 실행

### 리눅스 (연구실 서버)

```bash
./scripts/run_server.sh          # http://127.0.0.1:8000/index.html
./scripts/run_server.sh 8123     # 포트 지정
```

`OMP_NUM_THREADS=4` 가 스크립트에 박혀 있다. **반드시 필요하다.**
이 서버는 코어가 80개라 제한하지 않으면 torch/OpenMP 스레드가 폭주해
easyocr 호출이 CPU 0%인 채로 멈춘다(SIGTERM도 안 먹는다).

### 윈도우

```
scripts\test.bat
```

easyocr가 없으면 자동으로 설치한 뒤 서버를 띄우고 브라우저를 연다.

### 최초 환경 구축

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision
.venv/bin/python -m pip install easyocr
```

OCR은 CPU로만 돌리므로(`gpu=False`) CPU 빌드 torch면 충분하다.
첫 실행 때 한국어 모델(약 95MB)이 `~/.EasyOCR/` 로 자동 다운로드된다.

---

## API

서버는 표준 라이브러리 `http.server` 기반이며 외부 의존성이 없다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/health` | 헬스체크 |
| POST | `/api/match` | 프로필로 공고 매칭, 점수순 정렬 |
| POST | `/api/user/load` | 기기별 프로필·채팅기록 조회 |
| POST | `/api/user/save` | 프로필·채팅기록 저장 |
| POST | `/api/business-registration` | 사업자등록증 업로드 → OCR → 프로필 자동 반영 |

CLI로도 쓸 수 있다.

```bash
cd matching
python3 matching.py                 # 샘플 프로필로 추천 출력
python3 matching.py --interactive   # 조건 직접 입력
python3 matching.py --json          # 전체 결과 JSON
python3 OCR.py <이미지경로>          # OCR 단독 테스트
```

---

## 모듈 간 인터페이스

모듈은 **JSON 파일**로 주고받는다. 매칭 엔진의 출력이 LLM의 입력이 되므로,
출력 양식은 LLM 담당이 정의해서 매칭 담당에게 전달한다.

```
사용자 입력 ─┐
             ├─→ matching (점수화, 상위 3건) ─→ JSON ─→ llm (RAG) ─→ 화면
사업자등록증 ─┘                                  ↑
                                          policy_data (공고·요건·용어)
```

---

## 성능 참고

| 항목 | 소요 |
|---|---|
| 첫 OCR 요청 | 약 78초 (easyocr Reader 초기화 + 모델 로딩, 서버 프로세스당 1회) |
| 이후 OCR 요청 | 약 17초 (전역 Reader 캐시) |
| 공고 19건 매칭 | 1초 미만 |

---

## 알려진 이슈

- 업태 OCR에서 `종목`이 `종콩]`으로 오인식된다. 매칭에는 영향 없지만
  화면에 그대로 노출되므로 후처리가 필요하다.
- PDF 업로드는 미지원. 이미지 파일만 받는다.
- easyocr 미설치 시 크래시 없이 `ocr_status: not_configured` 를 반환한다.

---

## 일정

| 날짜 | 내용 |
|---|---|
| 8/15 (토) | 각자 담당 모듈 완료 |
| 8/16 (일) | 다음 전체 회의 |
| 8/18 (화) | 전체 통합 및 최종 마무리 |
| 8/19 (수) | 발표자료 제작 + 발표 연습 |
| 8/20 (목) | 1차 예선 발표 |

제출물: 시연 영상 / 웹 주소 / Git 주소

자세한 배경과 결정 사항은 `docs/meetings/20260809_회의록.txt` 참고.
