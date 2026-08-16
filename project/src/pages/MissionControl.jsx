import { useState, useRef, useEffect } from 'react'
import Header from '../components/layout/Header'
import ChatBubble from '../components/ui/ChatBubble'
import MarsAvatar from '../components/ui/MarsAvatar'
import Button from '../components/ui/Button'
import { generateChatbotResponseV1 } from '../utils/llm/generateChatbotResponse'
import termsData from '../data/terms.json'

// API 키는 서버에만 둔다. VITE_ 환경변수는 빌드 결과물에 그대로 박혀서
// 배포하면 누구나 꺼낼 수 있다. LLM 호출은 llmProvider 가 /api/llm 으로 넘긴다.
const GEMINI_KEY = null

const INITIAL_MESSAGES = [
  {
    id: 1,
    role: 'mars',
    text: '안녕하세요, 사장님! 저는 Mars예요. 지원사업 신청·서류 준비·행정 용어까지 무엇이든 도와드릴게요.',
    terms: {},
    followup: ['어떤 지원사업을 찾고 계세요?', '서류 준비 방법이 궁금하신가요?'],
  },
]

// retrieved_terms 배열 → { 용어명: 쉬운설명 } 딕셔너리
function buildTermsDict(retrievedTermNames) {
  const dict = {}
  for (const name of retrievedTermNames) {
    const found = termsData.terms.find(
      t => t.term === name || (t.aliases ?? []).includes(name)
    )
    if (found) dict[found.term] = found.easy
  }
  return dict
}

function ThinkingBubble() {
  return (
    <div className="flex items-end gap-2">
      <MarsAvatar size="sm" alt="Mars" />
      <div className="bg-white border border-warm-gray/30 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm">
        <div className="flex gap-1 items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-warm-gray animate-bounce" style={{ animationDelay: '0s' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-warm-gray animate-bounce" style={{ animationDelay: '0.15s' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-warm-gray animate-bounce" style={{ animationDelay: '0.3s' }} />
        </div>
      </div>
    </div>
  )
}

function FollowupChips({ questions, onSelect }) {
  if (!questions?.length) return null
  return (
    <div className="flex flex-wrap gap-2 pl-10 mt-1">
      {questions.map((q, i) => (
        <button
          key={i}
          onClick={() => onSelect(q)}
          className="text-xs border border-navy/30 text-navy rounded-full px-3 py-1.5
                     hover:bg-navy/5 transition-colors"
        >
          {q}
        </button>
      ))}
    </div>
  )
}

export default function MissionControl() {
  const [messages, setMessages]   = useState(INITIAL_MESSAGES)
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const bottomRef                 = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text) {
    if (!text.trim() || loading) return

    const userMsg = { id: Date.now(), role: 'user', text, terms: {} }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const history = messages.map(m => ({
        role: m.role === 'mars' ? 'bot' : 'user',
        text: m.text,
      }))

      const result = await generateChatbotResponseV1(
        text,
        history,
        termsData,
        GEMINI_KEY,
        'gemini'
      )

      const marsMsg = {
        id:         Date.now() + 1,
        role:       'mars',
        text:       result.answer,
        terms:      buildTermsDict(result.retrieved_terms ?? []),
        followup:   result.followup ?? [],
        confidence: result.confidence,
      }
      setMessages(prev => [...prev, marsMsg])
    } catch (err) {
      setMessages(prev => [...prev, {
        id:       Date.now() + 1,
        role:     'mars',
        text:     `일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요.\n(${err.message})`,
        terms:    {},
        followup: [],
      }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="min-h-screen bg-primary-bg flex flex-col">
      <Header />

      <div className="max-w-2xl w-full mx-auto px-5 pt-4 pb-2">
        <h1 className="text-xl font-bold text-navy">챗봇 지령실</h1>
        <p className="text-sm text-warm-text mt-0.5">
          노란 단어를 탭하면 행정 용어 설명이 나와요
        </p>
      </div>

      <main className="flex-1 overflow-y-auto max-w-2xl w-full mx-auto px-4 py-3 pb-28 space-y-3">
        {messages.map((msg, i) => (
          <div key={msg.id}>
            <ChatBubble message={msg} />
            {msg.role === 'mars' && (
              <FollowupChips
                questions={msg.followup}
                onSelect={q => sendMessage(q)}
              />
            )}
          </div>
        ))}
        {loading && <ThinkingBubble />}
        <div ref={bottomRef} />
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-primary-bg border-t border-warm-gray/30 px-4 py-3 z-30">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Mars에게 무엇이든 물어보세요..."
            disabled={loading}
            className="flex-1 bg-white border border-warm-gray/50 rounded-full px-4 py-2.5
                       text-sm text-navy placeholder:text-warm-gray/70
                       focus:outline-none focus:border-navy/50 focus:ring-1 focus:ring-navy/20
                       disabled:opacity-50 transition-colors"
          />
          <Button variant="navy" size="sm" onClick={() => sendMessage(input)} disabled={loading}>
            전송
          </Button>
        </div>
      </div>
    </div>
  )
}
