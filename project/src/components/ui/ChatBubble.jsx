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
                         text-warm-gray/70 text-[12px] font-bold leading-none
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

/* ── RAG 신뢰도 ───────────────────────────────────────────
 *
 * 모델은 "high"/"medium"/"low" 라는 **문자열**을 돌려준다(프롬프트 규칙 3).
 * 그런데 여기서 `Math.round(confidence * 100)` 을 하고 있었다. 문자열에
 * 100을 곱하면 NaN 이라, 배포된 화면의 모든 답변 아래에
 * 「RAG 신뢰도 NaN%」가 붙어 있었다.
 *
 * 없는 퍼센트를 지어내지 않는다. 모델이 준 세 단계를 그대로 말로 적는다. */
const CONFIDENCE = {
  high:   { label: '근거 충분',   dot: 'bg-emerald-400' },
  medium: { label: '근거 부분적', dot: 'bg-amber-400'   },
  low:    { label: '근거 부족',   dot: 'bg-warm-gray'   },
}

function ConfidenceBadge({ value }) {
  const c = CONFIDENCE[value]
  if (!c) return null   // 'unknown' — 판단할 수 없으면 아무 말도 안 한다
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}`} />
      <span className="text-[12px] text-warm-text">{c.label}</span>
    </span>
  )
}

/* ── 답의 근거 ────────────────────────────────────────────
 *
 * 공고는 눌러서 상세로 갈 수 있게 한다. 제목만 적어두면 사장님이 그걸
 * 다시 목록에서 찾아야 한다. */
function Sources({ sources, onOpenNotice }) {
  if (!sources) return null
  const { notices = [], names = [] } = sources
  if (!notices.length && !names.length) return null

  // gap 이 10px 이상이어야 한다. `.tap` 이 위아래로 5px 씩 덮개를 까는데
  // 그보다 좁으면 줄바꿈됐을 때 아래윗줄 것이 겹쳐서, 제대로 눌러도 다른
  // 공고가 열린다(project/CLAUDE.md 「누를 자리를 넓힐 때」).
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
      <span className="text-[12px] text-warm-text flex-shrink-0">근거</span>
      {notices.map(n => (
        <button
          key={n.id}
          onClick={() => onOpenNotice?.(n.id)}
          className="tap max-w-[15rem] truncate text-[12px] text-navy underline decoration-navy/30
                     underline-offset-2 hover:decoration-navy transition-colors"
          title={n.title}
        >
          📄 {n.title}
        </button>
      ))}
      {names.map((n, i) => (
        <span key={i} className="text-[12px] text-warm-text bg-warm-gray/15 rounded px-1.5 py-0.5">
          {n}
        </span>
      ))}
    </div>
  )
}

/* ── 메시지 말풍선 ────────────────────────────────────── */
export default function ChatBubble({ message, onOpenNotice }) {
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

        {/* 무엇을 읽고 답했는지 + 그걸로 충분했는지 */}
        {(CONFIDENCE[message.confidence] || message.sources) && (
          <div className="mt-2 pt-2 border-t border-warm-gray/20">
            <ConfidenceBadge value={message.confidence} />
            <Sources sources={message.sources} onOpenNotice={onOpenNotice} />
          </div>
        )}
      </div>
    </div>
  )
}
