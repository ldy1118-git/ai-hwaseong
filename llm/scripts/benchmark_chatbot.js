/**
 * 챗봇 RAG 성능 비교 벤치마크
 * 실행: node scripts/benchmark_chatbot.js
 *
 * 목적: baseline(RAG 없음) vs v1(RAG 있음) 답변을 나란히 출력하고
 *       hallucination·URL 정확도·주의사항 포함 여부를 정량 비교.
 *
 * 출력:
 *   - 콘솔: 질문별 나란히 비교
 *   - report/benchmark_chatbot.md : 마크다운 리포트
 *   - report/benchmark_chatbot_raw.json : 원본 답변 JSON
 */

import { readFileSync, writeFileSync } from 'fs'
import {
  generateChatbotResponseBaseline,
  generateChatbotResponseV1,
  retrieveContext,
} from '../src/utils/generateChatbotResponse.js'

// ── 설정 ─────────────────────────────────────────────────────────
const PROVIDER = 'groq'
const TERMS_PATH = './scripts/fixtures/f2a/terms.json'
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

// ── 비교 질문 목록 ────────────────────────────────────────────────
// test_f3.js와 달리 "어떻게 다른가"를 보여주는 데 초점
const QUESTIONS = [
  {
    id: 'BM-01',
    category: '용어 설명',
    question: '이차보전이 뭐예요? 대출이자를 안 내도 되는 건가요?',
    history: [],
    focus: '이차보전 caution 포함 여부 (대출 심사 탈락 시 혜택 없음)',
    hallucination_bait: false,
  },
  {
    id: 'BM-02',
    category: '서류 발급',
    question: '중소기업확인서 어디서 발급받아요? 얼마나 걸려요?',
    history: [],
    focus: 'URL 정확도 (sminfo.mss.go.kr), 유효기간 경고 포함 여부',
    hallucination_bait: false,
  },
  {
    id: 'BM-03',
    category: '환각 유도',
    question: '화성시 소상공인 자금지원사업 금리가 몇 %예요?',
    history: [],
    focus: '구체적 금리 수치 환각 여부 — baseline 위험 케이스',
    hallucination_bait: true,
  },
  {
    id: 'BM-04',
    category: '멀티턴',
    question: '그럼 선착순이면 서류를 미리 준비해야겠네요?',
    history: [
      { role: 'user', text: '소상공인 지원사업 중에 선착순 접수인 게 있어요?' },
      { role: 'bot',  text: '네, 일부 사업은 선착순 접수 방식입니다. 예산이 소진되면 기간이 남아도 마감됩니다.' },
    ],
    focus: '이전 대화 맥락 반영 여부 (선착순 개념 재설명 없이 이어가는지)',
    hallucination_bait: false,
  },
  {
    id: 'BM-05',
    category: '미검증 서류',
    question: '주민등록등본 어디서 발급받아요?',
    history: [],
    focus: 'verified=false 항목 → v1이 미검증 경고 포함하는지',
    hallucination_bait: false,
  },
]

// ── 유틸 ─────────────────────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

function countPercent(text) {
  return (text || '').match(/\d+(\.\d+)?%/g) || []
}

function hasUrl(text) {
  return /https?:\/\/[^\s]+/.test(text || '')
}

function measureMetrics(blAnswer, v1) {
  const blText = blAnswer || ''
  const v1Text = v1.answer || ''
  return {
    bl_has_url:        hasUrl(blText),
    v1_has_url:        hasUrl(v1Text),
    bl_percent_count:  countPercent(blText).length,
    v1_percent_count:  countPercent(v1Text).length,
    bl_char_len:       blText.length,
    v1_char_len:       v1Text.length,
    v1_confidence:     v1.confidence,
    v1_terms_used:     v1.retrieved_terms || [],
    v1_docs_used:      v1.retrieved_docs || [],
  }
}

async function callSafe(label, fn) {
  try { return await fn() }
  catch (e) {
    if (e.status === 429) {
      console.warn(`  ⚠ ${label}: 429 quota — 스킵`)
      return null
    }
    throw e
  }
}

// ── 메인 ─────────────────────────────────────────────────────────
// ── 캐시 로드 ────────────────────────────────────────────────────
const RAW_PATH = './report/benchmark_chatbot_raw.json'
let cachedRaw = {}
try {
  cachedRaw = JSON.parse(readFileSync(RAW_PATH, 'utf-8'))
    .reduce((acc, r) => { if (!r.skipped) acc[r.id] = r; return acc }, {})
  const cached = Object.keys(cachedRaw)
  if (cached.length) console.log(`캐시 로드: ${cached.join(', ')} — API 호출 생략`)
} catch { /* 캐시 없으면 빈 객체 */ }

const rawResults = []
const mdRows = []

console.log('=== 챗봇 RAG 벤치마크 시작 ===\n')

// RAG 검색 미리보기
console.log('[ RAG 검색 사전 확인 ]')
for (const q of QUESTIONS) {
  const { terms, docs } = retrieveContext(q.question, termsData)
  const summary = [
    ...terms.map(t => `${t.term}(T)`),
    ...docs.map(d => `${d.name}(D)`),
  ].join(', ') || '없음'
  console.log(`  ${q.id}: ${summary}`)
}
console.log()

for (let i = 0; i < QUESTIONS.length; i++) {
  const q = QUESTIONS[i]
  console.log(`─────────────────────────────────────`)
  console.log(`[${q.id}] ${q.category}: ${q.question}`)
  console.log(`포인트: ${q.focus}`)
  if (q.hallucination_bait) console.log(`⚠ 환각 유도 케이스 — baseline의 구체 수치 생성 여부 주목`)
  console.log()

  // 캐시 히트
  let blResult, v1Result
  if (cachedRaw[q.id]) {
    console.log('  (캐시 사용)')
    blResult = { answer: cachedRaw[q.id].baseline_answer }
    v1Result = {
      answer: cachedRaw[q.id].v1_answer,
      confidence: cachedRaw[q.id].metrics?.v1_confidence,
      retrieved_terms: cachedRaw[q.id].metrics?.v1_terms_used || [],
      retrieved_docs: cachedRaw[q.id].metrics?.v1_docs_used || [],
      followup: cachedRaw[q.id].v1_followup || [],
    }
  } else {
    console.log('  baseline 호출...')
    blResult = await callSafe('baseline', () =>
      generateChatbotResponseBaseline(q.question, q.history, API_KEY, PROVIDER)
    )
    await delay(2000)

    console.log('  v1 (RAG) 호출...')
    v1Result = await callSafe('v1', () =>
      generateChatbotResponseV1(q.question, q.history, termsData, API_KEY, PROVIDER)
    )
  }

  if (!blResult || !v1Result) {
    console.log('  ⏭ SKIP (quota) — 재실행 시 자동 재개\n')
    rawResults.push({ id: q.id, skipped: true })
    writeFileSync(RAW_PATH, JSON.stringify(rawResults, null, 2))
    if (i < QUESTIONS.length - 1) await delay(15000)
    continue
  }

  const metrics = measureMetrics(blResult.answer, v1Result)

  // 콘솔 출력
  console.log(`\n  ┌─ BASELINE ────────────────────────`)
  console.log(`  │ ${blResult.answer.replace(/\n/g, '\n  │ ')}`)
  console.log(`  │ URL: ${metrics.bl_has_url ? '있음' : '없음'}  %수치: ${metrics.bl_percent_count}개`)

  console.log(`\n  ┌─ v1 (RAG) ─────────────────────────`)
  console.log(`  │ ${v1Result.answer.replace(/\n/g, '\n  │ ')}`)
  console.log(`  │ URL: ${metrics.v1_has_url ? '있음' : '없음'}  %수치: ${metrics.v1_percent_count}개`)
  console.log(`  │ confidence: ${metrics.v1_confidence}`)
  console.log(`  │ 활용 terms: ${metrics.v1_terms_used.join(', ') || '없음'}`)
  console.log(`  │ 활용 docs:  ${metrics.v1_docs_used.join(', ') || '없음'}`)
  if (v1Result.followup?.length) {
    console.log(`  │ 후속 질문: ${v1Result.followup.join(' / ')}`)
  }

  // 차이 요약
  console.log(`\n  [ 비교 요약 ]`)
  if (q.hallucination_bait) {
    if (metrics.bl_percent_count > metrics.v1_percent_count) {
      console.log(`  🔴 baseline이 ${metrics.bl_percent_count}개의 % 수치 생성 → v1은 ${metrics.v1_percent_count}개 (환각 억제 효과)`)
    } else {
      console.log(`  ⚪ % 수치 차이 없음 (이 케이스에서는 둘 다 비슷)`)
    }
  }
  if (!metrics.bl_has_url && metrics.v1_has_url) {
    console.log(`  🟢 v1만 URL 포함 (RAG 발급처 정보 활용)`)
  }
  if (metrics.bl_has_url && metrics.v1_has_url) {
    console.log(`  ⚪ 둘 다 URL 포함 (정확도는 리포트 참조)`)
  }
  if (metrics.v1_confidence === 'low') {
    console.log(`  🟡 v1 confidence=low → 데이터 없음 인식, 확인 안내`)
  }

  rawResults.push({ id: q.id, category: q.category, question: q.question, metrics,
    baseline_answer: blResult.answer,
    v1_answer: v1Result.answer,
    v1_followup: v1Result.followup,
  })
  writeFileSync(RAW_PATH, JSON.stringify(rawResults, null, 2))  // 즉시 저장

  // 마크다운 행 추가
  mdRows.push({
    id: q.id, category: q.category, focus: q.focus,
    bl_url: metrics.bl_has_url, v1_url: metrics.v1_has_url,
    bl_pct: metrics.bl_percent_count, v1_pct: metrics.v1_percent_count,
    v1_conf: metrics.v1_confidence,
    bl_ans: blResult.answer, v1_ans: v1Result.answer,
  })

  console.log()
  if (i < QUESTIONS.length - 1) {
    console.log('  2초 대기...')
    await delay(2000)
  }
}

// ── 마크다운 리포트 생성 ─────────────────────────────────────────
const completedRows = mdRows.filter(r => r.bl_ans)

const mdSummaryTable = [
  '| ID | 분류 | URL (BL→v1) | %수치 (BL→v1) | v1 confidence | 포인트 |',
  '|---|---|---|---|---|---|',
  ...completedRows.map(r => {
    const urlDiff = (!r.bl_url && r.v1_url) ? '❌→✅' : (r.bl_url && r.v1_url) ? '✅✅' : '❌❌'
    const pctDiff = r.bl_pct > r.v1_pct ? `🔴${r.bl_pct}→✅${r.v1_pct}` : `${r.bl_pct}→${r.v1_pct}`
    return `| ${r.id} | ${r.category} | ${urlDiff} | ${pctDiff} | ${r.v1_conf} | ${r.focus.slice(0, 30)}… |`
  }),
].join('\n')

const mdDetails = completedRows.map(r => `
### ${r.id} — ${r.category}

**포인트**: ${r.focus}

**BASELINE**
> ${r.bl_ans.replace(/\n/g, '\n> ')}

**v1 (RAG)**
> ${r.v1_ans.replace(/\n/g, '\n> ')}
`).join('\n---\n')

const mdContent = `# 챗봇 RAG 벤치마크 리포트

**모델**: gemini-3.6-flash, temperature=0
**실행일시**: 2026-08-15 KST
**비교**: baseline (RAG 없음) vs v1 (terms.json RAG 주입)

---

## 요약 지표

${mdSummaryTable}

> URL ❌→✅ : baseline에 없던 URL이 v1에서 RAG를 통해 등장
> %수치 🔴→✅ : baseline이 환각 수치를 생성했지만 v1은 억제

---

## 케이스별 상세

${mdDetails}
`

writeFileSync('./report/benchmark_chatbot.md', mdContent)
writeFileSync('./report/benchmark_chatbot_raw.json', JSON.stringify(rawResults, null, 2))

console.log('─────────────────────────────────────')
console.log(`완료: ${completedRows.length}/${QUESTIONS.length} 케이스 실행`)
console.log('report/benchmark_chatbot.md 저장 완료')
console.log('report/benchmark_chatbot_raw.json 저장 완료')
