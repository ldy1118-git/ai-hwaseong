import { useState, useRef, useEffect } from 'react'
import Header from '../components/layout/Header'
import ChatBubble from '../components/ui/ChatBubble'
import MarsAvatar from '../components/ui/MarsAvatar'
import { generateChatbotResponseV1 } from '../utils/llm/generateChatbotResponse'
import termsData from '../data/terms.json'

// API 키는 서버에만 둔다. VITE_ 환경변수는 빌드 결과물에 그대로 박혀서
// 배포하면 누구나 꺼낼 수 있다. LLM 호출은 llmProvider 가 /api/llm 으로 넘긴다.
const GEMINI_KEY = null

/* ── 상황별 추천 칩 ──────────────────────────────────── */
const SUGGESTION_CHIPS = [
  { emoji: '💰', text: '지금 신청 가능한 지원사업 알려줘' },
  { emoji: '📋', text: '부가세 신고 서류가 뭐야?' },
  { emoji: '🏪', text: '화성시 소상공인 지원금 있어?' },
  { emoji: '📝', text: '임차료 지원 신청 방법 알려줘' },
  { emoji: '🤔', text: '조건 충족 여부 어떻게 확인해?' },
  { emoji: '⏰', text: '이번 달 마감 임박한 공고 알려줘' },
]

/* ── 초기 메시지 ─────────────────────────────────────── */
const INITIAL_MESSAGES = [
  {
    id: 1,
    role: 'mars',
    text: '안녕하세요, 사장님! 저는 마이다(Mar-DA)예요 🌟\n지원사업 신청·서류 준비·행정 용어 번역까지, 사장님 곁에서 든든하게 함께할게요!\n\n어려운 공문서 용어도 마이다가 쉬운 지구어로 바꿔드린답니다. 노란 단어를 탭해보세요!',
    terms: {},
    followup: ['신청할 수 있는 지원사업이 있나요?', '서류 준비는 어디서부터 시작하면 되나요?'],
  },
]

/* ── retrieved_terms 배열 → { 용어명: 쉬운설명 } ────────── */
function buildTermsDict(retrievedTermNames) {
  const dict = {}
  for (const name of retrievedTermNames) {
    const found = termsData.terms?.find(
      t => t.term === name || (t.aliases ?? []).includes(name)
    )
    if (found) dict[found.term] = found.easy
  }
  return dict
}

/* ── 마이다 생각 중 버블 ──────────────────────────────── */
function ThinkingBubble() {
  return (
    <div className="flex items-end gap-2">
      <MarsAvatar size="sm" alt="마이다" />
      <div className="bg-white border border-warm-gray/30 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1 items-center">
          {[0, 0.15, 0.3].map((delay, i) => (
            <span key={i}
              className="w-1.5 h-1.5 rounded-full bg-warm-gray/60 animate-bounce"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── 팔로업 칩 (메시지 하단 추천 질문) ──────────────────── */
function FollowupChips({ questions, onSelect }) {
  if (!questions?.length) return null
  return (
    <div className="flex flex-wrap gap-2 pl-10 mt-1.5">
      {questions.map((q, i) => (
        <button
          key={i}
          onClick={() => onSelect(q)}
          className="text-xs border border-navy/25 text-navy rounded-full px-3 py-1.5
                     bg-white hover:bg-navy/5 transition-colors"
        >
          {q}
        </button>
      ))}
    </div>
  )
}

/* ── 상황별 추천 칩 (입력창 상단, 항상 표시) ──────────── */
function SuggestionChips({ onSelect }) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-0.5"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <style>{`.suggestion-scroll::-webkit-scrollbar { display: none; }`}</style>
      {SUGGESTION_CHIPS.map((chip, i) => (
        <button
          key={i}
          onClick={() => onSelect(chip.text)}
          className="flex-shrink-0 flex items-center gap-1.5 text-xs font-medium
                     bg-white border border-navy/20 text-navy rounded-full
                     px-3 py-2 hover:border-navy/50 hover:bg-navy/5
                     active:scale-[0.97] transition-all"
        >
          <span>{chip.emoji}</span>
          <span className="whitespace-nowrap">{chip.text}</span>
        </button>
      ))}
    </div>
  )
}

/* ── 메인 페이지 ─────────────────────────────────────── */
export default function MissionControl() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const bottomRef               = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg = { id: Date.now(), role: 'user', text: trimmed, terms: {} }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const history = messages.map(m => ({
        role: m.role === 'mars' ? 'bot' : 'user',
        text: m.text,
      }))

      const result = await generateChatbotResponseV1(
        trimmed,
        history,
        termsData,
        GEMINI_KEY,
        'gemini'
      )

      setMessages(prev => [...prev, {
        id:         Date.now() + 1,
        role:       'mars',
        text:       result.answer,
        terms:      buildTermsDict(result.retrieved_terms ?? []),
        followup:   result.followup  ?? [],
        confidence: result.confidence,
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        id:       Date.now() + 1,
        role:     'mars',
        text:     `앗, 마이다가 잠깐 연결이 끊겼어요. 조금 뒤에 다시 말 걸어주세요!\n(${err.message})`,
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

      {/* ── 페이지 헤더 ── */}
      <div className="max-w-4xl w-full mx-auto px-5 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-navy">마이다 지령실</h1>
            <p className="text-xs text-warm-text mt-0.5">
              노란 단어를 탭하면 쉬운 지구어로 설명해드려요
            </p>
          </div>
          {/* 출처 표기 ON 뱃지 */}
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200
                          rounded-full px-3 py-1.5 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            <span className="text-[11px] font-semibold text-emerald-600 whitespace-nowrap">출처 표기 ON</span>
          </div>
        </div>
      </div>

      {/* ── 대화 목록 ── */}
      <main className="flex-1 overflow-y-auto max-w-4xl w-full mx-auto px-4 py-2 space-y-3"
            style={{ paddingBottom: '9rem' }}>
        {messages.map(msg => (
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

      {/* ── 하단 입력 영역 (고정) ── */}
      <div className="fixed bottom-0 left-0 right-0 z-30
                      bg-primary-bg/95 backdrop-blur-sm
                      border-t border-warm-gray/25">
        <div className="max-w-4xl mx-auto px-4 pt-3 pb-4 space-y-2.5">

          {/* 상황별 추천 칩 */}
          <SuggestionChips onSelect={text => sendMessage(text)} />

          {/* 입력창 + 전송 버튼 */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="마이다에게 무엇이든 물어보세요..."
              disabled={loading}
              className="flex-1 bg-white border border-navy/25 rounded-2xl px-4 py-2.5
                         text-sm text-navy placeholder:text-warm-gray/60
                         focus:outline-none focus:border-navy/60 focus:ring-2 focus:ring-navy/10
                         disabled:opacity-50 transition-colors"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              className="flex-shrink-0 bg-navy text-white text-sm font-bold
                         px-5 py-2.5 rounded-2xl shadow-md
                         hover:bg-navy/80 active:scale-[0.97]
                         disabled:opacity-40 disabled:pointer-events-none
                         transition-all"
            >
              전송
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
