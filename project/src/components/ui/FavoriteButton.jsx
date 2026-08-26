import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { isFavorite, toggleFavorite, subscribeFavorites, toFavorite } from '../../utils/favorites'

/**
 * ★ 관심공고 담기 버튼.
 *
 * 공고를 그리는 곳이면 어디든 한 줄로 붙는다. 목록이 여러 화면에 걸쳐
 * 있어서, 한 곳에서 누르면 다른 곳의 별도 같이 채워져야 한다 —
 * subscribeFavorites 가 그걸 맡는다.
 *
 *     <FavoriteButton notice={m} />
 *
 * notice 는 매칭 API 원본이든 Home 의 카드({id, title, raw})든 상관없다.
 * toFavorite 이 둘 다 받는다.
 */
export default function FavoriteButton({ notice, size = 20, className = '' }) {
  const id = toFavorite(notice)?.notice_id ?? null
  const [on, setOn] = useState(() => isFavorite(id))

  useEffect(() => {
    setOn(isFavorite(id))
    return subscribeFavorites(() => setOn(isFavorite(id)))
  }, [id])

  if (!id) return null

  return (
    <button
      type="button"
      onClick={(e) => {
        // 공고 카드 전체가 눌리는 자리에 얹히는 경우가 많다. 별을 눌렀는데
        // 상세 화면으로 넘어가면 담았는지 확인할 수가 없다.
        e.stopPropagation()
        e.preventDefault()
        setOn(toggleFavorite(notice))
      }}
      aria-pressed={on}
      aria-label={on ? '관심공고에서 빼기' : '관심공고로 담기'}
      title={on ? '관심공고에서 빼기' : '관심공고로 담기'}
      className={[
        'tap ' +
        'flex-shrink-0 p-1.5 rounded-full transition-colors duration-150',
        on ? 'text-sunset-orange hover:bg-sunset-orange/10'
           : 'text-warm-gray hover:text-sunset-orange hover:bg-warm-gray/10',
        className,
      ].join(' ')}
    >
      <Star size={size} strokeWidth={2} fill={on ? 'currentColor' : 'none'} />
    </button>
  )
}
