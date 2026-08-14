/**
 * Ollama 로컬 모델 챗봇 RAG 테스트 — 독립 실행 스크립트
 *
 * 실행 위치: 사용자 노트북 (Ollama 설치된 곳)
 *
 * 필요 파일 (같은 폴더에 배치):
 *   test_ollama_standalone.js  ← 이 파일
 *   terms.json                 ← scripts/fixtures/f2a/terms.json 복사
 *   f3_questions.json          ← scripts/fixtures/f3/f3_questions.json 복사
 *
 * 실행:
 *   node test_ollama_standalone.js
 *
 * 결과:
 *   ollama_results.json  ← 이 파일을 JupyterHub report/ 폴더에 업로드
 *
 * 모델명 확인: ollama list
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'

// ── 모델 설정 (ollama list 결과에 맞게 수정) ─────────────────────
const MODELS = [
  { id: 'gemma3', name: 'Gemma3-4B',   tag: 'gemma3:4b' },
  { id: 'qwen',   name: 'Qwen2.5-7B', tag: 'qwen2.5:7b' },
]
const OLLAMA_BASE = 'http://localhost:11434'

// ── 픽스처 로드 ───────────────────────────────────────────────────
function loadFile(name) {
  if (!existsSync(name)) {
    console.error(`❌ 파일 없음: ${name}`)
    console.error('   같은 폴더에 terms.json, f3_questions.json 복사 필요')
    process.exit(1)
  }
  return JSON.parse(readFileSync(name, 'utf-8'))
}

const termsData  = loadFile('terms.json')
const TEST_CASES = loadFile('f3_questions.json')

// ── Ollama 모델 목록 확인 ─────────────────────────────────────────
async function checkOllamaModels() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`)
    const data = await res.json()
    const available = (data.models || []).map(m => m.name)
    console.log('\n[ Ollama 사용 가능 모델 ]')
    available.forEach(m => console.log(`  - ${m}`))
    console.log()
    return available
  } catch {
    console.error('❌ Ollama 접속 실패. ollama serve 실행 중인지 확인하세요.')
    process.exit(1)
  }
}

// ── RAG 검색 ──────────────────────────────────────────────────────
function scoreText(question, ...candidates) {
  const q = question.replace(/[?!。\s,]+/g, '').toLowerCase()
  let score = 0
  for (const c of candidates) {
    if (!c) continue
    const cn = c.replace(/[·\s]+/g, '').toLowerCase()
    if (q.includes(cn) || cn.includes(q)) { score += 3; continue }
    for (let len = 2; len <= cn.length; len++) {
      for (let start = 0; start <= cn.length - len; start++) {
        if (q.includes(cn.slice(start, start + len))) { score += 1; break }
      }
    }
  }
  return score
}

function retrieveContext(question) {
  const termsArr = termsData?.terms || []
  const docsArr  = termsData?.documents || []
  const terms = termsArr
    .map(t => ({ ...t, _score: scoreText(question, t.term, ...(t.aliases || [])) }))
    .filter(t => t._score > 0).sort((a, b) => b._score - a._score).slice(0, 3)
  const docs = docsArr
    .map(d => ({ ...d, _score: scoreText(question, d.name, ...(d.aliases || [])) }))
    .filter(d => d._score > 0).sort((a, b) => b._score - a._score).slice(0, 3)
  return { terms, docs }
}

function formatTermContext(terms) {
  if (!terms.length) return ''
  const lines = ['=== 관련 용어 정의 (RAG) ===']
  for (const t of terms) {
    lines.push(`\n[${t.term}]`)
    lines.push(`  쉬운 설명: ${t.easy}`)
    if (t.detail)   lines.push(`  상세: ${t.detail}`)
    if (t.caution)  lines.push(`  주의: ${t.caution}`)
    if (!t.verified) lines.push(`  ⚠ 이 항목은 아직 원문 검증이 완료되지 않았습니다.`)
  }
  return lines.join('\n')
}

function formatDocContext(docs) {
  if (!docs.length) return ''
  const lines = ['=== 관련 서류 발급 정보 (RAG) ===']
  for (const d of docs) {
    lines.push(`\n[${d.name}]`)
    lines.push(`  설명: ${d.easy}`)
    if (d.issue?.online?.length) lines.push(`  온라인 발급: ${d.issue.online.join(' → ')}`)
    if (d.issue?.offline?.length) lines.push(`  오프라인: ${d.issue.offline.join(' / ')}`)
    if (d.issue?.fee)  lines.push(`  수수료: ${d.issue.fee}`)
    if (d.issue?.time) lines.push(`  소요시간: ${d.issue.time}`)
    if (d.issue?.url)  lines.push(`  URL: ${d.issue.url}`)
    if (d.caution)     lines.push(`  주의: ${d.caution}`)
    if (!d.verified)   lines.push(`  ⚠ 발급 정보 미검증 — 접수기관에 재확인 권장`)
  }
  return lines.join('\n')
}

// ── Ollama API 호출 ───────────────────────────────────────────────
const SYSTEM_BASE = `당신은 화성시 소상공인을 위한 AI 경영동행 서비스의 전담 상담사입니다.
역할: 화성시 소상공인의 세무 신고, 지원사업 신청, 상권 정보를 안내합니다.
답변 원칙: 항상 한국어로 짧고 친절하게 답변합니다. 구체적인 날짜, 금액, 절차를 포함합니다. 모르는 내용은 솔직히 모른다고 하고 관련 기관 연락처를 안내합니다.`

async function callOllama(modelTag, messages, jsonMode = false) {
  const systemSuffix = jsonMode
    ? '\n\n반드시 유효한 JSON만 출력하세요. 다른 텍스트는 절대 포함하지 마세요.'
    : ''

  // system 메시지가 있으면 suffix 추가
  const finalMessages = messages.map((m, i) =>
    m.role === 'system' ? { ...m, content: m.content + systemSuffix } : m
  )

  const body = {
    model: modelTag,
    messages: finalMessages,
    stream: false,
    options: { temperature: 0 },
  }
  if (jsonMode) body.format = 'json'

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Ollama ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json()
  return data.message?.content || ''
}

// ── baseline 생성 ─────────────────────────────────────────────────
async function generateBaseline(modelTag, question, history) {
  const messages = [
    { role: 'system', content: SYSTEM_BASE },
    ...history.map(h => ({ role: h.role === 'bot' ? 'assistant' : 'user', content: h.text })),
    { role: 'user', content: question },
  ]
  const text = await callOllama(modelTag, messages, false)
  return { answer: text, retrieved_terms: [], retrieved_docs: [], confidence: 'unknown', followup: [] }
}

// ── v1 (RAG) 생성 ─────────────────────────────────────────────────
async function generateV1(modelTag, question, history) {
  const { terms, docs } = retrieveContext(question)
  const hasContext = terms.length > 0 || docs.length > 0

  const systemPrompt = `${SYSTEM_BASE}

추가 규칙 (반드시 준수):
1. 아래 RAG 데이터에 있는 내용은 그것을 근거로 답변하세요.
2. RAG 데이터에 없는 금액·날짜·URL·절차는 추측하지 말고 "공고 또는 담당 기관에 확인 필요"라고 하세요.
3. confidence 필드: RAG 데이터로 충분히 답변 가능하면 "high", 부분적이면 "medium", 없으면 "low".
4. retrieved_terms/retrieved_docs는 실제로 답변에 활용한 항목 이름만 기재.
5. followup은 사용자가 이어서 물어볼 법한 질문 1~2개.
6. 오늘 날짜는 2026년 8월 15일.
7. RAG 데이터에 url이 있으면 answer에 반드시 포함하세요.
8. RAG 데이터에 caution이 있으면 answer에 자연스럽게 안내하세요.
9. verified=false 서류 정보가 있으면 answer에 "⚠ 미검증" 경고를 포함하세요.
${hasContext ? `\n${formatTermContext(terms)}\n${formatDocContext(docs)}` : '\n=== RAG 데이터 없음 — 위 규칙 2번 적용 ==='}

응답 JSON 구조: {"answer":"답변 텍스트","retrieved_terms":["사용한 용어명"],"retrieved_docs":["사용한 서류명"],"confidence":"high|medium|low","followup":["후속질문1"]}`

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({ role: h.role === 'bot' ? 'assistant' : 'user', content: h.text })),
    { role: 'user', content: question },
  ]

  const text = await callOllama(modelTag, messages, true)
  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned)
    return { ...parsed, _raw: text, _retrieved: { terms: terms.map(t=>t.term), docs: docs.map(d=>d.name) } }
  } catch {
    return { answer: text, retrieved_terms: [], retrieved_docs: [], confidence: 'unknown', followup: [], _raw: text }
  }
}

// ── 메인 ─────────────────────────────────────────────────────────
const CACHE_PATH = 'ollama_results.json'
let results = {}
try {
  results = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'))
  const done = Object.keys(results)
  if (done.length) console.log(`\n캐시 로드: ${done.join(', ')} — 완료된 항목 스킵`)
} catch { /* 첫 실행 */ }

function save() { writeFileSync(CACHE_PATH, JSON.stringify(results, null, 2)) }
function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

const available = await checkOllamaModels()

for (const model of MODELS) {
  // 모델 존재 여부 확인
  const found = available.find(a => a.includes(model.id) || a === model.tag || a.startsWith(model.id))
  if (!found) {
    console.log(`⚠ 모델 없음: ${model.name} (${model.tag}) — 스킵`)
    console.log(`  ollama pull ${model.tag} 로 다운로드 후 재실행`)
    continue
  }
  const actualTag = found  // 실제 Ollama에 등록된 이름 사용

  console.log(`\n${'='.repeat(50)}`)
  console.log(`모델: ${model.name} (${actualTag})`)
  console.log('='.repeat(50))

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i]
    const cacheKey = `${model.id}_${tc.id}`

    if (results[cacheKey] && !results[cacheKey].skipped) {
      console.log(`  [${tc.id}] 캐시 사용`)
      continue
    }

    console.log(`\n  [${tc.id}] "${tc.question.slice(0, 40)}..."`)
    try {
      console.log('    baseline 호출...')
      const bl = await generateBaseline(actualTag, tc.question, tc.history || [])
      await delay(1000)

      console.log('    v1 (RAG) 호출...')
      const v1 = await generateV1(actualTag, tc.question, tc.history || [])
      await delay(1000)

      results[cacheKey] = {
        model_id: model.id,
        model_name: model.name,
        model_tag: actualTag,
        tc_id: tc.id,
        tc_label: tc.label,
        question: tc.question,
        baseline: { answer: bl.answer },
        v1: {
          answer: v1.answer,
          confidence: v1.confidence,
          retrieved_terms: v1.retrieved_terms,
          retrieved_docs: v1.retrieved_docs,
          followup: v1.followup,
        },
        rag_retrieved: v1._retrieved || {},
      }
      save()
      console.log(`    ✅ 저장 완료`)
    } catch (e) {
      console.error(`    ❌ 오류: ${e.message}`)
      results[cacheKey] = { skipped: true, error: e.message }
      save()
    }

    if (i < TEST_CASES.length - 1) await delay(2000)
  }
}

// ── 결과 미리보기 ─────────────────────────────────────────────────
console.log('\n\n' + '='.repeat(50))
console.log('실행 결과 미리보기')
console.log('='.repeat(50))

for (const model of MODELS) {
  const modelResults = Object.values(results).filter(r => r.model_id === model.id && !r.skipped)
  if (!modelResults.length) continue

  console.log(`\n[ ${model.name} ]`)
  for (const r of modelResults) {
    const hasUrl = /https?:\/\//.test(r.v1?.answer || '')
    const hasPct = /\d+(\.\d+)?%/.test(r.v1?.answer || '')
    const blHasPct = /\d+(\.\d+)?%/.test(r.baseline?.answer || '')
    console.log(`  ${r.tc_id}: conf=${r.v1?.confidence} | URL=${hasUrl?'✅':'❌'} | %수치 bl=${blHasPct?'있음':'없음'}→v1=${hasPct?'있음':'없음'}`)
    console.log(`    BL: ${(r.baseline?.answer||'').slice(0,60)}...`)
    console.log(`    V1: ${(r.v1?.answer||'').slice(0,60)}...`)
  }
}

console.log(`\n✅ 완료. ollama_results.json 을 JupyterHub의 report/ 폴더에 업로드하세요.`)
