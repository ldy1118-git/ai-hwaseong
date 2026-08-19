import { useRef, useEffect, useState } from 'react'

// 4단계: 정책 매칭 → 서류 준비 → 정책 신청 → 신청 완료
// 베지어 경로: M 30 78 C 110 22 250 22 330 78
const STEPS   = ['정책 매칭', '서류 준비', '정책 신청', '신청 완료']
const PATH_D  = 'M 30 78 C 110 22 250 22 330 78'
const ORANGE  = '#F97316'

// 3차 베지어 점 계산 (P0=30,78  P1=110,22  P2=250,22  P3=330,78)
function bz(t, p0, p1, p2, p3) {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

const NODES = [0, 1 / 3, 2 / 3, 1].map(t => ({
  x: bz(t, 30, 110, 250, 330),
  y: bz(t, 78, 22, 22, 78),
  labelBelow: t === 0 || t === 1,
}))

export default function OrbitProgressBar({ checked, total }) {
  const pathRef  = useRef(null)
  const [len, setLen] = useState(338)

  useEffect(() => {
    if (pathRef.current) setLen(pathRef.current.getTotalLength())
  }, [])

  const ratio = total > 0 ? checked / total : 0

  // 세그먼트 0→1: 항상 채워짐 (매칭 완료)
  // 세그먼트 1→2: ratio 비율로 채워짐 (서류 준비 중)
  const fillRatio  = Math.min(1 / 3 + ratio / 3, 2 / 3)
  const dashOffset = len - fillRatio * len

  function nodeStatus(i) {
    if (i === 0) return 'done'
    if (i === 1) return ratio >= 1 ? 'done' : 'current'
    if (i === 2) return ratio >= 1 ? 'current' : 'future'
    return 'future'
  }

  return (
    <div className="px-3 pt-1">
      <svg viewBox="0 0 360 108" className="w-full overflow-visible" aria-hidden="true">
        {/* 트랙 */}
        <path
          d={PATH_D}
          stroke="#E5E7EB"
          strokeWidth="4.5"
          fill="none"
          strokeLinecap="round"
        />

        {/* 채워진 진행 */}
        <path
          ref={pathRef}
          d={PATH_D}
          stroke={ORANGE}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)' }}
        />

        {NODES.map(({ x, y, labelBelow }, i) => {
          const status    = nodeStatus(i)
          const isDone    = status === 'done'
          const isCurrent = status === 'current'
          const isFilled  = isDone || isCurrent
          const ly        = labelBelow ? y + 20 : y - 14

          return (
            <g key={i}>
              {/* 현재 노드 글로우 */}
              {isCurrent && (
                <circle cx={x} cy={y} r="13" fill={ORANGE} opacity="0.15" />
              )}

              {/* 노드 원 */}
              <circle
                cx={x} cy={y} r="8"
                fill={isFilled ? ORANGE : '#E5E7EB'}
                stroke="white"
                strokeWidth="2.5"
                style={{ transition: 'fill 0.4s ease' }}
              />

              {/* 완료: 체크 */}
              {isDone && (
                <text x={x} y={y + 4.5} textAnchor="middle" fontSize="11" fill="white" fontWeight="bold">
                  ✓
                </text>
              )}

              {/* 미래: 번호 */}
              {status === 'future' && (
                <text x={x} y={y + 4.5} textAnchor="middle" fontSize="11" fill="#9CA3AF" fontWeight="600">
                  {i + 1}
                </text>
              )}

              {/* 스텝 레이블 */}
              <text
                x={x} y={ly}
                textAnchor="middle"
                fontSize="11"
                fontWeight={isCurrent ? '700' : '400'}
                fill={isFilled ? ORANGE : '#9CA3AF'}
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
