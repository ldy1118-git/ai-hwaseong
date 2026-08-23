export default function Card({
  children,
  className = '',
  onClick,
  padding = 'md',
  tone = 'plain',
}) {
  // md(20px)와 sm(12px) 사이가 비어 있었다. 공고 카드는 md 가 커서 목록에
  // 세 장만 들어가는데 sm 은 글자가 벽에 붙는다.
  const paddings = { sm: 'p-3', compact: 'p-4', md: 'p-5', lg: 'p-7', none: '' }

  // 톤은 className 으로 덮지 않고 여기서 고른다. Tailwind 는 클래스를
  // 쓴 순서가 아니라 스타일시트 순서로 이기기 때문에, bg-white 를
  // 밖에서 bg-... 로 덮으면 어느 쪽이 이길지 예측할 수 없다.
  const tones = {
    // 기본 — 흰 면. 페이지 배경(#fafaf5)과 갈라진다.
    plain:  'bg-white border-warm-gray/40',
    // 마감이 급한 것. 왼쪽 색막대 대신 면을 살짝 덥힌다.
    urgent: 'bg-[#fdf6e8] border-sunset-orange/25',
  }

  return (
    <div
      onClick={onClick}
      className={[
        'border rounded-2xl',
        tones[tone] ?? tones.plain,
        'shadow-[0_2px_8px_rgba(42,60,119,0.08)]',
        paddings[padding] ?? paddings.md,
        onClick ? 'cursor-pointer hover:shadow-[0_4px_16px_rgba(42,60,119,0.12)] transition-shadow duration-200' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}
