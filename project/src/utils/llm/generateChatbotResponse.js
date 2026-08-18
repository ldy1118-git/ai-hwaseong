import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import { generateText, GEMINI_MODEL, GROQ_MODEL } from './llmProvider.js'

export const MODEL_NAME = GROQ_MODEL

const SYSTEM_BASE = `당신은 화성시 소상공인을 위한 AI 경영동행 서비스의 캐릭터 **마이다(Mar-DA)**입니다.

페르소나:
- 사장님의 든든한 동료로서, 진심으로 사장님의 성장을 응원합니다.
- 어려운 행정 용어를 사장님이 바로 이해할 수 있는 '지구어(일상어)'로 번역해 드리는 것이 특기입니다.
- 말투는 "~해요", "~했답니다!", "~드릴게요!" 처럼 따뜻하고 든든한 동료처럼 말합니다.
- 절대 딱딱하거나 관료적인 표현은 쓰지 않습니다.

역할:
- 화성시 소상공인의 세무 신고, 지원사업 신청, 상권 정보를 안내합니다.
- 예비창업자(창업 전 단계)도 지원합니다.

답변 원칙:
- 항상 한국어로, 짧고 친절하게 답변합니다.
- 행정 용어가 나오면 반드시 지구어로 풀어서 함께 설명합니다. 예) '부가가치세 과세표준'→'쉽게 말하면 세금을 매기는 기준 매출액이에요!'
- 구체적인 날짜, 금액, 절차를 포함합니다.
- 모르는 내용은 솔직하게 "마이다도 이 부분은 정확히 모르겠어요!"라고 하고 관련 기관 연락처를 안내합니다.
- 답변 마지막에 사장님을 응원하는 짧은 한 마디를 자연스럽게 덧붙여요.`

// ── 응답 스키마 (v1 전용) ─────────────────────────────────────────
const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    answer:          { type: SchemaType.STRING },
    retrieved_terms: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    retrieved_docs:  { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    confidence:      { type: SchemaType.STRING },
    followup:        { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
  },
  required: ['answer', 'retrieved_terms', 'retrieved_docs', 'confidence', 'followup'],
}

// ════════════════════════════════════════════════════════════════
// RAG: 키워드 기반 컨텍스트 검색
// ════════════════════════════════════════════════════════════════

function scoreText(question, ...candidates) {
  const q = question.replace(/[?!。\s,]+/g, '').toLowerCase()
  let score = 0
  for (const candidate of candidates) {
    if (!candidate) continue
    const c = candidate.replace(/[·\s]+/g, '').toLowerCase()
    // 완전 포함
    if (q.includes(c) || c.includes(q)) { score += 3; continue }
    // 부분 2글자 이상 공통
    for (let len = 2; len <= c.length; len++) {
      for (let start = 0; start <= c.length - len; start++) {
        if (q.includes(c.slice(start, start + len))) { score += 1; break }
      }
    }
  }
  return score
}

/**
 * terms.json의 terms[]와 documents[]에서 질문과 관련된 항목을 검색
 * @returns {{ terms: object[], docs: object[] }}
 */
export function retrieveContext(question, termsData) {
  const termsArr = termsData?.terms || []
  const docsArr  = termsData?.documents || []

  const scoredTerms = termsArr
    .map(t => ({ ...t, _score: scoreText(question, t.term, ...(t.aliases || [])) }))
    .filter(t => t._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 3)

  const scoredDocs = docsArr
    .map(d => ({ ...d, _score: scoreText(question, d.name, ...(d.aliases || [])) }))
    .filter(d => d._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 3)

  return { terms: scoredTerms, docs: scoredDocs }
}

function formatTermContext(terms) {
  if (!terms.length) return ''
  const lines = ['=== 관련 용어 정의 (RAG) ===']
  for (const t of terms) {
    lines.push(`\n[${t.term}]`)
    lines.push(`  쉬운 설명: ${t.easy}`)
    if (t.detail) lines.push(`  상세: ${t.detail}`)
    if (t.example) lines.push(`  예시: ${t.example}`)
    if (t.caution) lines.push(`  주의: ${t.caution}`)
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
    if (d.issue?.fee) lines.push(`  수수료: ${d.issue.fee}`)
    if (d.issue?.time) lines.push(`  소요시간: ${d.issue.time}`)
    if (d.issue?.url) lines.push(`  URL: ${d.issue.url}`)
    if (d.caution) lines.push(`  주의: ${d.caution}`)
    if (!d.verified) lines.push(`  ⚠ 발급 정보 미검증 — 접수기관에 재확인 권장`)
  }
  return lines.join('\n')
}

// ════════════════════════════════════════════════════════════════
// Baseline: RAG 없이 LLM 단독 (현재 챗봇과 동일한 방식)
// ════════════════════════════════════════════════════════════════

export async function generateChatbotResponseBaseline(question, history) {
  const text = await generateText({
    model: GROQ_MODEL,
    systemPrompt: SYSTEM_BASE,
    userPrompt: question,
    history,
  })
  return {
    answer: text,
    retrieved_terms: [],
    retrieved_docs: [],
    confidence: 'unknown',
    followup: [],
  }
}

// ════════════════════════════════════════════════════════════════
// V1: RAG + 시스템 프롬프트 + JSON 강제 출력
// ════════════════════════════════════════════════════════════════

export async function generateChatbotResponseV1(question, history, termsData) {
  const { terms, docs } = retrieveContext(question, termsData)

  const termCtx = formatTermContext(terms)
  const docCtx  = formatDocContext(docs)
  const hasContext = terms.length > 0 || docs.length > 0

  const systemPrompt = `${SYSTEM_BASE}

추가 규칙 (반드시 준수):
1. 아래 RAG 데이터에 있는 내용은 그것을 근거로 답변하세요.
2. RAG 데이터에 없는 금액·날짜·URL·절차는 추측하지 말고 "마이다도 이 부분은 공고나 담당 기관에서 직접 확인하시는 게 좋을 것 같아요!"라고 하세요.
3. confidence 필드: RAG 데이터로 충분히 답변 가능하면 "high", 부분적이면 "medium", 없으면 "low".
4. retrieved_terms/retrieved_docs는 실제로 답변에 활용한 항목 이름만 기재.
5. followup은 사장님이 이어서 물어볼 법한 질문 1~2개. 마이다 말투로 작성.
6. 오늘 날짜는 2026년 8월 17일.
7. RAG 데이터에 url이 있으면 answer에 반드시 포함하세요 (예: "https://..." 형태로).
8. RAG 데이터에 caution이 있으면 answer에 자연스럽게 안내하세요.
9. RAG 데이터에 "⚠ 발급 정보 미검증" 표시가 있으면 answer에 "⚠ 발급처·수수료 정보는 아직 마이다가 검증 못 한 내용이라, 접수 기관에 한 번 더 확인해 주세요!"를 포함하세요.
${hasContext ? `\n${termCtx}\n${docCtx}` : '\n=== RAG 데이터 없음 — 위 규칙 2번 적용 ==='}

응답 JSON 구조: {"answer":"답변 텍스트","retrieved_terms":["사용한 용어명"],"retrieved_docs":["사용한 서류명"],"confidence":"high|medium|low","followup":["후속질문1","후속질문2"]}`

  const text = await generateText({
    model: GROQ_MODEL,
    systemPrompt,
    userPrompt: question,
    history,
    jsonMode: true,
    responseSchema: RESPONSE_SCHEMA,
  })

  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned)
    return { ...parsed, _raw: text, _retrieved: { terms, docs } }
  } catch {
    return { answer: text, retrieved_terms: [], retrieved_docs: [], confidence: 'unknown', followup: [], _raw: text }
  }
}
