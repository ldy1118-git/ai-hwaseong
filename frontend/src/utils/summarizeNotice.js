import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'

export const MODEL_NAME = 'gemini-3.6-flash'

// ── 출력 스키마 ──────────────────────────────────────────────────
const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    one_line: {
      type: SchemaType.STRING,
      description: '공고를 30자 이내로 요약한 1줄 설명.',
    },
    support_type: {
      type: SchemaType.STRING,
      nullable: true,
      description: '지원 유형: 자금지원 | 컨설팅 | 교육 | 판로 | 기술지원 | 기타. 판별 불가면 null.',
    },
    support_amount: {
      type: SchemaType.STRING,
      nullable: true,
      description: '지원 금액 또는 규모. 공고에 명시된 경우에만 채움. 없으면 반드시 null.',
    },
    target_summary: {
      type: SchemaType.STRING,
      nullable: true,
      description: '지원 대상 요약. 공고에 명시된 내용만. 모르면 null.',
    },
    key_conditions: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: '핵심 조건 목록. 최대 3개. 없으면 빈 배열.',
    },
    caution: {
      type: SchemaType.STRING,
      nullable: true,
      description: '주의사항(제외 대상, 중복 제한 등). 없으면 null.',
    },
    is_expired: {
      type: SchemaType.BOOLEAN,
      description: '오늘(2026-08-15) 기준 신청 마감이 지났으면 true. apply_period 없으면 false.',
    },
    missing_info: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: '명시되지 않아 null로 남긴 필드 목록.',
    },
  },
  required: ['one_line', 'key_conditions', 'is_expired', 'missing_info'],
}

// ── 용어 glossary (terms.json 기반 간이 매칭) ────────────────────
export function buildGlossary(termsData, text) {
  if (!termsData?.terms) return ''
  const candidates = termsData.terms.flatMap(e =>
    [e.term, ...(e.aliases || [])].map(s => ({ surface: s, entry: e }))
  ).sort((a, b) => b.surface.length - a.surface.length)

  const found = new Map()
  for (const { surface, entry } of candidates) {
    if (text.includes(surface) && !found.has(entry.id)) {
      found.set(entry.id, entry)
    }
  }

  return [...found.values()].slice(0, 12).map(e => {
    let line = `- ${e.term}: ${e.easy}`
    if (e.caution) line += ` (주의: ${e.caution})`
    return line
  }).join('\n')
}

// ── 공통: 공고 텍스트 조립 ────────────────────────────────────────
function buildNoticeText(notice) {
  const period = notice.apply_period
    ? `${notice.apply_period.start ?? '?'} ~ ${notice.apply_period.end ?? '?'}`
    : '미상'
  return [
    `제목: ${notice.title ?? ''}`,
    `신청기간: ${period}`,
    notice.summary ? `내용:\n${notice.summary}` : '내용: (없음)',
  ].join('\n\n')
}

// ════════════════════════════════════════════════════════════════
// Baseline — zero-shot, 시스템 프롬프트 없음, JSON 미강제
// ════════════════════════════════════════════════════════════════
export async function summarizeNoticeBaseline(notice, apiKey) {
  if (!apiKey) throw new Error('API key 없음')
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: { temperature: 0 },
  })

  const prompt =
    `다음 지원사업 공고를 요약해서 JSON으로 알려줘.\n\n` +
    buildNoticeText(notice) +
    `\n\n아래 형식으로 답해줘:\n` +
    `{ "one_line": "...", "support_type": "...", "support_amount": "...", ` +
    `"target_summary": "...", "key_conditions": [...], "caution": "...", ` +
    `"is_expired": true/false, "missing_info": [...] }`

  const result = await model.generateContent(prompt)
  const text = result.response.text()
  // 마크다운 코드블록 제거 후 파싱
  const cleaned = text.replace(/```json?\s*/g, '').replace(/```/g, '').trim()
  return JSON.parse(cleaned)
}

// ════════════════════════════════════════════════════════════════
// v1 — JSON 스키마 강제 + 시스템 프롬프트 + null 규칙 + terms glossary
// ════════════════════════════════════════════════════════════════
const SYSTEM_INSTRUCTION_V1 = `당신은 화성시 소상공인 AI 경영동행 서비스의 공고문 요약 모듈입니다.
지원사업 공고를 소상공인이 한눈에 이해할 수 있도록 구조화해서 요약하세요.

[요약 규칙 — 반드시 준수]
1. 공고에 명시되지 않은 정보는 절대 추가하거나 가정하지 마세요. 반드시 null로 남기고 missing_info에 추가하세요.
2. support_amount: 지원 금액이 공고에 명확히 적혀 있는 경우에만 채우세요. "지원 내용"이 있어도 구체적 금액이 없으면 null입니다.
3. is_expired: 오늘 날짜는 2026년 8월 15일입니다. apply_period.end가 이 날짜보다 이전이면 true, 이후이거나 없으면 false.
4. target_summary: 공고에 나온 대상 조건만 쓰세요. 지역·나이·업종·자격 등 공고에 없는 조건을 추가하지 마세요.
5. key_conditions: 최대 3개. 사용자가 신청 전 가장 먼저 확인해야 할 것.
6. caution: 지원 제외 대상이나 중복 신청 제한 등 사용자가 놓치기 쉬운 주의사항. 없으면 null.
7. HTML 태그, 특수기호(☞, □, ◦, ※), 줄 깨짐이 있는 경우 정돈해서 읽기 좋게 만드세요.`

export async function summarizeNoticeV1(notice, apiKey, termsData = null) {
  if (!apiKey) throw new Error('API key 없음')
  const genAI = new GoogleGenerativeAI(apiKey)

  const noticeText = buildNoticeText(notice)
  const glossary = termsData ? buildGlossary(termsData, noticeText) : ''

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: SYSTEM_INSTRUCTION_V1,
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  })

  const prompt = glossary
    ? `[관련 행정용어]\n${glossary}\n\n[공고]\n${noticeText}`
    : noticeText

  const result = await model.generateContent(prompt)
  return JSON.parse(result.response.text())
}
