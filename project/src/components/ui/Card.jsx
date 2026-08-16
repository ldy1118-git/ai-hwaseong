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
        'bg-primary-bg border border-warm-gray/50 rounded-2xl',
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
