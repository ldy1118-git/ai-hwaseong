import { useCallback, useEffect, useId, useRef } from 'react'

/**
 * 돌려서 고르는 휠. 시각을 고를 때 쓴다.
 *
 * **스크롤은 브라우저가 하고, 우리는 칠하기만 한다.** scroll-snap 으로
 * 칸에 딱 붙게 두고, 스크롤 위치를 보고 가운데에서 먼 칸일수록 눕히고
 * 흐리게 그린다. 그래서 곡면처럼 보인다. 직접 관성을 계산하면 손가락을
 * 뗐을 때의 느낌이 기기마다 달라진다.
 *
 * **손가락으로만 쓰게 두지 않는다.** 칸 하나하나가 진짜 버튼이라 탭으로
 * 옮겨 다니고 엔터로 고를 수 있고, 화면낭독기가 「오전 8시, 선택됨」이라고
 * 읽는다. div 로 만들면 그게 다 안 된다.
 */

const ITEM = 40          // 한 칸 높이(px)
const VISIBLE = 5        // 보이는 칸 수. 홀수여야 가운데가 생긴다
const PAD = ITEM * ((VISIBLE - 1) / 2)

export default function WheelPicker({
  values, value, onChange, label, format = String, width = 96,
}) {
  const boxRef = useRef(null)
  const itemRefs = useRef([])
  // 우리가 스크롤을 옮기는 중에는 onChange 를 부르지 않는다. 안 그러면
  // 값 바꾸기 → 스크롤 → 값 바꾸기로 서로를 부른다.
  const movingRef = useRef(false)
  const settleRef = useRef(0)
  const listId = useId()

  const index = Math.max(0, values.indexOf(value))

  /** 스크롤 위치를 보고 칸마다 각도·크기·투명도를 준다. */
  const paint = useCallback(() => {
    const box = boxRef.current
    if (!box) return
    const center = box.scrollTop / ITEM          // 칸 단위 위치
    itemRefs.current.forEach((node, i) => {
      if (!node) return
      const d = i - center                       // 가운데에서 몇 칸 떨어졌나
      const far = Math.min(Math.abs(d), 2.6)
      node.style.transform = `rotateX(${d * -24}deg) scale(${(1 - far * 0.12).toFixed(3)})`
      node.style.opacity = Math.max(0.16, 1 - far * 0.36).toFixed(3)
    })
  }, [])

  /** 바깥에서 값이 바뀌면 그 칸으로 옮긴다(처음 그릴 때 포함). */
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const top = index * ITEM
    if (Math.abs(box.scrollTop - top) < 1) { paint(); return }
    movingRef.current = true
    box.scrollTo({ top, behavior: 'auto' })
    paint()
    // 스크롤 이벤트가 한 번 더 오고 나서 풀어준다
    requestAnimationFrame(() => { movingRef.current = false })
  }, [index, paint])

  const onScroll = () => {
    paint()
    if (movingRef.current) return
    // 멈춘 뒤에 고른다. 지나가는 칸마다 부르면 스크롤 한 번에 열 번 바뀐다.
    clearTimeout(settleRef.current)
    settleRef.current = setTimeout(() => {
      const box = boxRef.current
      if (!box) return
      const i = Math.round(box.scrollTop / ITEM)
      const next = values[Math.max(0, Math.min(values.length - 1, i))]
      if (next !== undefined && next !== value) onChange(next)
    }, 120)
  }

  const onKeyDown = e => {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const i = Math.max(0, Math.min(values.length - 1, index + step))
    if (values[i] !== value) onChange(values[i])
  }

  return (
    <div className="relative select-none" style={{ width }}>
      {/* 고른 칸 자리. 스크롤과 무관하게 가운데에 늘 있다. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 z-10 rounded-lg bg-navy/[0.06]
                   ring-1 ring-navy/15"
        style={{ top: PAD, height: ITEM }}
      />
      {/* 위아래를 흐리게 덮어 원통처럼 보이게 한다 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20"
        style={{
          background:
            'linear-gradient(to bottom, var(--wheel-fade, #fff) 0%, transparent 32%,' +
            ' transparent 68%, var(--wheel-fade, #fff) 100%)',
        }}
      />
      <div
        ref={boxRef}
        role="listbox"
        aria-label={label}
        aria-activedescendant={`${listId}-${index}`}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        className="hide-scrollbar overflow-y-auto overscroll-contain outline-none
                   focus-visible:ring-2 focus-visible:ring-navy/40 rounded-xl"
        style={{
          height: ITEM * VISIBLE,
          scrollSnapType: 'y mandatory',
          perspective: 420,
          paddingTop: PAD,
          paddingBottom: PAD,
        }}
      >
        {values.map((v, i) => (
          <button
            key={v}
            id={`${listId}-${i}`}
            ref={el => { itemRefs.current[i] = el }}
            type="button"
            role="option"
            aria-selected={v === value}
            tabIndex={-1}
            onClick={() => { if (v !== value) onChange(v) }}
            className="flex w-full items-center justify-center text-[15px] font-bold text-navy
                       will-change-transform"
            style={{ height: ITEM, scrollSnapAlign: 'center', transformOrigin: 'center' }}
          >
            {format(v)}
          </button>
        ))}
      </div>
    </div>
  )
}
