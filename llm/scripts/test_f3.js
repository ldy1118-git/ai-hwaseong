/**
 * 기능3 (F3) 테스트 — 챗봇 RAG
 * 실행: node scripts/test_f3.js
 *
 * 테스트케이스:
 *   F3-01  용어 설명 (이차보전) — RAG terms[] 활용
 *   F3-02  서류 발급 (중소기업확인서) — RAG documents[] 활용
 *   F3-03  함정: 없는 금리 정보 — baseline 환각, v1 확인 필요 안내
 *   F3-04  멀티턴: 앞 대화 참조
 *   F3-05  함정: verified=false 항목 — v1이 미검증 경고 포함하는지
 */

import { readFileSync, writeFileSync } from 'fs'
import {
  generateChatbotResponseBaseline,
  generateChatbotResponseV1,
  retrieveContext,
} from '../src/utils/generateChatbotResponse.js'

const TERMS_PATH  = './scripts/fixtures/f2a/terms.json'
const CASES_PATH  = './scripts/fixtures/f3/f3_questions.json'

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
const TEST_CASES = JSON.parse(readFileSync(CASES_PATH, 'utf-8'))

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── RAG 검색 사전 검증 ────────────────────────────────────────────
console.log('=== RAG 검색 사전 검증 ===')
for (const tc of TEST_CASES) {
  const { terms, docs } = retrieveContext(tc.question, termsData)
  const foundTermNames = terms.map(t => t.term)
  const foundDocNames  = docs.map(d => d.name)

  const termOk = tc.rag_expected_terms.every(e => foundTermNames.includes(e))
  const docOk  = tc.rag_expected_docs.every(e => foundDocNames.includes(e))
  const status = (termOk && docOk) ? '✅' : '⚠️'

  console.log(`[${tc.id}] ${status} terms: [${foundTermNames.join(', ') || '없음'}]  docs: [${foundDocNames.join(', ') || '없음'}]`)
  if (!termOk) console.log(`    기대 terms: ${tc.rag_expected_terms.join(', ')}`)
  if (!docOk)  console.log(`    기대 docs: ${tc.rag_expected_docs.join(', ')}`)
}
console.log()

// ── 체크 함수 ────────────────────────────────────────────────────
function checkResult(id, label, blResult, v1Result, checks) {
  const issues = []

  if (!v1Result.answer) {
    issues.push('[오류] v1 answer 없음')
  }

  const v1Text = (v1Result.answer || '').toLowerCase()
  const blText = (blResult.answer || '').toLowerCase()

  // must_contain
  for (const word of (checks.v1_must_contain || [])) {
    if (!v1Text.includes(word.toLowerCase())) {
      issues.push(`[오류] v1 answer에 "${word}" 포함 안 됨`)
    }
  }

  // caution
  if (checks.v1_caution_present) {
    if (!v1Text.includes(checks.v1_caution_present.toLowerCase())) {
      issues.push(`[오류] v1: caution "${checks.v1_caution_present}" 누락`)
    }
  }

  // confidence not high (hallucination bait cases)
  if (checks.v1_confidence_not_high) {
    if (v1Result.confidence === 'high') {
      issues.push('[오류] v1: confidence=high — 없는 정보인데 자신감 있게 답변')
    }
  }

  // 구체적 금리 수치 미포함 (F3-03)
  if (checks.v1_must_not_contain_specific_rate) {
    const ratePattern = /\d+(\.\d+)?%/
    if (ratePattern.test(v1Result.answer || '')) {
      issues.push('[오류] v1: 구체적 금리(%)를 답변에 포함 — 환각 가능성')
    }
  }

  // 문의 제안 포함 (F3-03)
  if (checks.v1_must_suggest_contact) {
    const contactKeywords = ['확인', '문의', '기관', '경기신용보증', '담당']
    if (!contactKeywords.some(k => v1Text.includes(k))) {
      issues.push('[오류] v1: 없는 정보인데 문의 안내 없음')
    }
  }

  // verified=false 항목 미검증 경고 (F3-05)
  if (checks.v1_unverified_flagged) {
    const unverifiedKeywords = ['미검증', '확인 필요', '확인이 필요', '재확인', '정확히 확인']
    if (!unverifiedKeywords.some(k => v1Text.includes(k))) {
      issues.push('[경고] v1: verified=false 항목인데 미검증 경고 없음')
    }
  }

  // 멀티턴 맥락 인식 (F3-04)
  if (checks.v1_context_aware) {
    if (v1Text.includes('선착순이 뭔지') || v1Text.includes('선착순은')) {
      issues.push('[경고] v1: 앞 대화 맥락 무시하고 선착순 재설명')
    }
  }

  // baseline 비교 로그
  if (checks.baseline_risk) {
    console.log(`    [참고] baseline 위험: ${checks.baseline_risk}`)
    console.log(`    baseline confidence: ${blResult.confidence || 'N/A'}`)
    const blRate = /\d+(\.\d+)?%/.test(blResult.answer || '')
    const v1Rate = /\d+(\.\d+)?%/.test(v1Result.answer || '')
    if (blRate && !v1Rate) {
      console.log(`    [정보] baseline은 %수치 포함, v1은 없음 (환각 억제 효과 확인)`)
    }
  }

  const ok = issues.every(i => !i.startsWith('[오류]'))
  const status = ok ? '✅ PASS' : '⚠️  FAIL'
  console.log(`[${id}] ${status}  ${label}`)
  issues.forEach(i => console.log(`    ${i}`))
  return ok
}

// ── 메인 루프 ────────────────────────────────────────────────────
async function callWithFallback(label, fn) {
  try { return await fn() }
  catch (e) {
    if (e.status === 429) {
      console.log(`  ⚠ ${label}: 429 rate limit — 스킵`)
      return { answer: null, retrieved_terms: [], retrieved_docs: [], confidence: 'skipped', followup: [] }
    }
    throw e
  }
}

// ── 캐시 로드 ────────────────────────────────────────────────────
const CACHE_PATH = './report/f3_raw_output.json'
let rawOutputs = {}
try {
  rawOutputs = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'))
  const cached = Object.keys(rawOutputs).filter(k => !rawOutputs[k].skipped)
  if (cached.length) console.log(`\n캐시 로드: ${cached.join(', ')} — API 호출 생략\n`)
} catch { /* 캐시 없으면 빈 객체로 시작 */ }

function saveCache() {
  writeFileSync(CACHE_PATH, JSON.stringify(rawOutputs, null, 2))
}

let passed = 0, failed = 0

for (let i = 0; i < TEST_CASES.length; i++) {
  const tc = TEST_CASES[i]

  // 캐시 히트 — 체크만 재실행
  if (rawOutputs[tc.id] && !rawOutputs[tc.id].skipped) {
    console.log(`\n--- ${tc.id} (캐시 사용) ---`)
    const cached = rawOutputs[tc.id]
    const blResult = { answer: cached.baseline?.answer, confidence: cached.baseline?.confidence }
    const v1Result = {
      answer: cached.v1?.answer,
      confidence: cached.v1?.confidence,
      retrieved_terms: cached.v1?.retrieved_terms || [],
      retrieved_docs: cached.v1?.retrieved_docs || [],
      followup: cached.v1?.followup || [],
    }
    const ok = checkResult(tc.id, tc.label, blResult, v1Result, tc.critical_checks)
    if (ok) passed++; else failed++
    continue
  }

  console.log(`\n--- ${tc.id} 실행 중 ---`)
  console.log(`  질문: "${tc.question}"`)

  console.log('  baseline 호출...')
  const blResult = await callWithFallback('baseline', () =>
    generateChatbotResponseBaseline(tc.question, tc.history, API_KEY, PROVIDER)
  )
  await delay(2000)

  console.log('  v1 호출...')
  const v1Result = await callWithFallback('v1', () =>
    generateChatbotResponseV1(tc.question, tc.history, termsData, API_KEY, PROVIDER)
  )

  if (blResult.confidence === 'skipped' || v1Result.confidence === 'skipped') {
    console.log(`[${tc.id}] ⏭  SKIP  쿼터 소진 — 재실행 시 자동 재개`)
    rawOutputs[tc.id] = { skipped: true }
    saveCache()
    if (i < TEST_CASES.length - 1) await delay(15000)
    continue
  }

  rawOutputs[tc.id] = {
    baseline: { answer: blResult.answer, confidence: blResult.confidence },
    v1: {
      answer: v1Result.answer,
      confidence: v1Result.confidence,
      retrieved_terms: v1Result.retrieved_terms,
      retrieved_docs: v1Result.retrieved_docs,
      followup: v1Result.followup,
    },
  }
  saveCache()  // 케이스 완료 즉시 저장

  const ok = checkResult(tc.id, tc.label, blResult, v1Result, tc.critical_checks)
  if (ok) passed++
  else failed++

  if (i < TEST_CASES.length - 1) {
    console.log('  2초 대기...')
    await delay(2000)
  }
}

const skipped = Object.values(rawOutputs).filter(v => v.skipped).length
console.log(`\n=================================`)
console.log(`결과: ${passed}/${TEST_CASES.length - skipped} 통과 (${skipped}개 스킵)`)
if (skipped) console.log(`스킵된 케이스는 재실행 시 자동으로 이어받습니다.`)
console.log(`=================================\n`)
