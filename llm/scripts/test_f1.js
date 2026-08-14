// F1-01~F1-05 테스트 실행 스크립트
// 실행: node scripts/test_f1.js
import { readFileSync } from 'fs'
import { parseUserCondition, MODEL_NAME } from '../src/utils/parseUserCondition.js'

// .env에서 API 키 로드
const envText = readFileSync(new URL('../.env', import.meta.url), 'utf-8')
const API_KEY = envText.match(/VITE_GEMINI_API_KEY=(.+)/)?.[1]?.trim()
if (!API_KEY) throw new Error('.env에 VITE_GEMINI_API_KEY가 없습니다.')

const TEST_CASES = [
  {
    id: 'F1-01',
    type: 'normal',
    trap_type: null,
    input: '화성시 향남읍에서 카페 창업 준비 중인 만 29세, 창업 경험 없음, 기초생활수급자입니다. 받을 수 있는 지원사업 알려주세요.',
    critical_failure_if: null,
    check_points: ['age=29', 'region=향남읍', 'business_type=카페', 'income_level=기초생활수급자', 'career_experience=없음'],
  },
  {
    id: 'F1-02',
    type: 'trap',
    trap_type: 'missing_info_omission',
    input: '화성시 동탄에서 소매업 하려는 예비창업자예요. 나이는 34세고, 재산 관련해서는 딱히 말 안 했어요.',
    critical_failure_if: 'asset_status가 null이 아닌 임의 값(예: "일반", "없음", "0원")으로 채워지는 경우',
    check_points: ['asset_status=null 필수', 'asset_status가 missing_fields에 포함'],
  },
  {
    id: 'F1-03',
    type: 'trap',
    trap_type: 'unmapped_category',
    input: '저는 프리랜서 디자이너인데 이번에 화성시에 작업실 겸 스튜디오를 차려요. 소상공인 지원 대상 되나요?',
    critical_failure_if: '프리랜서를 임의의 표준 업종 코드(소매업, 서비스업 등)에 강제 매핑하는 경우',
    check_points: ['business_type에 프리랜서/디자이너 원문 포함', 'ambiguous_fields에 업종 매핑 불가 이유 포함'],
  },
  {
    id: 'F1-04',
    type: 'trap',
    trap_type: 'condition_ambiguity',
    input: '재산 기준이 정확히 뭘 말하는지 모르겠는데 그냥 저 신청 가능한지만 알려주세요.',
    critical_failure_if: '사용자 프로필 정보 없이 임의로 조건을 가정하고 매칭 결과를 확정하는 경우',
    check_points: ['대부분 필드 null', 'asset_status=null', 'parse_note에 질문 내용 또는 재산 기준 모호성 기록'],
  },
  {
    id: 'F1-05',
    type: 'trap',
    trap_type: 'deadline_or_closed_case',
    input: '화성형 청년 인테리어 지원사업 아직 신청 가능한가요? (참고: 이 공고는 마감된 상태)',
    critical_failure_if: '마감된 공고를 신청 가능한 것처럼 안내하거나, 사용자 프로필 정보 없이 임의 가정',
    check_points: ['사용자 프로필 필드 대부분 null', 'parse_note에 마감 관련 언급 또는 질문 기록'],
  },
  {
    id: 'F1-06',
    type: 'trap',
    trap_type: 'missing_info_omission',
    input: '화성시에서 반찬가게 하려고 준비 중이에요. 어떤 지원사업 받을 수 있는지 궁금해요.',
    critical_failure_if: 'business_registration이 null이 아닌 임의 값(true/false)으로 채워지는 경우 — "준비 중"이라는 표현만으로 사업자등록 여부를 단정하면 안 됨',
    check_points: ['business_registration=null 필수', 'business_registration이 missing_fields에 포함'],
  },
]

function checkResult(tc, result) {
  const issues = []

  // F1-02: asset_status가 null인지 확인
  if (tc.id === 'F1-02') {
    if (result.asset_status !== null && result.asset_status !== undefined) {
      issues.push(`[중요 실패] asset_status가 null이 아님: "${result.asset_status}"`)
    }
    if (!result.missing_fields?.includes('asset_status')) {
      issues.push(`[경고] asset_status가 missing_fields에 없음`)
    }
  }

  // F1-03: 프리랜서 강제 매핑 여부
  if (tc.id === 'F1-03') {
    const forceMapKeywords = ['소매업', '서비스업', '도소매', '전문서비스']
    if (forceMapKeywords.some(k => result.business_type?.includes(k))) {
      issues.push(`[중요 실패] business_type을 표준 업종에 강제 매핑: "${result.business_type}"`)
    }
    if (!result.business_type?.includes('프리랜서') && !result.business_type?.includes('디자이너')) {
      issues.push(`[경고] business_type에 원문("프리랜서", "디자이너") 미포함: "${result.business_type}"`)
    }
    if (!result.ambiguous_fields?.length) {
      issues.push(`[경고] ambiguous_fields가 비어 있음 (업종 모호성 미기록)`)
    }
  }

  // F1-06: business_registration이 null인지 확인
  if (tc.id === 'F1-06') {
    if (result.business_registration !== null && result.business_registration !== undefined) {
      issues.push(`[중요 실패] business_registration이 null이 아님: ${result.business_registration} — "준비 중" 표현으로 임의 추론`)
    }
    if (!result.missing_fields?.includes('business_registration')) {
      issues.push(`[경고] business_registration이 missing_fields에 없음`)
    }
  }

  // F1-04, F1-05: 대부분 필드 null 확인
  if (tc.id === 'F1-04' || tc.id === 'F1-05') {
    const profileFields = ['age', 'region', 'business_type', 'income_level', 'asset_status']
    const nonNull = profileFields.filter(f => result[f] !== null && result[f] !== undefined)
    if (nonNull.length > 1) {
      issues.push(`[경고] 프로필 정보가 없는 입력인데 ${nonNull.length}개 필드가 채워짐: ${nonNull.join(', ')}`)
    }
  }

  return issues
}

async function run() {
  console.log(`\n===== 기능1 (F1) 테스트 실행 =====`)
  console.log(`모델: ${MODEL_NAME}`)
  console.log(`실행 시각: ${new Date().toISOString()}\n`)

  const results = []

  for (const tc of TEST_CASES) {
    console.log(`[${tc.id}] 실행 중...`)
    const start = Date.now()
    let output = null
    let error = null

    try {
      output = await parseUserCondition(tc.input, API_KEY)
    } catch (e) {
      error = e.message
    }

    const elapsed = Date.now() - start
    const issues = output ? checkResult(tc, output) : []
    const passed = !error && issues.filter(i => i.includes('[중요 실패]')).length === 0

    results.push({ tc, output, error, issues, elapsed, passed })

    const status = error ? '❌ ERROR' : passed ? '✅ PASS' : '⚠️  ISSUE'
    console.log(`  ${status}  (${elapsed}ms)`)
    if (issues.length) issues.forEach(i => console.log(`    ${i}`))
    if (error) console.log(`    Error: ${error}`)
  }

  // JSON 출력 (리포트 생성용)
  const outputPath = new URL('../report/f1_raw_output.json', import.meta.url)
  const { writeFileSync } = await import('fs')
  writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8')
  console.log(`\n원시 결과 저장: report/f1_raw_output.json`)

  const passed = results.filter(r => r.passed).length
  console.log(`\n결과 요약: ${passed}/${results.length} 통과`)
  return results
}

run().catch(console.error)
