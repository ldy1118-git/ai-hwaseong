/**
 * LLM 호출 레이어. 브라우저가 아니라 **우리 서버**를 부른다.
 *
 * 예전에는 여기서 Gemini/Groq SDK 를 직접 불렀는데, 그러려면 API 키가
 * 브라우저에 있어야 한다. VITE_ 로 시작하는 환경변수는 빌드 결과물에
 * 그대로 박혀서, 배포하면 개발자도구를 여는 누구나 키를 꺼낼 수 있다.
 * (실제로 테스트 키를 넣고 빌드했더니 번들 JS 에 평문으로 3번 나왔다.)
 *
 * 그래서 POST /api/llm 으로 우회한다. 키는 Vercel 환경변수에만 있다.
 *
 * **호출부는 바꿀 필요가 없다.** generateText() 의 인자 모양을 그대로
 * 유지했다. apiKey 를 넘겨도 되고(무시된다) 안 넘겨도 된다.
 */

import { apiUrl } from '../api'

export const GROQ_MODEL   = 'llama-3.3-70b-versatile'
export const XAI_MODEL    = 'grok-3'
export const GEMINI_MODEL = 'gemini-3.6-flash'

/**
 * @param {object} opts
 * @param {'groq'|'xai'|'gemini'} [opts.provider]
 *        생략하면 서버가 키가 꽂힌 것 중에서 고른다 (groq → xai → gemini).
 *        하나가 실패하면 다음 것으로 넘어간다. 호출부는 신경 쓸 필요 없다.
 *        'grok' 이라고 써도 xai 로 받아준다 — Groq 과 헷갈리기 쉬워서.
 * @param {string}  [opts.apiKey]            더 이상 쓰지 않는다 (하위호환용)
 * @param {string}  [opts.model]
 * @param {string}  [opts.systemPrompt]
 * @param {string}  opts.userPrompt
 * @param {boolean} [opts.jsonMode]          JSON 출력 강제
 * @param {object}  [opts.responseSchema]    Gemini 전용 스키마
 * @param {Array}   [opts.history]           [{role:'user'|'bot', text}]
 * @returns {Promise<string>} 모델 응답 텍스트
 */
export async function generateText({
  model,
  systemPrompt = '',
  userPrompt,
  jsonMode = false,
  responseSchema = null,
  history = [],
}) {
  const res = await fetch(apiUrl('/api/llm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: userPrompt,
      system: systemPrompt,
      json:   jsonMode,
      // 모델명은 제공자마다 다르다. 여기서 고정해 보내면 다른 제공자로
      // 넘어갔을 때 404 가 난다. 서버가 고르게 둔다.
      ...(model ? { model } : {}),
      schema: responseSchema,
      history,
    }),
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    // 서버가 원인을 문장으로 돌려준다. 그대로 올려보내야 디버깅이 된다.
    throw new Error(data.error || `LLM 호출 실패 (${res.status})`)
  }
  return data.text ?? ''
}
