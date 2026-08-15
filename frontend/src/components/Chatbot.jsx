import { useState, useRef, useEffect } from 'react'
import { MessageCircle, Send, ChevronDown } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { generateChatbotResponseV1 } from '../utils/generateChatbotResponse'
import termsData from '../data/terms.json'

const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY

const QUICK_QUESTIONS = [
  '부가세 신고 기간이 언제예요?',
  '지원사업 신청 서류는?',
  '이차보전이 뭐예요?',
  '사업자등록 방법 알려줘',
]

function Message({ msg, onFollowup }) {
  const isBot = msg.role === 'bot'
  return (
    <div className={`flex gap-2 ${isBot ? 'justify-start' : 'justify-end'}`}>
      {isBot && (
        <div className="w-7 h-7 rounded-full bg-hwaseong-blue flex items-center justify-center shrink-0 mt-1">
          <span className="text-white text-xs font-bold">AI</span>
        </div>
      )}
      <div className={`flex flex-col gap-1.5 ${isBot ? 'items-start' : 'items-end'} max-w-[80%]`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
            isBot
              ? 'bg-white border border-gray-100 text-gray-800 shadow-sm'
              : 'bg-hwaseong-blue text-white'
          }`}
        >
          {msg.text}
          {isBot && (
            <p className="text-[10px] text-gray-400 mt-1">
              ⚠ AI 초안, 최종 확인 필요
            </p>
          )}
        </div>
        {isBot && msg.followup?.length > 0 && (
          <div className="flex flex-col gap-1 w-full">
            {msg.followup.map((q, i) => (
              <button
                key={i}
                onClick={() => onFollowup(q)}
                className="text-left text-xs text-hwaseong-blue bg-hwaseong-light border border-blue-200 rounded-xl px-3 py-1.5 hover:bg-blue-100 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Chatbot() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([
    { id: 1, role: 'bot', text: '안녕하세요! 화성시 경영동행 AI예요 👋\n세무, 지원사업, 상권 정보를 알려드릴게요.\n무엇이든 편하게 물어보세요!' },
  ])
  const [typing, setTyping] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  const hideFAB = location.pathname.startsWith('/onboarding')

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      inputRef.current?.focus()
    }
  }, [open, messages])

  async function sendMessage(text) {
    if (!text.trim() || typing) return
    const userMsg = { id: Date.now(), role: 'user', text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setTyping(true)

    if (!GROQ_KEY) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'bot',
        text: '⚠️ API 키가 설정되지 않았어요. .env 파일에 VITE_GROQ_API_KEY를 설정해 주세요.',
      }])
      setTyping(false)
      return
    }

    // Build history from current messages (skip initial greeting, exclude just-added user msg)
    const history = messages.slice(1).map(m => ({ role: m.role, text: m.text }))

    try {
      const result = await generateChatbotResponseV1(text, history, termsData, GROQ_KEY, 'groq')
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'bot',
        text: result.answer || '죄송해요, 답변을 생성하지 못했어요.',
        followup: result.followup || [],
      }])
    } catch (err) {
      console.error('Chatbot API error:', err)
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'bot',
        text: '죄송해요, 일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.',
      }])
    } finally {
      setTyping(false)
    }
  }

  if (hideFAB) return null

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-8 right-8 z-50 w-14 h-14 rounded-full bg-hwaseong-blue text-white shadow-xl flex items-center justify-center hover:bg-blue-700 transition-colors"
          aria-label="챗봇 열기"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed right-0 top-0 h-screen w-96 z-50 flex flex-col bg-white shadow-2xl border-l border-gray-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-hwaseong-blue text-white">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-sm font-bold">AI</span>
              </div>
              <div>
                <p className="font-semibold text-sm">화성 경영동행 AI</p>
                <p className="text-xs text-blue-100">세무·지원사업·상권 전담 안내</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1">
              <ChevronDown size={24} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
            {messages.map(msg => (
              <Message key={msg.id} msg={msg} onFollowup={q => sendMessage(q)} />
            ))}
            {typing && (
              <div className="flex gap-2 justify-start">
                <div className="w-7 h-7 rounded-full bg-hwaseong-blue flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">AI</span>
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex gap-1 items-center h-4">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick questions */}
          <div className="px-4 py-2 flex gap-2 overflow-x-auto bg-white border-t border-gray-100">
            {QUICK_QUESTIONS.map(q => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="shrink-0 text-xs bg-hwaseong-light text-hwaseong-blue px-3 py-1.5 rounded-full border border-blue-200"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="px-4 py-3 bg-white border-t border-gray-200 flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
              placeholder="궁금한 것을 물어보세요..."
              className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm outline-none focus:border-hwaseong-blue"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || typing}
              className="w-10 h-10 rounded-full bg-hwaseong-blue text-white flex items-center justify-center disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
