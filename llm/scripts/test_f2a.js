// F2A-01~F2A-05 베이스라인 vs v1 비교 테스트
// 실행: node scripts/test_f2a.js
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { summarizeNoticeBaseline, summarizeNoticeV1, MODEL_NAME } from '../src/utils/summarizeNotice.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const root  = join(__dir, '..')

const envText = readFileSync(join(root, '.env'), 'utf-8')
const API_KEY = envText.match(/VITE_GEMINI_API_KEY=(.+)/)?.[1]?.trim()
if (!API_KEY) throw new Error('.env에 VITE_GEMINI_API_KEY 없음')

const termsData = JSON.parse(readFileSync(join(__dir, 'fixtures/f2a/terms.json'), 'utf-8'))

function loadNotice(fname) {
  return JSON.parse(readFileSync(join(__dir, `fixtures/f2a/${fname}`), 'utf-8'))
}

// ── 체크 함수 ─────────────────────────────────────────────────────
function check(tcId, result) {
  const issues = []

  // F2A-02: support_amount 환각 금지 (summary가 잘린 공고)
  if (tcId === 'F2A-02') {
    // "지원내용" 뒤가 잘린 summary → 구체적 금액 생성 시 실패
    const a = result.support_amount
    if (a && /\d+만?원|\d+%/.test(a)) {
      issues.push(`[중요 실패] support_amount에 구체적 수치 환각: "${a}"`)
    }
  }

  // F2A-03: HTML/노이즈 텍스트가 one_line·target_summary에 그대로 노출되면 실패
  if (tcId === 'F2A-03') {
    const noisePatterns = [/□/, /◦/, /☞/, /\n\n/, /\.\s*,/, /년 월 일목/]
    for (const field of ['one_line', 'target_summary', 'caution']) {
      const val = result[field] ?? ''
      for (const pat of noisePatterns) {
        if (pat.test(val)) {
          issues.push(`[중요 실패] ${field}에 HTML/노이즈 문자 잔존: "${val.slice(0, 60)}"`)
          break
        }
      }
    }
  }

  // F2A-04: 마감된 공고(end: 2026-02-28) → is_expired가 true여야 함
  if (tcId === 'F2A-04') {
    if (result.is_expired !== true) {
      issues.push(`[중요 실패] is_expired=false — 2026-02-28 마감 공고를 유효로 판정`)
    }
  }

  // F2A-05: eligibility에 categories=["음식점"]만 있음
  // target_summary에 지역·나이 등 없는 조건을 추가하면 실패
  if (tcId === 'F2A-05') {
    const target = result.target_summary ?? ''
    const falseAdded = [/화성시/, /만 \d+세/, /소상공인.*\d/, /예비창업/, /기초생활/]
    for (const pat of falseAdded) {
      if (pat.test(target)) {
        issues.push(`[중요 실패] target_summary에 공고에 없는 조건 추가: "${target.slice(0, 80)}"`)
        break
      }
    }
  }

  return issues
}

const TEST_CASES = [
  {
    id: 'F2A-01',
    type: 'normal',
    trap_type: null,
    file: 'f2a-01_consultation.json',
    desc: '법률·세무·노무 무료 상담 — 깔끔한 summary, 지원 금액 없음',
    critical_failure_if: null,
    check_points: ['one_line 생성', 'support_type=컨설팅 계열', 'support_amount=null (무료이나 금액 미명시)'],
  },
  {
    id: 'F2A-02',
    type: 'trap',
    trap_type: 'hallucination',
    file: 'f2a-02_finance.json',
    desc: '금융비용 지원 — summary 잘림, 구체적 지원액 미명시',
    critical_failure_if: 'support_amount에 구체적 금액(%·원 단위)을 지어내는 경우',
    check_points: ['support_amount=null 또는 금액 명시 안 함'],
  },
  {
    id: 'F2A-03',
    type: 'trap',
    trap_type: 'html_noise',
    file: 'f2a-03_marketing_html.json',
    desc: '마케팅 지원 — summary에 □ ◦ 줄 깨짐 등 노이즈 다수',
    critical_failure_if: '노이즈 문자(□, ◦, 년 월 일목 등)가 요약 필드에 그대로 노출되는 경우',
    check_points: ['one_line 가독성 있는 한국어 문장', 'target_summary 노이즈 없음'],
  },
  {
    id: 'F2A-04',
    type: 'trap',
    trap_type: 'expired',
    file: 'f2a-04_expired.json',
    desc: '취약계층 예비창업 준비금 — apply_period.end=2026-02-28 (마감)',
    critical_failure_if: 'is_expired=false 로 잘못 판정하는 경우',
    check_points: ['is_expired=true'],
  },
  {
    id: 'F2A-05',
    type: 'trap',
    trap_type: 'missing_eligibility',
    file: 'f2a-05_food_eligibility.json',
    desc: '식품안심업소 기술지원 — eligibility에 categories=[음식점]만 있음',
    critical_failure_if: 'target_summary에 화성시·나이·소득 등 공고에 없는 조건을 추가하는 경우',
    check_points: ['target_summary에 음식점 업종 명시', '지역·나이 조건 없음'],
  },
]

async function runOne(tc, fn, label) {
  const notice = loadNotice(tc.file)
  const start = Date.now()
  let output = null, error = null
  try {
    output = await fn(notice, API_KEY, label === 'v1' ? termsData : undefined)
  } catch (e) {
    error = e.message
  }
  const elapsed = Date.now() - start
  const issues = output ? check(tc.id, output) : []
  const passed = !error && issues.filter(i => i.includes('[중요 실패]')).length === 0
  return { output, error, issues, elapsed, passed }
}

async function run() {
  console.log(`\n===== 기능2-a (공고문 요약) 베이스라인 vs v1 비교 =====`)
  console.log(`모델: ${MODEL_NAME}  |  실행: ${new Date().toISOString()}\n`)

  const allResults = []

  for (const tc of TEST_CASES) {
    console.log(`[${tc.id}] ${tc.desc}`)

    // Free tier: 분당 5회 제한 → 순차 실행 + 케이스 간 대기
    const bResult  = await runOne(tc, summarizeNoticeBaseline, 'baseline')
    await new Promise(r => setTimeout(r, 15000))
    const v1Result = await runOne(tc, summarizeNoticeV1, 'v1')

    const bStatus  = bResult.error  ? '❌ ERROR' : bResult.passed  ? '✅ PASS' : '⚠️  FAIL'
    const v1Status = v1Result.error ? '❌ ERROR' : v1Result.passed ? '✅ PASS' : '⚠️  FAIL'
    console.log(`  baseline: ${bStatus}  (${bResult.elapsed}ms)`)
    if (bResult.issues.length)  bResult.issues.forEach(i  => console.log(`    ${i}`))
    if (bResult.error)  console.log(`    Error: ${bResult.error}`)
    console.log(`  v1:       ${v1Status}  (${v1Result.elapsed}ms)`)
    if (v1Result.issues.length) v1Result.issues.forEach(i => console.log(`    ${i}`))
    if (v1Result.error) console.log(`    Error: ${v1Result.error}`)
    console.log()

    allResults.push({ tc, baseline: bResult, v1: v1Result })
    // 다음 케이스 전 대기 (rate limit 방지)
    if (tc !== TEST_CASES.at(-1)) await new Promise(r => setTimeout(r, 15000))
  }

  const bPass  = allResults.filter(r => r.baseline.passed).length
  const v1Pass = allResults.filter(r => r.v1.passed).length
  console.log(`결과 요약:  baseline ${bPass}/${TEST_CASES.length}  |  v1 ${v1Pass}/${TEST_CASES.length}`)

  writeFileSync(join(root, 'report/f2a_raw_output.json'), JSON.stringify(allResults, null, 2), 'utf-8')
  console.log('\n원시 결과 저장: report/f2a_raw_output.json')
  return allResults
}

run().catch(console.error)
