export default function Card({
  children,
  className = '',
  onClick,
  padding = 'md',
}) {
  const paddings = { sm: 'p-3', md: 'p-5', lg: 'p-7', none: '' }

  return (
    <div
      onClick={onClick}
      className={[
        // 배경을 흰색으로. 전에는 bg-primary-bg 였는데 페이지 배경이
        // 같은 #fafaf5 라 카드가 바탕에 묻혔다 — 테두리와 그림자로만
        // 겨우 구분돼서 투명해 보였다.
        'bg-white border border-warm-gray/40 rounded-2xl',
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
