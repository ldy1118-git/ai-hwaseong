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
  /* **누를 데가 없으면 버튼으로 만들지 않는다.**
   *
   * 여태 onClick 이 없어도 언제나 <button> 이었다. 챗봇의 「생각 중」
   * 버블 옆 마이다가 그렇다 — 그냥 그림인데 탭 키가 거기 멈추고
   * 화면낭독기가 「마이다, 버튼」이라고 읽는다. 눌러도 아무 일이 없다.
   *
   * 폰으로 재보니 「누르기 작은 것」 목록에도 올라와 있었다. 넓힐 게
   * 아니라 애초에 버튼이 아니어야 했다. */
  const clickable = typeof onClick === 'function'
  const Tag = clickable ? 'button' : 'span'

  return (
    <Tag
      {...(clickable
        ? { type: 'button', onClick, 'aria-label': alt }
        : { 'aria-hidden': true })}
      className={[
        'rounded-full overflow-hidden flex-shrink-0',
        'ring-2 ring-star-yellow ring-offset-1',
        'bg-white',
        clickable
          ? 'tap block cursor-pointer hover:ring-sunset-orange transition-all duration-150'
          : 'block',
        sizes[size] ?? sizes.md,
        className,
      ].join(' ')}
    >
      <img
        src={marsImg}
        alt={clickable ? '' : alt}
        className="w-full h-full object-contain p-0.5"
      />
    </Tag>
  )
}
