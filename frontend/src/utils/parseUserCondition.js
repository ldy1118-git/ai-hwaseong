import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'

// gemini-2.5-flash: 이 API 키(AQ. 형식, 신규 발급)로는 404 반환 — 신규 사용자 제한
// gemini-3.6-flash: 2026-07-21 출시 최신 workhorse 모델. 별칭 사용 금지(CLAUDE.md 규칙)
export const MODEL_NAME = 'gemini-3.6-flash'

const SYSTEM_INSTRUCTION = `당신은 소상공인 지원사업 매칭 시스템의 조건 파싱 모듈입니다.
사용자의 줄글 입력에서 지원사업 매칭에 필요한 조건 정보를 구조화된 JSON으로 추출하세요.

[파싱 규칙 — 반드시 준수]
1. 언급되지 않은 정보는 절대 임의로 가정하거나 "일반"/"없음"/"0원"으로 단정하지 마세요. 반드시 null로 남기고 missing_fields 배열에 필드명을 추가하세요.
2. 재산·소득 정보는 사용자가 명시적으로 언급한 경우에만 채우세요. 언급이 없으면 반드시 null입니다.
3. 업종이 표준 소상공인 업종 분류에 없는 경우(프리랜서, 1인 창작자, 플랫폼 노동자 등)는 억지로 표준 코드에 매핑하지 말고 원문 그대로 business_type에 기록하고, ambiguous_fields에 "표준 업종 매핑 불가" 이유를 남기세요.
4. 범위나 불확실한 값을 단일 확정값으로 단정하지 마세요.
5. 사용자가 질문하는 형식의 입력(예: "신청 가능한가요?", "마감됐나요?")은 조건 파싱과 무관한 내용이므로, 파악된 필드만 채우고 나머지는 null로 두세요. 질문 내용은 parse_note에 기록하세요.`

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    age: {
      type: SchemaType.NUMBER,
      nullable: true,
      description: '사용자의 만 나이. 언급 없으면 null.',
    },
    region: {
      type: SchemaType.STRING,
      nullable: true,
      description: '사업장 또는 거주 지역명. 언급 없으면 null.',
    },
    business_type: {
      type: SchemaType.STRING,
      nullable: true,
      description: '업종명. 표준 분류 불가 시 원문 그대로. 언급 없으면 null.',
    },
    startup_stage: {
      type: SchemaType.STRING,
      nullable: true,
      description: '"예비창업자" 또는 "기창업자". 명확하지 않으면 null.',
    },
    career_experience: {
      type: SchemaType.STRING,
      nullable: true,
      description: '창업·사업 경력 기술 (예: "없음", "3년"). 언급 없으면 null.',
    },
    income_level: {
      type: SchemaType.STRING,
      nullable: true,
      description: '소득 구간 (기초생활수급자·차상위·일반 등). 명시 없으면 null.',
    },
    asset_status: {
      type: SchemaType.STRING,
      nullable: true,
      description: '재산 상황. 명시 없으면 반드시 null — 절대 가정 금지.',
    },
    business_registration: {
      type: SchemaType.BOOLEAN,
      nullable: true,
      description: '사업자등록 여부. 언급 없으면 null.',
    },
    marital_status: {
      type: SchemaType.STRING,
      nullable: true,
      description: '혼인 상태 (미혼·기혼 등). 언급 없으면 null.',
    },
    missing_fields: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: '언급되지 않아 null로 남은 필드명 목록.',
    },
    ambiguous_fields: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          field: { type: SchemaType.STRING },
          reason: { type: SchemaType.STRING },
        },
        required: ['field', 'reason'],
      },
      description: '매핑 불확실하거나 추가 확인이 필요한 필드와 그 이유.',
    },
    parse_note: {
      type: SchemaType.STRING,
      nullable: true,
      description: '파싱 중 특이사항, 사용자 질문 내용 요약, 또는 추가 확인이 필요한 사항.',
    },
  },
  required: ['missing_fields', 'ambiguous_fields'],
}

/**
 * 사용자 줄글 입력을 구조화된 조건 객체로 파싱합니다.
 * @param {string} rawText - 사용자가 입력한 자유형식 텍스트
 * @param {string} apiKey  - Gemini API 키 (브라우저: import.meta.env.VITE_GEMINI_API_KEY, Node: 직접 전달)
 * @returns {Promise<object>} 파싱된 조건 객체
 */
export async function parseUserCondition(rawText, apiKey) {
  if (!apiKey) throw new Error('Gemini API key가 필요합니다.')
  if (!rawText?.trim()) throw new Error('입력 텍스트가 비어 있습니다.')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  })

  const result = await model.generateContent(rawText)
  const text = result.response.text()
  return JSON.parse(text)
}
