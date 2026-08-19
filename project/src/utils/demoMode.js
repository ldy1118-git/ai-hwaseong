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
      vat_type: '간이과세', has_employee: false,
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
