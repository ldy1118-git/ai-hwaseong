import logoImg from '../../../design/logo.png'
import MarsAvatar from '../ui/MarsAvatar'

export default function Header({
  onAvatarClick,
  className = '',
}) {
  return (
    <header
      className={[
        'w-full bg-primary-bg border-b border-warm-gray/30',
        'px-5 py-3 flex items-center justify-between',
        'sticky top-0 z-40',
        className,
      ].join(' ')}
    >
      <a href="#/" aria-label="Mars-Fit 홈">
        <img
          src={logoImg}
          alt="Mars-Fit"
          className="h-12 object-contain"
        />
      </a>

      <MarsAvatar
        size="md"
        alt="내 프로필"
        onClick={onAvatarClick}
      />
    </header>
  )
}
