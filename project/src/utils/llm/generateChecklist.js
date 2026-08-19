import { SchemaType } from '@google/generative-ai'
import { generateText, GEMINI_MODEL } from './llmProvider.js'
import { todayKR } from '../today.js'
import { MOCK_CHECKLIST, delay } from '../../mocks/index.js'

const MOCK = localStorage.getItem('mars-mock') === 'true'

export const MODEL_NAME = GEMINI_MODEL

// ── 응답 스키마 ───────────────────────────────────────────────────
const CHECKLIST_ITEM_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    step:           { type: SchemaType.INTEGER },
    document:       { type: SchemaType.STRING },
    required_type:  { type: SchemaType.STRING },
    how_to_get:     { type: SchemaType.STRING, nullable: true },
    how_to_get_offline: { type: SchemaType.STRING, nullable: true },
    fee:            { type: SchemaType.STRING, nullable: true },
    estimated_time: { type: SchemaType.STRING, nullable: true },
    url:            { type: SchemaType.STRING, nullable: true },
    caution:        { type: SchemaType.STRING, nullable: true },
    confidence:     { type: SchemaType.STRING },
    verify_note:    { type: SchemaType.STRING, nullable: true },
  },
  required: ['step', 'document', 'required_type', 'confidence'],
}

const PENDING_CONDITION_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    condition:    { type: SchemaType.STRING },
    detail:       { type: SchemaType.STRING },
    ask_user:     { type: SchemaType.STRING },
  },
  required: ['condition', 'detail', 'ask_user'],
}

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    program_name:       { type: SchemaType.STRING },
    overall_status:     { type: SchemaType.STRING },
    status_reason:      { type: SchemaType.STRING, nullable: true },
    checklist:          { type: SchemaType.ARRAY, items: CHECKLIST_ITEM_SCHEMA },
    pending_conditions: { type: SchemaType.ARRAY, items: PENDING_CONDITION_SCHEMA },
    important_notes:    { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    estimated_prep_days: { type: SchemaType.INTEGER, nullable: true },
    contact:            { type: SchemaType.STRING, nullable: true },
    apply_method:       { type: SchemaType.STRING, nullable: true },
  },
  required: ['program_name', 'overall_status', 'checklist', 'pending_conditions', 'important_notes'],
}

// ── RAG: terms.json 문서 조회 ─────────────────────────────────────
/**
 * expected_documents 목록을 terms.json documents[]에서 찾아 발급 정보를 주입
 * @returns {{ matched: object[], unmatched: object[] }}
 */
export function buildDocumentRAG(expectedDocuments, termsData) {
  if (!Array.isArray(expectedDocuments)) return { matched: [], unmatched: [] }
  const docsData = termsData?.documents || []
  const matched = []
  const unmatched = []

  for (const expDoc of expectedDocuments) {
    const found = docsData.find(d =>
      d.name === expDoc.name ||
      (d.aliases || []).some(a => a === expDoc.name)
    )
    if (found) {
      matched.push({ ...expDoc, rag: found })
    } else {
      unmatched.push(expDoc)
    }
  }

  return { matched, unmatched }
}

function formatRAGContext(matched, unmatched) {
  const lines = []

  if (matched.length > 0) {
    lines.push('=== 서류 발급 정보 (검증된 데이터) ===')
    for (const doc of matched) {
      const r = doc.rag
      lines.push(`\n[${r.name}]`)
      lines.push(`  설명: ${r.easy}`)
      if (r.issue?.online?.length > 0) {
        lines.push(`  온라인 발급: ${r.issue.online.join(' / ')}`)
      }
      if (r.issue?.offline?.length > 0) {
        lines.push(`  오프라인: ${r.issue.offline.join(' / ')}`)
      }
      if (r.issue?.fee) lines.push(`  수수료: ${r.issue.fee}`)
      if (r.issue?.time) lines.push(`  소요시간: ${r.issue.time}`)
      if (r.issue?.url) lines.push(`  URL: ${r.issue.url}`)
      if (r.caution) lines.push(`  주의: ${r.caution}`)
      if (!r.verified) lines.push(`  ⚠ 발급 정보 미검증 — 접수기관에 재확인 권장`)
      lines.push(`  조건부 여부: ${doc.required_type} / 신뢰도: ${doc.confidence}`)
      if (doc.trigger_reason) lines.push(`  조건부 이유: ${doc.trigger_reason}`)
    }
  }

  if (unmatched.length > 0) {
    lines.push('\n=== 발급 정보 미확인 서류 (직접 문의 필요) ===')
    for (const doc of unmatched) {
      lines.push(`  - ${doc.name} (${doc.required_type}, confidence: ${doc.confidence})`)
      if (doc.trigger_reason) lines.push(`    조건: ${doc.trigger_reason}`)
    }
  }

  return lines.join('\n')
}

function formatMatchingContext(matchingOutput) {
  const condition_results  = matchingOutput.condition_results  ?? []
  const overall_status     = matchingOutput.overall_status     ?? '확인필요'
  const expected_documents = matchingOutput.expected_documents ?? []
  const notice_id          = matchingOutput.notice_id          ?? '-'
  const pending = condition_results.filter(c => c.status === '확인필요')
  const failed  = condition_results.filter(c => c.status === '불충족')
  const passed  = condition_results.filter(c => c.status === '충족')

  const lines = [
    `공고 ID: ${notice_id}`,
    `종합 판정: ${overall_status}`,
    '',
    '=== 조건 판정 결과 ===',
    ...passed.map(c => `  [충족] ${c.condition}: ${c.detail}`),
    ...failed.map(c => `  [불충족] ${c.condition}: ${c.detail}`),
    ...pending.map(c => `  [확인필요] ${c.condition}: ${c.detail}`),
    '',
    `=== 예상 서류 목록 (${expected_documents.length}건) ===`,
    ...expected_documents.map(d =>
      `  - ${d.name} (${d.required_type}, confidence: ${d.confidence}${d.trigger_reason ? ', 조건: ' + d.trigger_reason : ''})`
    ),
  ]

  return lines.join('\n')
}

function formatNoticeContext(noticeJson) {
  const lines = [
    `공고명: ${noticeJson.title}`,
    `접수기간: ${noticeJson.apply_period?.start} ~ ${noticeJson.apply_period?.end}`,
    `접수방법: ${noticeJson.apply_method || '미기재'}`,
    `문의처: ${noticeJson.contact || '미기재'}`,
    `운영기관: ${noticeJson.operator || '미기재'}`,
    `요약: ${noticeJson.summary}`,
  ]
  return lines.join('\n')
}

// ── Baseline: RAG 없이 LLM만으로 체크리스트 생성 ─────────────────
export async function generateChecklistBaseline(matchingOutput, noticeJson) {
  const userPrompt = `
당신은 소상공인 지원사업 신청을 돕는 어시스턴트입니다.
아래 매칭 결과와 공고 정보를 보고, 사용자가 신청하기 위해 준비해야 할 서류 체크리스트를 JSON으로 작성하세요.

${formatNoticeContext(noticeJson)}

${formatMatchingContext(matchingOutput)}

각 서류에 대해 발급 방법, 소요 시간, 수수료, 주의사항을 안내하세요.
확인필요 조건이 있으면 pending_conditions에 사용자에게 물어볼 내용을 담으세요.

다음 JSON 구조로만 출력하세요:
{"program_name":"...","overall_status":"...","checklist":[{"step":1,"document":"...","required_type":"...","how_to_get":"...","fee":"...","estimated_time":"...","url":"...","caution":"...","confidence":"..."}],"pending_conditions":[{"condition":"...","detail":"...","ask_user":"..."}],"important_notes":["..."]}
`.trim()

  const text = await generateText({ userPrompt, jsonMode: true })
  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    return { raw: text, parsed: JSON.parse(cleaned), error: null }
  } catch {
    return { raw: text, parsed: null, error: 'JSON parse failed' }
  }
}

// ── V1: terms.json RAG + 시스템 프롬프트 + JSON 강제 출력 ─────────
export async function generateChecklistV1(matchingOutput, noticeJson, termsData) {
  if (MOCK) { await delay(1200); return MOCK_CHECKLIST }
  if (!matchingOutput) throw new Error('매칭 결과가 없어요. 지원사업 탭에서 공고를 선택해 주세요.')

  const systemPrompt = `당신은 화성시 소상공인 신청동행 어시스턴트입니다.
아래 규칙을 반드시 지키세요.

1. 서류 발급 정보는 반드시 제공된 RAG 데이터를 사용하고, 직접 지식으로 보완하지 마세요.
2. RAG 데이터에 없는 서류의 how_to_get은 null로 두고 verify_note에 "접수기관에 직접 문의 필요" 기재.
3. confidence=estimated인 서류는 verify_note에 "공고 원문 확인 또는 접수기관 문의 권장" 기재.
4. 확인필요 조건은 pending_conditions에 빠짐없이 담고 ask_user에 사용자에게 물어볼 문장을 작성.
5. 오늘 날짜는 ${todayKR()}. 접수 기간이 이미 종료됐으면 important_notes에 경고.
6. 없는 서류를 추가하지 말 것. expected_documents에 있는 서류만 체크리스트에 포함.`

  const { matched, unmatched } = buildDocumentRAG(
    matchingOutput.expected_documents,
    termsData
  )

  const userPrompt = `공고 정보:
${formatNoticeContext(noticeJson)}

매칭 결과:
${formatMatchingContext(matchingOutput)}

서류 발급 정보 (RAG):
${formatRAGContext(matched, unmatched)}

위 정보를 바탕으로 신청 서류 체크리스트를 다음 JSON 구조로 작성하세요:
{"program_name":"...","overall_status":"신청가능|조건부|확인필요","status_reason":"...","checklist":[{"step":1,"document":"서류명","required_type":"필수|조건부","how_to_get":"발급방법 또는 null","how_to_get_offline":"오프라인방법 또는 null","fee":"수수료 또는 null","estimated_time":"소요시간 또는 null","url":"URL 또는 null","caution":"주의사항 또는 null","confidence":"confirmed|estimated","verify_note":"검증노트 또는 null"}],"pending_conditions":[{"condition":"조건명","detail":"상세","ask_user":"사용자에게 물어볼 문장"}],"important_notes":["주의사항"],"estimated_prep_days":숫자또는null,"contact":"문의처 또는 null","apply_method":"신청방법 또는 null"}`

  const text = await generateText({ systemPrompt, userPrompt, jsonMode: true, responseSchema: RESPONSE_SCHEMA })
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    return { raw: text, parsed: JSON.parse(cleaned), error: null, matched, unmatched }
  } catch {
    return { raw: text, parsed: null, error: 'JSON parse failed', matched, unmatched }
  }
}
