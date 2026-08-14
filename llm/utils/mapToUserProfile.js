/**
 * parseUserCondition() 출력 → matching.py user_profile 형식으로 변환
 *
 * matching.py가 인식하는 user_profile 필드:
 *   age, region, business_status, category, career_experience,
 *   asset_group, business_period_months, annual_revenue_krw,
 *   marital_status, living_with_parents
 *
 * 변환 불가 필드(기능1에서 수집 안 함)는 null 유지 → 매칭엔진이 "확인필요"로 처리
 */

// ── 화성시 내 지명 목록 (부분일치) ───────────────────────────────
const HWASEONG_TERMS = [
  '화성시', '화성특례시',
  '동탄', '향남', '봉담', '남양', '우정', '팔탄', '장안',
  '양감', '정남', '비봉', '마도', '송산', '서신',
  '기안', '병점', '반월', '진안',
]

// ── 업종 → category 매핑 ─────────────────────────────────────────
// matching.py 허용값: "카페" | "음식점" | "소매업" | "기타"
const CATEGORY_MAP = {
  카페: ['카페', '커피', '베이커리', '디저트', '카페테리아'],
  음식점: [
    '음식점', '식당', '반찬', '분식', '한식', '중식', '일식', '양식',
    '치킨', '피자', '버거', '국밥', '냉면', '족발', '보쌈', '쌀국수',
    '배달', '도시락', '급식', '식품가공', '식품', '음식', '요리',
  ],
  소매업: [
    '소매업', '소매', '편의점', '마트', '슈퍼', '잡화', '의류', '패션',
    '가구', '전자', '화장품', '뷰티', '문구', '서점', '약국', '꽃',
    '인테리어', '건자재', '철물', '오토바이', '자동차 용품',
  ],
}

function mapCategory(businessType, ambiguousFields) {
  if (!businessType) return null

  // ambiguous_fields에 business_type이 있으면 (예: 프리랜서) → null 유지
  // "기타"를 넘기면 categories: ["카페","음식점"] 공고에서 NOT_SATISFIED가 됨
  const isAmbiguous = ambiguousFields?.some(f => f.field === 'business_type')
  if (isAmbiguous) return null

  const text = businessType.toLowerCase()

  for (const [category, keywords] of Object.entries(CATEGORY_MAP)) {
    if (keywords.some(kw => text.includes(kw))) return category
  }

  return '기타'
}

// ── 소득·자산 구간 매핑 ──────────────────────────────────────────
// matching.py 허용값: "기초생활수급자" | "차상위" | "일반"
const ASSET_GROUP_KEYWORDS = {
  기초생활수급자: ['기초생활수급자', '기초수급', '기초생활', '수급자'],
  차상위: ['차상위'],
  일반: ['일반'],
}

function mapAssetGroup(incomeLevelOrAssetStatus) {
  if (!incomeLevelOrAssetStatus) return null
  const text = incomeLevelOrAssetStatus
  for (const [group, keywords] of Object.entries(ASSET_GROUP_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) return group
  }
  return null
}

// ── 창업 경험 정규화 ─────────────────────────────────────────────
// matching.py 허용값: "있음" | "없음"
function mapCareerExperience(raw) {
  if (!raw) return null
  if (raw === '없음' || raw.includes('없')) return '없음'
  // "3년", "있음", 숫자 포함 → "있음"
  return '있음'
}

// ── 지역 → 화성시 여부 ───────────────────────────────────────────
// matching.py 허용값: "화성시" | "타지역" (부분일치 검색)
function mapRegion(region) {
  if (!region) return null
  const normalized = region.replace(/\s/g, '')
  return HWASEONG_TERMS.some(term => normalized.includes(term.replace(/\s/g, '')))
    ? '화성시'
    : '타지역'
}

// ── 사업 상태 매핑 ───────────────────────────────────────────────
// matching.py 허용값: "예비창업자" | "운영중"
function mapBusinessStatus(startupStage) {
  if (!startupStage) return null
  return startupStage === '예비창업자' ? '예비창업자' : '운영중'
}

// ════════════════════════════════════════════════════════════════
// 메인 변환 함수
// ════════════════════════════════════════════════════════════════

/**
 * @param {object} parsed  - parseUserCondition() 반환 객체
 * @returns {{
 *   profile: object,      - matching.py user_profile 형식
 *   warnings: string[],   - 손실·모호성 발생한 매핑 설명
 *   unmapped: string[],   - 기능1에서 수집했지만 매칭엔진에 없는 필드
 *   uncollected: string[] - 매칭엔진이 필요한데 기능1에서 안 뽑는 필드
 * }}
 */
export function mapToUserProfile(parsed) {
  const warnings = []
  const unmapped = []

  // ── 직접 매핑 ──────────────────────────────────────────────
  const age = parsed.age ?? null
  const marital_status = parsed.marital_status ?? null

  // ── 변환 매핑 ──────────────────────────────────────────────
  const region = mapRegion(parsed.region)
  if (parsed.region && region === '타지역') {
    warnings.push(`region: "${parsed.region}" → 화성시 외 지역으로 분류됨 (매칭 대상 아닐 수 있음)`)
  }

  const business_status = mapBusinessStatus(parsed.startup_stage)

  const category = mapCategory(parsed.business_type, parsed.ambiguous_fields)
  if (parsed.business_type && category === null) {
    warnings.push(`business_type: "${parsed.business_type}" → 표준 업종 매핑 불가, category=null (매칭엔진이 확인필요로 처리)`)
  } else if (parsed.business_type && category === '기타') {
    warnings.push(`business_type: "${parsed.business_type}" → "기타"로 분류됨 (카페/음식점/소매업 외)`)
  }

  const career_experience = mapCareerExperience(parsed.career_experience)

  // asset_group: income_level과 asset_status 중 값이 있는 걸 우선 사용
  const rawAsset = parsed.income_level || parsed.asset_status
  const asset_group = mapAssetGroup(rawAsset)
  if (rawAsset && !asset_group) {
    warnings.push(`income_level/asset_status: "${rawAsset}" → 기초생활수급자/차상위/일반 중 하나로 정규화 불가`)
  }

  // ── 기능1에 있지만 매칭엔진에 없는 필드 ──────────────────
  if (parsed.business_registration !== null && parsed.business_registration !== undefined) {
    unmapped.push(`business_registration: ${parsed.business_registration} (매칭엔진 미사용 — business_status로 대신 판단)`)
  }
  if (parsed.income_level && parsed.asset_status) {
    unmapped.push(`income_level과 asset_status 둘 다 있음 — asset_group 매핑에 income_level 우선 사용`)
  }

  const profile = {
    age,
    region,
    business_status,
    category,
    career_experience,
    asset_group,
    marital_status,
    // 기능1에서 수집하지 않는 필드 → null → 매칭엔진이 "확인필요"로 처리
    business_period_months: null,
    annual_revenue_krw: null,
    living_with_parents: null,
  }

  // null 필드 제거 (매칭엔진은 없는 키를 blank로 처리)
  const compactProfile = Object.fromEntries(
    Object.entries(profile).filter(([, v]) => v !== null)
  )

  return {
    profile: compactProfile,
    warnings,
    unmapped,
    uncollected: [
      'business_period_months (사업 운영 기간)',
      'annual_revenue_krw (연 매출)',
      'living_with_parents (부모 동거 여부)',
    ],
  }
}
