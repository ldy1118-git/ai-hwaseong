/**
 * 시연용 프로필.
 *
 * 카메라 앞에서 온보딩 질문 10개를 채우면 20~30초가 그냥 날아간다.
 * 미리 채운 프로필로 바로 넘어가라고 둔다.
 *
 * 값은 발표 8장 시연 표의 두 프로필과 같게 맞춰뒀다. 슬라이드에 적힌
 * 숫자와 화면에 뜨는 숫자가 어긋나면 그 자리에서 티가 난다.
 *
 * 대회가 끝나면 이 파일과 온보딩의 DemoSkip 을 같이 지운다.
 */

export const DEMO_PROFILES = [
  {
    key: 'owner',
    label: '시연용 · 운영중 사장님',
    hint: '화성시 · 음식점 · 24개월',
    profile: {
      path: 'C', age: 45, region: '화성시',
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
      // 다음 일정이 10/26(부가세 예정고지)로 당겨진다. 24개월 운영
      // 음식점으로 전혀 어색하지 않은 조합이다.
      //
      // 매칭 숫자는 그대로다 — vat_type 과 has_employee 는 세무일정에만
      // 쓰이고 공고 자격조건에는 들어가지 않는다. 두 조합 모두 신청가능
      // 30건으로 같은 것을 확인했다. 발표 8장의 숫자를 안 건드린다.
      vat_type: '일반과세', has_employee: true,
    },
  },
  {
    key: 'starter',
    label: '시연용 · 예비창업자',
    hint: '화성시 · 카페 · 30세',
    profile: {
      path: 'B', age: 30, region: '화성시',
      business_status: '예비창업자', category: '카페',
      career_experience: '없음', asset_group: '일반',
      business_period_months: 0, marital_status: '미혼',
      living_with_parents: false, entity_type: '개인',
      vat_type: '간이과세', has_employee: false,
    },
  },
]
