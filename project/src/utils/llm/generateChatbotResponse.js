import { SchemaType } from '@google/generative-ai'
import { generateText, GROQ_MODEL } from './llmProvider.js'
import { todayKR, todayISO } from '../today.js'
import { nextMockChatbotResponse, delay } from '../../mocks/index.js'
import {
  detectIntent,
  retrieveContext,
  retrieveNotices, formatNoticeContext,
  retrieveTax,     formatTaxContext,
  formatFavoriteContext,
} from './chatRetrieval.js'

export { retrieveContext }

const MOCK = localStorage.getItem('mars-mock') === 'true'

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
    retrieved_notices: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    confidence:      { type: SchemaType.STRING },
    followup:        { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
  },
  required: ['answer', 'retrieved_terms', 'retrieved_docs', 'confidence', 'followup'],
}

// ════════════════════════════════════════════════════════════════
// RAG: 무엇을 읽을지는 chatRetrieval.js 가 고른다
//
// 예전에는 이 파일 안에 scoreText() 가 있었다. 2글자만 겹쳐도 점수를
// 쌓고 이름이 길수록 높은 점수가 나와서, 「이번 달 마감 임박한 공고」에
// '사업장현황신고'가 딸려왔다. 코퍼스도 용어·서류뿐이라 공고를 묻는
// 질문에는 아예 답할 자료가 없었다. 둘 다 chatRetrieval.js 로 옮겼다.
// ════════════════════════════════════════════════════════════════

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

/**
 * userContext: { profile, journey }
 *   profile  — 온보딩에서 받은 사장님 프로필 (category, region, business_status 등)
 *   journey  — getJourney() 결과 { step, candidate, completedSteps }
 * 둘 다 optional. 있으면 시스템 프롬프트에 사장님 현황을 넣어서 더 맞는 답이 나온다.
 */
function buildUserContext({ profile, journey } = {}) {
  if (!profile && !journey) return ''
  const lines = ['\n=== 사장님 현황 ===']

  if (profile) {
    const status = profile.business_status
    lines.push(`- 사업 상태: ${status ?? '미입력'}`)
    if (profile.category)    lines.push(`- 업종: ${profile.category}`)
    if (profile.region)      lines.push(`- 지역: ${profile.region}`)
    if (profile.entity_type) lines.push(`- 사업자 형태: ${profile.entity_type}`)
    if (profile.vat_type)    lines.push(`- 과세유형: ${profile.vat_type}`)
    if (profile.has_employee != null)
      lines.push(`- 직원: ${profile.has_employee ? '있음' : '없음(혼자 운영)'}`)
  }

  if (journey?.candidate) {
    const c = journey.candidate
    lines.push(`- 창업 후보 업종: ${c.category ?? '미정'}`)
    if (c.address || c.region) lines.push(`- 창업 검토 지역: ${c.address ?? c.region}`)
    if (c.score != null)       lines.push(`- 상권 적합도: ${c.score}점`)
  }

  if (journey) {
    const step = journey.currentStep ?? journey.step
    if (step) lines.push(`- 현재 창업 단계: STEP ${step} (1=아이디어, 7=운영중)`)
  }

  return lines.join('\n')
}

/**
 * @param {string} question
 * @param {Array}  history   [{role:'user'|'bot', text}]
 * @param {object} termsData data/terms.json
 * @param {object} userContext
 *   profile  — 온보딩 프로필. 세무일정 계산과 답변 구체화에 같이 쓴다
 *   journey  — getJourney() 결과
 *   matches  — fetchMatches() 의 results[]. **이게 있어야 공고를 답할 수 있다.**
 *              없으면 예전처럼 용어·서류만 보고 답한다 (화면이 안 깨진다)
 */
export async function generateChatbotResponseV1(question, history, termsData, userContext = {}) {
  if (MOCK) { await delay(800); return nextMockChatbotResponse() }

  const { profile, matches } = userContext
  const today  = todayISO()
  const intent = detectIntent(question)

  // ── 무엇을 읽을지 고른다 ──────────────────────────────────────
  const { terms, docs } = retrieveContext(question, termsData)
  const notices = retrieveNotices(question, matches, intent, today)
  // 세무는 질문이 세무 쪽일 때만 넣는다. 늘 넣으면 서류 발급을 물었는데
  // 답 끝에 부가세 신고기한이 따라붙는다.
  const taxes   = intent.tax ? retrieveTax(profile, today) : []
  const favCtx  = intent.favorite ? formatFavoriteContext() : ''

  const blocks = [
    formatTermContext(terms),
    formatDocContext(docs),
    formatNoticeContext(notices, today),
    formatTaxContext(taxes, today),
    favCtx,
  ].filter(Boolean)

  const ctxBlock = buildUserContext(userContext)

  const systemPrompt = `${SYSTEM_BASE}${ctxBlock}

추가 규칙 (반드시 준수):
1. 아래 RAG 데이터에 있는 내용은 그것을 근거로 답변하세요.
2. RAG 데이터에 없는 금액·날짜·URL·절차는 추측하지 말고 "마이다도 이 부분은 공고나 담당 기관에서 직접 확인하시는 게 좋을 것 같아요!"라고 하세요.
3. confidence 필드: RAG 데이터로 충분히 답변 가능하면 "high", 부분적이면 "medium", 없으면 "low".
4. retrieved_terms/retrieved_docs/retrieved_notices는 실제로 답변에 활용한 항목 이름만 기재. 공고는 제목을 그대로 적으세요.
5. followup은 사장님이 이어서 물어볼 법한 질문 1~2개. 마이다 말투로 작성.
6. 오늘 날짜는 ${todayKR()}.
7. RAG 데이터에 url이 있으면 answer에 반드시 포함하세요 (예: "https://..." 형태로).
8. RAG 데이터에 caution이 있으면 answer에 자연스럽게 안내하세요.
9. RAG 데이터에 "⚠ 발급 정보 미검증" 표시가 있으면 answer에 "⚠ 발급처·수수료 정보는 아직 마이다가 검증 못 한 내용이라, 접수 기관에 한 번 더 확인해 주세요!"를 포함하세요.
10. "사장님 현황" 블록이 있으면 그 업종·지역·단계에 맞게 답변을 구체화하세요.

지원사업을 안내할 때:
11. **공고는 아래 목록에 있는 것만 말하세요.** 목록에 없는 사업명을 지어내면 안 됩니다. 사장님이 그 이름으로 검색하다 하루를 버립니다.
12. 목록에 있는 공고를 소개하되 판정이 "신청가능"인 것부터 적으세요. 한 건마다 이 모양으로 씁니다.
    📌 공고 제목
       마감 D-n (마감일이 없으면 "마감일 미정") · 판정
       무엇을 지원하는지 한 줄
13. 판정이 "확인필요"면 그렇게 밝히고, "확인필요"에 적힌 것을 **사장님이 무엇을 확인해야 하는지**로 한 줄 풀어 적으세요(예: "제조업 위주 사업이라 카페도 되는지 문의처에 물어봐야 해요"). 되는 것처럼 말하지 마세요.
14. 마감일이 "마감일 미정"인 공고에 날짜를 지어 붙이지 마세요.
15. 목록에 공고가 하나도 없으면 "지금 조건에 맞는 건 못 찾았어요"라고 솔직히 말하고, 프로필을 채우면 더 잘 찾는다고 안내하세요. 이때 confidence 는 "low" 입니다.
16. 목록 앞뒤로 사장님에게 건네는 한 마디를 잊지 마세요. 목록만 툭 던지지 않습니다.

${blocks.length ? blocks.join('\n\n') : '=== RAG 데이터 없음 — 위 규칙 2번 적용 ==='}

응답 JSON 구조: {"answer":"답변 텍스트","retrieved_terms":["사용한 용어명"],"retrieved_docs":["사용한 서류명"],"retrieved_notices":["사용한 공고 제목"],"confidence":"high|medium|low","followup":["후속질문1","후속질문2"]}`

  const text = await generateText({
    systemPrompt,
    userPrompt: question,
    history,
    jsonMode: true,
    responseSchema: RESPONSE_SCHEMA,
  })

  // 실제로 무엇을 읽고 답했는지. 화면이 이걸로 출처를 그린다 —
  // 「출처 표기 ON」이라고 뱃지를 달아놓고 출처를 안 보여주고 있었다.
  const retrieved = {
    terms,
    docs,
    notices,
    taxes,
    // 사장님이 실제로 열어볼 수 있게 공고 번호를 같이 준다.
    noticeRefs: notices.map(n => ({ id: n.notice_id, title: n.notice_title })),
  }

  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned)
    return { ...parsed, _raw: text, _retrieved: retrieved }
  } catch {
    // JSON 이 깨져도 답변 본문은 살린다. 파싱 실패가 곧 응답 실패는 아니다.
    return {
      answer: text, retrieved_terms: [], retrieved_docs: [], retrieved_notices: [],
      confidence: 'unknown', followup: [], _raw: text, _retrieved: retrieved,
    }
  }
}
