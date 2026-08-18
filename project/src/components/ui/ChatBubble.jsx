import { useState, useEffect, useRef } from 'react'
import MarsAvatar from './MarsAvatar'

/* ── 행정용어 하이라이트 + 클릭 팝업 ──────────────────── */
function TermHighlight({ term, definition }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('touchstart', onDown, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('touchstart', onDown, true)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline">
      {/* 하이라이트 버튼 */}
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className={[
          'px-1 rounded font-semibold text-navy transition-colors duration-150',
          'focus:outline-none focus:ring-2 focus:ring-star-yellow/70',
          open ? 'bg-star-yellow' : 'bg-star-yellow/60 hover:bg-star-yellow',
        ].join(' ')}
      >
        {term}
      </button>

      {/* 팝업 카드 */}
      {open && (
        <span
          className="absolute z-40 left-0 pointer-events-auto"
          style={{ bottom: 'calc(100% + 10px)', minWidth: '220px', maxWidth: '260px' }}
        >
          <span className="block bg-white border border-star-yellow/40 rounded-2xl shadow-xl px-4 py-3.5 relative">
            {/* 닫기 */}
            <button
              onClick={e => { e.stopPropagation(); setOpen(false) }}
              className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-warm-gray/20
                         text-warm-gray/70 text-[10px] font-bold leading-none
                         flex items-center justify-center hover:bg-warm-gray/40 transition-colors"
            >
              ✕
            </button>

            {/* 마이다 스타일 설명 */}
            <p className="text-sm font-bold text-sunset-orange mb-1.5">이건 외계어예요! 🌟</p>
            <p className="text-xs text-navy leading-relaxed">
              쉬운 말로{' '}
              <span className="font-semibold bg-star-yellow/50 px-0.5 rounded">
                '{definition}'
              </span>
              {' '}라는 뜻이랍니다!
            </p>

            {/* 말풍선 꼬리 */}
            <span
              className="absolute left-4"
              style={{
                top: '100%',
                width: 0, height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: '6px solid white',
              }}
            />
          </span>
        </span>
      )}
    </span>
  )
}

/* ── 텍스트 파싱: 용어 → TermHighlight ────────────────── */
function parseText(text, terms) {
  if (!terms || Object.keys(terms).length === 0) return text

  const escaped = Object.keys(terms).map(t =>
    t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  )
  const pattern = new RegExp(`(${escaped.join('|')})`, 'g')
  const parts   = text.split(pattern)

  return parts.map((part, i) =>
    terms[part]
      ? <TermHighlight key={i} term={part} definition={terms[part]} />
      : part
  )
}

/* ── 메시지 말풍선 ────────────────────────────────────── */
export default function ChatBubble({ message }) {
  const isMars = message.role === 'mars'

  /* 사용자 – 오른쪽, navy 배경 */
  if (!isMars) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] bg-navy text-white text-sm leading-relaxed
                        rounded-2xl rounded-br-sm px-4 py-3 shadow-sm">
          {message.text}
        </div>
      </div>
    )
  }

  /* 마이다 – 왼쪽, 흰색 둥근 말풍선 */
  return (
    <div className="flex items-end gap-2">
      <MarsAvatar size="sm" alt="마이다" />
      <div className="max-w-[78%] bg-white border border-warm-gray/30 text-navy text-sm
                      leading-relaxed rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm
                      whitespace-pre-line">
        {parseText(message.text, message.terms ?? {})}

        {/* RAG 신뢰도 뱃지 */}
        {message.confidence !== undefined && (
          <div className="mt-2 pt-2 border-t border-warm-gray/20 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-[10px] text-warm-text">
              RAG 신뢰도 {Math.round(message.confidence * 100)}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
