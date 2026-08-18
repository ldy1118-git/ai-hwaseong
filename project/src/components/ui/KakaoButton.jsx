/**
 * 카카오 로그인 버튼.
 *
 * 전에는 같은 문구를 화면마다 다른 색으로 그렸다 — 랜딩 위쪽은 투명에
 * 흰 테두리, 랜딩 아래쪽은 남색, 로그인 화면만 노란색이었다. 카카오
 * 버튼은 색이 곧 표식이라, 남색으로 칠하면 그게 카카오인 줄 모른다.
 * 카카오 디자인 가이드가 정한 색은 배경 #FEE500, 글씨 #191600 이다.
 *
 * 한 곳에서만 그린다. 색을 바꿀 일이 생기면 여기만 고친다.
 */

const sizes = {
  md: 'py-3 text-sm rounded-2xl',
  lg: 'py-4 text-base rounded-2xl',
}

export default function KakaoButton({
  onClick,
  disabled = false,
  size = 'lg',
  fullWidth = true,
  children = '카카오톡으로 시작하기',
  className = '',
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center gap-2 font-bold',
        'bg-[#FEE500] text-[#191600] shadow-sm',
        'hover:brightness-95 active:brightness-90 transition',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#191600]/30',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        sizes[size] ?? sizes.lg,
        fullWidth ? 'w-full' : 'px-6',
        className,
      ].join(' ')}
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="currentColor" aria-hidden="true">
        <path d="M12 3.5c-4.7 0-8.5 3-8.5 6.7 0 2.4 1.6 4.5 4 5.7l-1 3.6c-.1.3.3.6.6.4l4.3-2.8c.2 0 .4.1.6.1 4.7 0 8.5-3 8.5-6.7S16.7 3.5 12 3.5Z" />
      </svg>
      {children}
    </button>
  )
}
