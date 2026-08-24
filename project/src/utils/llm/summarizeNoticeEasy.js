import { generateText } from './llmProvider.js'

const MOCK = localStorage.getItem('mars-mock') === 'true'

export const MOCK_EASY_SUMMARY = {
  what: '이 사업은 화성시 소상공인 사장님들이 안정적으로 가게를 운영할 수 있도록 은행보다 훨씬 낮은 이자로 돈을 빌려주는 프로그램이에요! 자격만 되면 최대 3천만 원까지 빌릴 수 있고, 화성시 소상공인지원센터에서 도와드린답니다.',
  benefits: [
    '최대 3천만 원 저금리 융자 지원',
    '일반 은행 대출보다 낮은 이자율 적용',
    '화성시 소상공인이라면 누구나 신청 가능',
  ],
  caution: '업력 1년 이상인 사업장만 신청할 수 있으니, 창업 초기라면 다른 지원사업을 알아보세요!',
}

async function delayMs(ms) { return new Promise(r => setTimeout(r, ms)) }

/**
 * 공고 하나를 받아 사장님이 바로 이해할 수 있는 쉬운 설명으로 바꿔준다.
 * @param {object} item - fetchMatches 결과 한 건
 * @returns {{ what: string, benefits: string[], caution: string|null }}
 */
export async function summarizeNoticeEasy(item) {
  if (MOCK) { await delayMs(1000); return MOCK_EASY_SUMMARY }

  const met = (item.condition_results ?? [])
    .filter(c => c.status === '충족')
    .map(c => c.detail)
    .join('\n')

  const systemPrompt = `당신은 화성시 소상공인을 위한 AI 경영동행 서비스의 캐릭터 마이다(Mar-DA)입니다.
복잡한 지원사업 공고를 소상공인 사장님이 1분 만에 이해할 수 있도록 쉽게 정리하는 것이 특기예요.

규칙:
1. 행정용어(융자, 지원한도, 과세표준 등)는 최소화하고, 꼭 써야 할 때는 괄호로 쉬운 말을 덧붙이세요.
2. "~해요", "~랍니다", "~드려요" 처럼 친근하고 따뜻한 말투를 쓰세요.
3. 혜택은 금액·기간·비율 등 구체적인 숫자를 반드시 포함하세요.
4. what은 2~3문장, 너무 길지 않게 써주세요.`

  const userPrompt = `아래 지원사업 공고를 보고 사장님이 바로 이해할 수 있게 정리해주세요.

공고명: ${item.notice_title}
내용: ${item.summary ?? '내용 없음'}
소관기관: ${item.organizer ?? ''}
수행기관: ${item.operator ?? ''}
${met ? `\n사장님이 이미 충족한 조건:\n${met}` : ''}

다음 JSON 형식으로만 답해주세요:
{
  "what": "이 사업이 무엇인지 2~3문장 쉬운 설명 (~해요 말투)",
  "benefits": ["혜택1 (금액·기간 등 구체적으로)", "혜택2", "혜택3"],
  "caution": "주의할 점 한 문장 (없으면 null)"
}`

  const text = await generateText({ systemPrompt, userPrompt, jsonMode: true })
  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return { what: text, benefits: [], caution: null }
  }
}
