// mapToUserProfile() 단위 테스트 — API 호출 없음
// 실행: node scripts/test_map.js
import { mapToUserProfile } from '../src/utils/mapToUserProfile.js'

// F1 실제 출력 기반 테스트케이스 (report/f1_raw_output.json에서 발췌)
const TEST_CASES = [
  {
    id: 'MAP-01',
    desc: 'F1-01: 카페 예비창업자, 기초생활수급자, 화성시 향남읍',
    input: {
      age: 29, region: '화성시 향남읍', business_type: '카페',
      startup_stage: '예비창업자', career_experience: '없음',
      income_level: '기초생활수급자', asset_status: null,
      business_registration: null, marital_status: null,
      missing_fields: ['asset_status', 'business_registration', 'marital_status'],
      ambiguous_fields: [],
    },
    expect: {
      age: 29, region: '화성시', business_status: '예비창업자',
      category: '카페', career_experience: '없음', asset_group: '기초생활수급자',
    },
    must_not_have: [],
  },
  {
    id: 'MAP-02',
    desc: 'F1-02: 소매업 예비창업자, 재산 미언급 → asset_group 없어야 함',
    input: {
      age: 34, region: '화성시 동탄', business_type: '소매업',
      startup_stage: '예비창업자', career_experience: null,
      income_level: null, asset_status: null,
      business_registration: null, marital_status: null,
      missing_fields: ['asset_status', 'income_level', 'career_experience'],
      ambiguous_fields: [],
    },
    expect: {
      age: 34, region: '화성시', business_status: '예비창업자',
      category: '소매업',
    },
    must_not_have: ['asset_group', 'career_experience'],
  },
  {
    id: 'MAP-03',
    desc: 'F1-03: 프리랜서 디자이너 → category=null (ambiguous), 매칭엔진 확인필요 유도',
    input: {
      age: null, region: '화성시', business_type: '프리랜서 디자이너',
      startup_stage: '예비창업자', career_experience: null,
      income_level: null, asset_status: null,
      business_registration: null, marital_status: null,
      missing_fields: ['age', 'asset_status'],
      ambiguous_fields: [{ field: 'business_type', reason: '표준 업종 매핑 불가 (프리랜서 디자이너)' }],
    },
    expect: { region: '화성시', business_status: '예비창업자' },
    must_not_have: ['category', 'age'],
    expect_warnings_contain: '표준 업종 매핑 불가',
  },
  {
    id: 'MAP-04',
    desc: 'F1-04: 모든 필드 null → 프로필 빈 객체',
    input: {
      age: null, region: null, business_type: null, startup_stage: null,
      career_experience: null, income_level: null, asset_status: null,
      business_registration: null, marital_status: null,
      missing_fields: ['age', 'region', 'business_type', 'career_experience', 'income_level', 'asset_status'],
      ambiguous_fields: [],
    },
    expect: {},
    must_not_have: ['age', 'region', 'category', 'asset_group'],
  },
  {
    id: 'MAP-05',
    desc: 'F1-06: 반찬가게 → 음식점으로 매핑',
    input: {
      age: null, region: '화성시', business_type: '반찬가게',
      startup_stage: '예비창업자', career_experience: null,
      income_level: null, asset_status: null,
      business_registration: null, marital_status: null,
      missing_fields: ['age', 'asset_status'],
      ambiguous_fields: [],
    },
    expect: { region: '화성시', business_status: '예비창업자', category: '음식점' },
    must_not_have: ['age'],
  },
  {
    id: 'MAP-06',
    desc: '화성시 외 지역 → 타지역 + warning',
    input: {
      age: 40, region: '서울시 강남구', business_type: '카페',
      startup_stage: null, career_experience: '있음',
      income_level: null, asset_status: null,
      business_registration: true, marital_status: '기혼',
      missing_fields: [], ambiguous_fields: [],
    },
    expect: { age: 40, region: '타지역', category: '카페', career_experience: '있음', marital_status: '기혼' },
    must_not_have: ['asset_group', 'business_status'],
    expect_warnings_contain: '화성시 외 지역',
  },
  {
    id: 'MAP-07',
    desc: 'career_experience "3년 운영" → "있음" 매핑',
    input: {
      age: 45, region: '화성시 봉담', business_type: '음식점',
      startup_stage: '운영중', career_experience: '3년',
      income_level: '일반', asset_status: null,
      business_registration: true, marital_status: null,
      missing_fields: [], ambiguous_fields: [],
    },
    expect: {
      age: 45, region: '화성시', business_status: '운영중',
      category: '음식점', career_experience: '있음', asset_group: '일반',
    },
    must_not_have: [],
  },
]

let passed = 0
let failed = 0

for (const tc of TEST_CASES) {
  const { profile, warnings } = mapToUserProfile(tc.input)
  const issues = []

  // expect 필드 확인
  for (const [key, expected] of Object.entries(tc.expect)) {
    if (profile[key] !== expected) {
      issues.push(`[실패] ${key}: 기대 "${expected}", 실제 "${profile[key]}"`)
    }
  }

  // must_not_have 필드 확인 (null이거나 존재하지 않아야 함)
  for (const key of (tc.must_not_have || [])) {
    if (profile[key] !== undefined && profile[key] !== null) {
      issues.push(`[실패] ${key}: 없어야 하는데 "${profile[key]}" 있음`)
    }
  }

  // 경고 메시지 확인
  if (tc.expect_warnings_contain) {
    const found = warnings.some(w => w.includes(tc.expect_warnings_contain))
    if (!found) {
      issues.push(`[실패] warnings에 "${tc.expect_warnings_contain}" 포함 기대, 실제: ${JSON.stringify(warnings)}`)
    }
  }

  const ok = issues.length === 0
  ok ? passed++ : failed++

  const status = ok ? '✅ PASS' : '⚠️  FAIL'
  console.log(`[${tc.id}] ${status}  ${tc.desc}`)
  issues.forEach(i => console.log(`    ${i}`))
  if (!ok || process.env.VERBOSE) {
    console.log(`    profile: ${JSON.stringify(profile)}`)
    if (warnings.length) console.log(`    warnings: ${JSON.stringify(warnings)}`)
  }
}

console.log(`\n결과: ${passed}/${TEST_CASES.length} 통과`)
