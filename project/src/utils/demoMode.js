/**
 * 시연용 프로필.
 *
 * 카메라 앞에서 온보딩 문답을 채우면 20~30초가 그냥 날아간다. 미리 채운
 * 프로필로 바로 넘어가라고 둔다. `docs/발표/시연_순서.md` 의 「10분 전 —
 * 창 두 개를 만든다」가 이 버튼을 쓴다. **label·hint 를 바꾸면 그 문서도
 * 같이 고칠 것** — 촬영표가 이 글자를 그대로 적어놨다.
 *
 * 값은 발표 시연 표의 두 프로필과 같게 맞춰뒀다. 슬라이드에 적힌 것과
 * 화면에 뜨는 것이 어긋나면 그 자리에서 티가 난다.
 *
 * 대회가 끝나면 이 파일과 온보딩의 DemoSkip 을 같이 지운다.
 *
 * ── 프로필에 `path` 를 넣지 않는다 ──────────────────────────────
 *
 * 전에는 `path: 'C'` 처럼 프로필 안에 경로를 넣었다. 두 가지가 틀렸다.
 *
 *   1. **실제 온보딩은 프로필에 path 를 안 넣는다.** `finish()` 가 저장하는
 *      것은 `data` 뿐이고, 경로는 `saveJourney({ onboardingPath })` 로
 *      따로 간다. 넣어두면 시연 프로필만 남들과 모양이 다르다.
 *   2. **서버가 조용히 버린다.** `api/onboarding.py` 의 PROFILE_KEYS 에
 *      없는 키다. 기기에는 있고 서버에는 없는 값이 생기는데, 새벽 카톡은
 *      서버 프로필로 매칭하므로 화면과 카톡이 다른 말을 하게 된다.
 *
 * 그래서 경로는 `journey` 로 옮겼다. 아래 DemoSkip 이 이것도 같이 저장해서
 * 창업 항해 위젯이 실제로 온보딩을 거친 것과 같은 단계를 가리킨다.
 *
 * ── 경로 B 는 없어졌다 ─────────────────────────────────────────
 *
 * Q1 이 다섯 갈래에서 셋으로 합쳐지면서(`4ca0440`) 「하고 싶은 게 있어요」(B)가
 * 사라졌다. 지금 남은 것은 A(탐색 중) · C(창업 준비) · D(등록만) · E(운영중)
 * 넷이다. 예비창업자는 C 로 들어온다.
 */

export const DEMO_PROFILES = [
  {
    key: 'owner',
    label: '시연용 · 운영중 사장님',
    hint: '화성시 · 음식점 · 24개월',
    profile: {
      age: 45, region: '화성시',
      business_status: '운영중', category: '음식점',
      career_experience: '있음', asset_group: '일반',
      business_period_months: 24, marital_status: '기혼',
      living_with_parents: false, entity_type: '개인',
      // 간이과세 · 직원 없음이었다. 계산은 맞았지만 이 조합은 세무일정에
      // 「반드시 해야 하는 것」이 두 건뿐이고 둘 다 이미 지나서, 8월에
      // 「내 매장」을 열면 다음 일정이 2027년 1월로 나왔다. 5개월 뒤
      // 날짜에 「2027년 공휴일 미등록」 경고까지 붙어 화면이 비어 보였다.
      //
      // 일반과세 · 직원 있음으로 바꾸면 필수 5건 · 해당시 4건이 차고
      // 다음 일정이 부가세 예정고지로 당겨진다. 24개월 운영 음식점으로
      // 전혀 어색하지 않은 조합이다.
      //
      // 매칭 숫자는 그대로다 — vat_type 과 has_employee 는 세무일정에만
      // 쓰이고 공고 자격조건에는 들어가지 않는다.
      vat_type: '일반과세', has_employee: true,
      // 직원이 있으면 실제 온보딩이 반드시 묻는 값이다(원천세 주기).
      // 비워두면 결과는 매월과 같지만, 시연 프로필만 실제로 채워지는 칸이
      // 하나 빈 채로 남는다. false = 매월 10일.
      withholding_half: false,
    },
    journey: {
      onboardingPath: 'E',
      // 운영중이면 inferCurrentStep 이 체크리스트를 안 보고 STEP 7 을 준다.
      prepChecklist: {},
    },
  },
  {
    key: 'starter',
    label: '시연용 · 예비창업자',
    hint: '화성시 · 카페 · 30세',
    profile: {
      age: 30, region: '화성시',
      business_status: '예비창업자', category: '카페',
      career_experience: '없음', asset_group: '일반',
      business_period_months: 0, marital_status: '미혼',
      living_with_parents: false, entity_type: '개인',
      vat_type: '간이과세', has_employee: false,
    },
    journey: {
      // 「창업을 준비하고 있어요」로 들어와 업종까지 고른 사람.
      onboardingPath: 'C',
      // 업종을 정했으니 창업 항해가 STEP 2 를 가리킨다. 아무것도 안 넣으면
      // STEP 1 이라, 카페로 정해진 프로필과 화면이 어긋난다.
      prepChecklist: { hasCategory: true },
    },
  },
]
