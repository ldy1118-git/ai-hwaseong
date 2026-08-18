/**
 * Vercel Serverless Function: POST /api/llm
 *
 * 환경변수 (Vercel 대시보드 → Settings → Environment Variables):
 *   GROQ_API_KEY    gsk_...
 *   GEMINI_API_KEY  AQ. ...
 *
 * 요청 본문: { prompt, system?, json?, model?, history?, schema? }
 * 응답:      { text, model }
 */

const GROQ_ENDPOINT   = 'https://api.groq.com/openai/v1/chat/completions'
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'

// groq/compound 는 내부 레이블 → 실제 모델로 변환
const GROQ_MODEL_MAP = {
  'groq/compound': 'llama-3.3-70b-versatile',
}

function extractJson(text) {
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) return codeBlock[1].trim()
  const raw = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (raw) return raw[1].trim()
  return text
}

async function callGroq({ key, model, system, prompt, wantJson, history }) {
  const messages = []
  if (system) messages.push({ role: 'system', content: system })
  for (const turn of history) {
    const role = ['mars', 'bot', 'model', 'assistant'].includes(turn.role) ? 'assistant' : 'user'
    const content = turn.text || turn.content || ''
    if (content) messages.push({ role, content: String(content) })
  }
  messages.push({ role: 'user', content: prompt })

  const body = { model, messages, temperature: 0 }
  if (wantJson) body.response_format = { type: 'json_object' }

  const r = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const detail = await r.text()
    throw new Error(`Groq ${r.status}: ${detail.slice(0, 300)}`)
  }
  const result = await r.json()
  return result.choices?.[0]?.message?.content ?? ''
}

async function callGemini({ key, model, system, prompt, wantJson, history, schema }) {
  const contents = []
  for (const turn of history) {
    const role = ['mars', 'bot', 'model', 'assistant'].includes(turn.role) ? 'model' : 'user'
    const text = turn.text || turn.content || ''
    if (text) contents.push({ role, parts: [{ text: String(text) }] })
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] })

  const body = { contents, generationConfig: { temperature: 0 } }
  if (system) body.systemInstruction = { parts: [{ text: system }] }
  if (wantJson) {
    body.generationConfig.responseMimeType = 'application/json'
    if (schema) body.generationConfig.responseSchema = schema
  }

  const url = GEMINI_ENDPOINT.replace('{model}', model)
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const detail = await r.text()
    throw new Error(`Gemini ${r.status}: ${detail.slice(0, 300)}`)
  }
  const result = await r.json()
  const parts = result.candidates?.[0]?.content?.parts ?? []
  return parts.map(p => p.text ?? '').join('')
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    prompt,
    system   = '',
    json: wantJson = false,
    model:  rawModel,
    history  = [],
    schema,
  } = req.body ?? {}

  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt가 필요합니다' })

  const rawModelStr = rawModel || 'groq/compound'
  const useGemini   = rawModelStr.startsWith('gemini')
  const model       = useGemini
    ? rawModelStr
    : (GROQ_MODEL_MAP[rawModelStr] ?? rawModelStr)

  try {
    let text
    if (useGemini) {
      const key = process.env.GEMINI_API_KEY
      if (!key) return res.status(503).json({ error: 'GEMINI_API_KEY 환경변수가 없습니다' })
      text = await callGemini({ key, model, system, prompt, wantJson, history, schema })
    } else {
      const key = process.env.GROQ_API_KEY
      if (!key) return res.status(503).json({ error: 'GROQ_API_KEY 환경변수가 없습니다' })
      text = await callGroq({ key, model, system, prompt, wantJson, history })
    }

    if (wantJson) text = extractJson(text)
    return res.status(200).json({ text, model })
  } catch (err) {
    const status = err.message.includes('401') ? 401 : 502
    return res.status(status).json({ error: err.message })
  }
}
