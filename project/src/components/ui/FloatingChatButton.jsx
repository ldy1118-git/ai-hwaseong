import marsImg from '../../../design/mars.png'

const STARS = [
  { top: '0px',   left: '8px',  size: 12, delay: '0s' },
  { top: '12px',  right: '-4px', size: 8,  delay: '0.5s' },
  { bottom: '20px', left: '-2px', size: 6, delay: '1s' },
]

function StarIcon({ style, size }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#fbe281"
      style={style}
      className="absolute animate-pulse pointer-events-none"
      aria-hidden
    >
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  )
}

export default function FloatingChatButton({ onClick }) {
  return (
    <div className="fixed bottom-6 right-4 z-50">
      <div className="relative flex flex-col items-center">
        {STARS.map((s, i) => (
          <StarIcon
            key={i}
            size={s.size}
            style={{
              top:    s.top    ?? 'auto',
              bottom: s.bottom ?? 'auto',
              left:   s.left   ?? 'auto',
              right:  s.right  ?? 'auto',
              animationDelay: s.delay,
            }}
          />
        ))}

        {/* 날아가는 캐릭터 — 원형 클립 없이 그대로 */}
        <button
          type="button"
          onClick={onClick}
          aria-label="Mars에게 물어보기"
          className="w-24 h-24 cursor-pointer hover:scale-110 active:scale-95 transition-transform duration-200
                     drop-shadow-[0_6px_16px_rgba(64,43,56,0.25)] focus:outline-none"
        >
          <img src={marsImg} alt="Mars" className="w-full h-full object-contain" />
        </button>

        <span className="mt-1 text-[12px] text-warm-text font-medium whitespace-nowrap">
          Mars에게 물어보기
        </span>
      </div>
    </div>
  )
}
