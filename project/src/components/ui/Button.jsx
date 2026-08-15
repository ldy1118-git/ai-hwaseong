const variants = {
  navy: 'bg-navy text-white hover:bg-navy/90 active:bg-navy/80',
  'sunset-orange': 'bg-sunset-orange text-white hover:bg-sunset-orange/90 active:bg-sunset-orange/80',
  outline: 'border border-navy text-navy bg-transparent hover:bg-navy/5',
  ghost: 'text-navy bg-transparent hover:bg-navy/5',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-base',
  lg: 'px-7 py-3.5 text-lg',
}

export default function Button({
  children,
  variant = 'navy',
  size = 'md',
  fullWidth = false,
  disabled = false,
  onClick,
  type = 'button',
  className = '',
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-full font-medium',
        'transition-all duration-150 select-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40',
        'disabled:opacity-40 disabled:pointer-events-none',
        variants[variant] ?? variants.navy,
        sizes[size] ?? sizes.md,
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}
