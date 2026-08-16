/**
 * Gemini / Groq 공용 LLM 호출 레이어
 * provider: 'gemini' | 'groq'
 */
import Groq from 'groq-sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const GROQ_MODEL   = 'llama-3.3-70b-versatile'
export const GEMINI_MODEL = 'gemini-3.6-flash'

/**
 * @param {object} opts
 * @param {'gemini'|'groq'} opts.provider
 * @param {string}  opts.apiKey
 * @param {string}  [opts.model]
 * @param {string}  [opts.systemPrompt]
 * @param {string}  opts.userPrompt
 * @param {boolean} [opts.jsonMode]       JSON 출력 강제
 * @param {object}  [opts.responseSchema] Gemini 전용 스키마 (Groq는 무시)
 * @param {Array}   [opts.history]        멀티턴 [{role:'user'|'bot', text}]
 * @returns {Promise<string>}  모델 응답 텍스트
 */
export async function generateText({
  provider = 'gemini',
  apiKey,
  model,
  systemPrompt = '',
  userPrompt,
  jsonMode = false,
  responseSchema = null,
  history = [],
}) {
  if (provider === 'groq') {
    return _callGroq({ apiKey, model: model || GROQ_MODEL, systemPrompt, userPrompt, jsonMode, history })
  }
  return _callGemini({ apiKey, model: model || GEMINI_MODEL, systemPrompt, userPrompt, jsonMode, responseSchema, history })
}

// ── Groq ─────────────────────────────────────────────────────────
async function _callGroq({ apiKey, model, systemPrompt, userPrompt, jsonMode, history }) {
  const client = new Groq({ apiKey, dangerouslyAllowBrowser: true })

  const messages = []
  if (systemPrompt) {
    // jsonMode면 시스템 프롬프트에 JSON 출력 지시 추가
    const jsonInstruction = jsonMode ? '\n\n반드시 유효한 JSON만 출력하세요. 다른 텍스트는 절대 포함하지 마세요.' : ''
    messages.push({ role: 'system', content: systemPrompt + jsonInstruction })
  }

  for (const h of history) {
    messages.push({ role: h.role === 'bot' ? 'assistant' : 'user', content: h.text })
  }
  messages.push({ role: 'user', content: userPrompt })

  const opts = { model, messages, temperature: 0, max_tokens: 2048 }
  if (jsonMode) opts.response_format = { type: 'json_object' }

  const completion = await client.chat.completions.create(opts)
  return completion.choices[0].message.content
}

// ── Gemini ───────────────────────────────────────────────────────
async function _callGemini({ apiKey, model, systemPrompt, userPrompt, jsonMode, responseSchema, history }) {
  const genAI = new GoogleGenerativeAI(apiKey)

  const config = { temperature: 0 }
  if (jsonMode) {
    config.responseMimeType = 'application/json'
    if (responseSchema) config.responseSchema = responseSchema
  }

  const geminiModel = genAI.getGenerativeModel({
    model,
    ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
    generationConfig: config,
  })

  const geminiHistory = history.map(h => ({
    role: h.role === 'bot' ? 'model' : 'user',
    parts: [{ text: h.text }],
  }))

  if (geminiHistory.length > 0) {
    const chat = geminiModel.startChat({ history: geminiHistory })
    const result = await chat.sendMessage(userPrompt)
    return result.response.text()
  }

  const result = await geminiModel.generateContent(userPrompt)
  return result.response.text()
}
