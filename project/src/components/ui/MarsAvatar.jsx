import marsImg from '../../../design/mars.png'

const sizes = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
  xl: 'w-20 h-20',
}

export default function MarsAvatar({
  size = 'md',
  alt = 'Mars',
  className = '',
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full overflow-hidden flex-shrink-0',
        'ring-2 ring-star-yellow ring-offset-1',
        'bg-white',
        onClick ? 'cursor-pointer hover:ring-sunset-orange transition-all duration-150' : 'cursor-default',
        sizes[size] ?? sizes.md,
        className,
      ].join(' ')}
      aria-label={alt}
    >
      <img
        src={marsImg}
        alt={alt}
        className="w-full h-full object-contain p-0.5"
      />
    </button>
  )
}
