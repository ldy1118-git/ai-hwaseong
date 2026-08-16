const R = 42
const C = 2 * Math.PI * R  // ≈ 263.9

export default function OrbitProgressBar({ checked, total }) {
  const progress = total === 0 ? 0 : checked / total

  const dashOffset = C * (1 - progress)

  // 별 도트 위치: 12시 방향(-90°) 기준, progress만큼 회전
  const angleDeg = progress * 360 - 90
  const angleRad = (angleDeg * Math.PI) / 180
  const dotX = (50 + R * Math.cos(angleRad)).toFixed(2)
  const dotY = (50 + R * Math.sin(angleRad)).toFixed(2)

  const label =
    progress === 0
      ? '서류를 하나씩 준비해봐요'
      : progress === 1
      ? '모든 서류 준비 완료!'
      : `${Math.round(progress * 100)}% 완료됐어요`

  return (
    <div className="flex flex-col items-center py-6">
      <svg
        viewBox="0 0 100 100"
        width="160"
        height="160"
        className="overflow-visible"
        aria-label={`진행률 ${Math.round(progress * 100)}%`}
      >
        {/* 배경 궤도 링 (점선) */}
        <circle
          cx="50" cy="50" r={R}
          fill="none"
          stroke="#c1af9b"
          strokeWidth="3"
          strokeDasharray="5 8"
        />

        {/* 진행 호 */}
        <circle
          cx="50" cy="50" r={R}
          fill="none"
          stroke="#cb6b3d"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />

        {/* 호 끝의 별 도트 */}
        {progress > 0 && (
          <circle
            cx={dotX}
            cy={dotY}
            r="5"
            fill="#fbe281"
            stroke="#cb6b3d"
            strokeWidth="1.5"
            style={{ transition: 'cx 0.5s ease, cy 0.5s ease' }}
          />
        )}

        {/* 12시 방향 시작점 도트 */}
        <circle cx="50" cy={50 - R} r="3.5" fill="#c1af9b" />

        {/* 중앙 숫자 */}
        <text
          x="50" y="45"
          textAnchor="middle"
          fontSize="22"
          fontWeight="700"
          fill="#2a3c77"
          fontFamily="Inter, sans-serif"
        >
          {checked}
        </text>
        <text
          x="50" y="57"
          textAnchor="middle"
          fontSize="9"
          fill="#c1af9b"
          fontFamily="Inter, sans-serif"
        >
          / {total} 완료
        </text>
      </svg>

      <p className="text-sm font-semibold text-navy mt-1">{label}</p>
    </div>
  )
}
