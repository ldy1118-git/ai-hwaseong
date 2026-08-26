import { useRef, useEffect, useState } from 'react'

const STEPS  = ['정책 매칭', '서류 준비', '정책 신청', '신청 완료']
const PATH_D = 'M 30 78 C 110 22 250 22 330 78'

function bz(t, p0, p1, p2, p3) {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

const NODES = [0, 1 / 3, 2 / 3, 1].map(t => ({
  x: bz(t, 30, 110, 250, 330),
  y: bz(t, 78, 22, 22, 78),
  labelBelow: t === 0 || t === 1,
}))

// 행성 색상 — 완료·현재는 화성 계열, 미래는 차갑고 먼 행성
const PLANET = {
  done:    { body: '#cb6b3d', ring: '#e8a87c', highlight: 'rgba(255,220,180,0.35)' },
  current: { body: '#f97316', ring: '#fed7aa', highlight: 'rgba(255,240,200,0.4)' },
  future:  { body: '#9ca3af', ring: '#d1d5db', highlight: 'rgba(255,255,255,0.15)' },
}

function Planet({ cx, cy, status, idx }) {
  const p   = PLANET[status]
  const r   = 9
  const rx  = 15
  const ry  = 3.8
  const clipId = `planet-clip-${idx}`

  return (
    <>
      <defs>
        {/* 링의 앞쪽(아래) 절반만 잘라낸다 */}
        <clipPath id={clipId}>
          <rect x={cx - 22} y={cy - 0.5} width={44} height={22} />
        </clipPath>
      </defs>

      {/* 현재 행성 — 대기 글로우 */}
      {status === 'current' && (
        <circle cx={cx} cy={cy} r={20} fill="#f97316" className="planet-glow" />
      )}

      {/* 링 — 뒤쪽(행성보다 먼저 그려서 행성이 덮는다) */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry}
        fill="none" stroke={p.ring} strokeWidth={2.2}
        opacity={status === 'future' ? 0.55 : 0.9}
      />

      {/* 행성 본체 */}
      <circle cx={cx} cy={cy} r={r} fill={p.body} />

      {/* 하이라이트 (빛 반사) */}
      <circle cx={cx - 2.5} cy={cy - 2.5} r={3.2} fill={p.highlight} />

      {/* 링 — 앞쪽(행성 위에 그린다) */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry}
        fill="none" stroke={p.ring} strokeWidth={2.2}
        opacity={status === 'future' ? 0.55 : 0.9}
        clipPath={`url(#${clipId})`}
      />

      {/* 완료: 체크 */}
      {status === 'done' && (
        <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">✓</text>
      )}

      {/* 미래: 번호 */}
      {status === 'future' && (
        <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize="9" fill="white" opacity="0.75" fontWeight="600">
          {idx + 1}
        </text>
      )}

      {/* 현재: 마이다 로켓 정박 */}
      {status === 'current' && (
        <>
          {/* 착지 다리 */}
          <line x1={cx} y1={cy - r} x2={cx} y2={cy - r - 7} stroke="#fed7aa" strokeWidth={1.2} strokeLinecap="round" />
          {/* 로켓 */}
          <text x={cx} y={cy - r - 6} textAnchor="middle" fontSize="13" style={{ userSelect: 'none' }}>🚀</text>
        </>
      )}
    </>
  )
}

export default function OrbitProgressBar({ checked, total, applied = false }) {
  const pathRef  = useRef(null)
  const [len, setLen] = useState(338)

  useEffect(() => {
    if (pathRef.current) setLen(pathRef.current.getTotalLength())
  }, [])

  const ratio      = total > 0 ? checked / total : 0
  const fillRatio  = applied ? 1 : Math.min(1 / 3 + ratio / 3, 2 / 3)
  const dashOffset = len - fillRatio * len

  function nodeStatus(i) {
    if (applied) return i < 3 ? 'done' : 'current'
    if (i === 0) return 'done'
    if (i === 1) return ratio >= 1 ? 'done' : 'current'
    if (i === 2) return ratio >= 1 ? 'current' : 'future'
    return 'future'
  }

  return (
    <div className="px-3 pt-1">
      <style>{`
        @keyframes planetGlow {
          0%, 100% { opacity: 0.12; transform: scale(1); }
          50%       { opacity: 0.24; transform: scale(1.18); }
        }
        .planet-glow {
          animation: planetGlow 2.5s ease-in-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
      `}</style>

      <svg viewBox="0 0 360 120" className="w-full overflow-visible" aria-hidden="true">
        {/* 트랙 */}
        <path d={PATH_D} stroke="#E5E7EB" strokeWidth="4.5" fill="none" strokeLinecap="round" />

        {/* 진행 채움 */}
        <path
          ref={pathRef}
          d={PATH_D}
          stroke="#f97316"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)' }}
        />

        {NODES.map(({ x, y, labelBelow }, i) => {
          const status = nodeStatus(i)
          const p      = PLANET[status]
          const ly     = labelBelow ? y + 26 : y - 30

          return (
            <g key={i}>
              <Planet cx={x} cy={y} status={status} idx={i} />

              {/* 스텝 레이블 */}
              <text
                x={x} y={ly}
                textAnchor="middle"
                fontSize="11"
                fontWeight={status === 'current' ? '700' : '400'}
                fill={status === 'future' ? '#9CA3AF' : p.body}
                fontFamily="'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif"
              >
                {STEPS[i]}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
