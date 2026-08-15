/**
 * 기능2-b (F2B) 테스트 — 신청동행/서류 체크리스트 (LLM+RAG)
 * 실행: node scripts/test_f2b.js
 *
 * 테스트케이스:
 *   F2B-01  정상 입력 — 자금지원, 모든 서류 RAG 매칭
 *   F2B-02  함정 — 시설개선사업, 비표준 서류(견적서·현장사진) + 확인필요 조건
 *   F2B-03  함정 — 청년 예비창업, confidence=estimated + 복수의 확인필요 조건
 */

import { readFileSync, writeFileSync } from 'fs'
import { generateChecklistBaseline, generateChecklistV1, buildDocumentRAG } from '../src/utils/generateChecklist.js'

const FIXTURE_DIR = './scripts/fixtures/f2b'
const TERMS_PATH  = './scripts/fixtures/f2a/terms.json'

const PROVIDER = 'groq'
const API_KEY = process.env.VITE_GROQ_API_KEY || (() => {
  try {
    const env = readFileSync('.env', 'utf-8')
    const m = env.match(/VITE_GROQ_API_KEY\s*=\s*(.+)/)
    return m ? m[1].trim() : null
  } catch { return null }
})()

if (!API_KEY) {
  console.error('Groq API 키 없음. .env 파일의 VITE_GROQ_API_KEY를 확인하세요.')
  process.exit(1)
}
console.log(`LLM 프로바이더: ${PROVIDER} (llama-3.3-70b-versatile)`)

const termsData = JSON.parse(readFileSync(TERMS_PATH, 'utf-8'))

function loadFixture(prefix) {
  return {
    notice:   JSON.parse(readFileSync(`${FIXTURE_DIR}/${prefix}_notice.json`, 'utf-8')),
    matching: JSON.parse(readFileSync(`${FIXTURE_DIR}/${prefix}_matching.json`, 'utf-8')),
  }
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ── 체크 함수들 ───────────────────────────────────────────────────

function checkBaselineV1(id, label, baselineResult, v1Result, checks) {
  const issues = []

  if (!v1Result.parsed) {
    issues.push('[오류] v1 JSON 파싱 실패')
  }
  if (!baselineResult.parsed) {
    issues.push('[경고] baseline JSON 파싱 실패')
  }

  for (const check of checks) {
    const result = check(baselineResult, v1Result)
    if (result) issues.push(result)
  }

  const ok = issues.every(i => !i.startsWith('[오류]'))
  const status = ok ? '✅ PASS' : '⚠️  FAIL'
  console.log(`\n[${id}] ${status}  ${label}`)
  issues.forEach(i => console.log(`    ${i}`))
  return ok
}

// ── 테스트케이스 ─────────────────────────────────────────────────

const TEST_CASES = [
  {
    id: 'F2B-01',
    label: '자금지원사업 — 모든 서류 RAG 매칭, overall_status=신청가능',
    fixture: 'f2b-01',
    checks: [
      (bl, v1) => {
        // v1: 체크리스트에 5개 서류 모두 있어야 함
        const items = v1.parsed?.checklist || []
        if (items.length < 5) return `[오류] v1 checklist 항목 부족: ${items.length}개 (기대: 5개)`
      },
      (bl, v1) => {
        // v1: 중소기업확인서에 URL이 있어야 함 (sminfo.mss.go.kr)
        const items = v1.parsed?.checklist || []
        const jungso = items.find(i => i.document.includes('중소기업'))
        if (!jungso) return '[오류] v1: 중소기업확인서 항목 없음'
        if (!jungso.url && !jungso.how_to_get?.includes('sminfo')) {
          return '[경고] v1: 중소기업확인서 발급 URL 누락 (RAG 주입 효과 미확인)'
        }
      },
      (bl, v1) => {
        // v1: overall_status 필드 있어야 함
        if (!v1.parsed?.overall_status) return '[오류] v1: overall_status 필드 없음'
      },
      (bl, v1) => {
        // v1: pending_conditions가 비어 있어야 함 (확인필요 조건 없음)
        const pending = v1.parsed?.pending_conditions || []
        if (pending.length > 0) {
          return `[경고] v1: pending_conditions가 비어야 하는데 ${pending.length}개 있음`
        }
      },
      (bl, v1) => {
        // baseline: how_to_get 정보가 v1보다 부정확할 가능성 체크
        // (정확성 비교를 위해 로그만 — FAIL 기준은 v1 기준)
        const blItems = bl.parsed?.checklist || []
        const v1Items = v1.parsed?.checklist || []
        const blWithUrl = blItems.filter(i => i.url).length
        const v1WithUrl = v1Items.filter(i => i.url).length
        if (blWithUrl < v1WithUrl) {
          console.log(`    [정보] URL 포함 항목: baseline ${blWithUrl}개 < v1 ${v1WithUrl}개 (RAG 효과 확인됨)`)
        }
      },
    ],
  },
  {
    id: 'F2B-02',
    label: '클린케어(시설개선) — 비표준서류(견적서·현장사진) + 확인필요 조건',
    fixture: 'f2b-02',
    checks: [
      (bl, v1) => {
        // v1: 견적서와 현장 사진이 체크리스트에 있어야 함
        const items = v1.parsed?.checklist || []
        const hasEstimate = items.some(i => i.document.includes('견적'))
        const hasPhoto = items.some(i => i.document.includes('사진') || i.document.includes('현장'))
        if (!hasEstimate) return '[오류] v1: 견적서 항목 없음'
        if (!hasPhoto) return '[오류] v1: 현장 사진 항목 없음'
      },
      (bl, v1) => {
        // v1: 현장 사진 항목에 "공사 전" 주의사항이 있어야 함
        const items = v1.parsed?.checklist || []
        const photo = items.find(i => i.document.includes('사진') || i.document.includes('현장'))
        if (photo && !photo.caution && !photo.how_to_get) {
          return '[경고] v1: 현장 사진 주의사항(공사 전 촬영) 누락'
        }
      },
      (bl, v1) => {
        // v1: operation_period 확인필요 → pending_conditions에 있어야 함
        const pending = v1.parsed?.pending_conditions || []
        if (pending.length === 0) {
          return '[오류] v1: 확인필요 조건(개업 기간)이 pending_conditions에 없음'
        }
      },
      (bl, v1) => {
        // v1: 임대차계약서(confidence=estimated)에 verify_note 있어야 함
        const items = v1.parsed?.checklist || []
        const imdae = items.find(i => i.document.includes('임대차'))
        if (imdae && imdae.confidence === 'estimated' && !imdae.verify_note) {
          return '[경고] v1: 임대차계약서 estimated인데 verify_note 없음'
        }
      },
    ],
  },
  {
    id: 'F2B-03',
    label: '청년 예비창업 — confidence=estimated + 복수 확인필요 조건(소득·부모동거)',
    fixture: 'f2b-03',
    checks: [
      (bl, v1) => {
        // v1: 가족관계증명서(estimated)에 verify_note 있어야 함
        const items = v1.parsed?.checklist || []
        const gajok = items.find(i => i.document.includes('가족관계'))
        if (!gajok) return '[오류] v1: 가족관계증명서 항목 없음'
        if (gajok.confidence !== 'estimated') {
          return '[경고] v1: 가족관계증명서 confidence가 estimated여야 함'
        }
        if (!gajok.verify_note) {
          return '[오류] v1: 가족관계증명서(estimated)에 verify_note 없음'
        }
      },
      (bl, v1) => {
        // v1: pending_conditions에 income_asset과 living_with_parents 둘 다 있어야 함
        const pending = v1.parsed?.pending_conditions || []
        const hasIncome = pending.some(p =>
          p.condition.includes('income') || p.condition.includes('소득') || p.condition.includes('asset')
        )
        const hasParents = pending.some(p =>
          p.condition.includes('parent') || p.condition.includes('동거') || p.condition.includes('living')
        )
        if (!hasIncome) return '[오류] v1: 소득·자산 확인필요 조건이 pending에 없음'
        if (!hasParents) return '[오류] v1: 부모 동거 확인필요 조건이 pending에 없음'
      },
      (bl, v1) => {
        // v1: pending_conditions 각 항목에 ask_user 문장이 있어야 함
        const pending = v1.parsed?.pending_conditions || []
        const missing = pending.filter(p => !p.ask_user || p.ask_user.length < 5)
        if (missing.length > 0) {
          return `[오류] v1: pending_conditions ${missing.length}개 항목에 ask_user 없음`
        }
      },
      (bl, v1) => {
        // baseline: pending_conditions 체크 (baseline은 확인필요를 무시할 가능성)
        const blPending = bl.parsed?.pending_conditions || []
        const v1Pending = v1.parsed?.pending_conditions || []
        if (blPending.length < v1Pending.length) {
          console.log(`    [정보] pending_conditions: baseline ${blPending.length}개 < v1 ${v1Pending.length}개 (v1이 더 정확)`)
        }
      },
      (bl, v1) => {
        // v1: checklist에 expected_documents에 없는 서류가 추가됐으면 실패
        const expectedNames = ['신청서', '사업계획서', '주민등록등본', '가족관계증명서', '개인정보']
        const items = v1.parsed?.checklist || []
        const hallucinated = items.filter(i =>
          !expectedNames.some(n => i.document.includes(n.replace('·', '').replace(' ', '')))
        )
        if (hallucinated.length > 0) {
          return `[오류] v1: 매칭 출력에 없는 서류 추가됨 — ${hallucinated.map(i => i.document).join(', ')}`
        }
      },
    ],
  },
]

// ── RAG 매칭 사전 검증 ────────────────────────────────────────────
console.log('=== RAG 매칭 사전 검증 ===')
for (const tc of TEST_CASES) {
  const { matching } = loadFixture(tc.fixture)
  const { matched, unmatched } = buildDocumentRAG(matching.expected_documents, termsData)
  const total = matching.expected_documents.length
  console.log(`[${tc.id}] RAG 매칭: ${matched.length}/${total} 매칭됨, 미매칭: ${unmatched.map(d => d.name).join(', ') || '없음'}`)
}

// ── 캐시 로드 ────────────────────────────────────────────────────
const CACHE_PATH = './report/f2b_raw_output.json'
let rawOutputs = {}
try {
  rawOutputs = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'))
  const cached = Object.keys(rawOutputs).filter(k => !rawOutputs[k].skipped)
  if (cached.length) console.log(`\n캐시 로드: ${cached.join(', ')} — API 호출 생략\n`)
} catch { /* 캐시 없으면 빈 객체로 시작 */ }

function saveCache() {
  writeFileSync(CACHE_PATH, JSON.stringify(rawOutputs, null, 2))
}

// ── 메인 테스트 루프 ─────────────────────────────────────────────
const results = { passed: 0, failed: 0 }

async function callWithFallback(label, fn) {
  try {
    return await fn()
  } catch (e) {
    if (e.status === 429) {
      console.log(`  ⚠ ${label}: 429 rate limit — 스킵`)
      return { raw: null, parsed: null, error: '429 rate limit' }
    }
    throw e
  }
}

for (let i = 0; i < TEST_CASES.length; i++) {
  const tc = TEST_CASES[i]
  const { notice, matching } = loadFixture(tc.fixture)

  // 캐시 히트 — API 호출 없이 기존 결과로 체크만 재실행
  if (rawOutputs[tc.id] && !rawOutputs[tc.id].skipped) {
    console.log(`\n--- ${tc.id} (캐시 사용) ---`)
    const cached = rawOutputs[tc.id]
    const blResult = { parsed: cached.baseline, raw: null, error: null }
    const v1Result = { parsed: cached.v1, raw: null, error: null,
      matched: cached.matched_docs?.map(n => ({ name: n })) || [],
      unmatched: cached.unmatched_docs?.map(n => ({ name: n })) || [] }
    const ok = checkBaselineV1(tc.id, tc.label, blResult, v1Result, tc.checks)
    if (ok) results.passed++; else results.failed++
    continue
  }

  console.log(`\n--- ${tc.id} 실행 중 ---`)

  console.log('  baseline 호출...')
  const blResult = await callWithFallback('baseline', () =>
    generateChecklistBaseline(matching, notice, API_KEY, PROVIDER)
  )
  console.log('  3초 대기...')
  await delay(3000)

  console.log('  v1 호출...')
  const v1Result = await callWithFallback('v1', () =>
    generateChecklistV1(matching, notice, termsData, API_KEY, PROVIDER)
  )

  if (blResult.error === '429 rate limit' || v1Result.error === '429 rate limit') {
    console.log(`[${tc.id}] ⏭  SKIP  쿼터 소진 — 재실행 시 자동 재개`)
    rawOutputs[tc.id] = { skipped: true, reason: '429 daily quota exceeded' }
    saveCache()
    if (i < TEST_CASES.length - 1) await delay(15000)
    continue
  }

  rawOutputs[tc.id] = {
    baseline: blResult.parsed || blResult.raw,
    v1: v1Result.parsed || v1Result.raw,
    matched_docs: v1Result.matched?.map(d => d.name) || [],
    unmatched_docs: v1Result.unmatched?.map(d => d.name) || [],
  }
  saveCache()  // 케이스 완료 즉시 저장

  const ok = checkBaselineV1(tc.id, tc.label, blResult, v1Result, tc.checks)
  if (ok) results.passed++
  else results.failed++

  if (i < TEST_CASES.length - 1) {
    console.log('  3초 대기...')
    await delay(3000)
  }
}

const total = TEST_CASES.length
const skipped = Object.values(rawOutputs).filter(v => v.skipped).length
console.log(`\n=============================`)
console.log(`결과: ${results.passed}/${total - skipped} 통과 (${skipped}개 스킵)`)
if (skipped) console.log(`스킵된 케이스는 재실행 시 자동으로 이어받습니다.`)
console.log(`=============================\n`)
