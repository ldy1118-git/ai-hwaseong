import marsImg from '../../../design/mars.png'

export default function MarsGreeting({ userName = '사장님' }) {
  return (
    /* 화면에 색을 가진 면이 하나도 없었다. 팔레트는 쓰이는데 전부
       글자색으로만 쓰여서, 바탕은 오프화이트·카드는 흰색뿐이었다.
       그래서 「배경색만 보인다」.

       색은 여기저기 뿌리면 더 나빠진다. 한 곳에 제대로 준다 — 화면
       맨 위 이 자리다. 랜딩 히어로도 발표 표지도 이미 남색이라
       브랜드가 그대로 이어지고, 아래 흰 카드들이 「그 위에 놓인 것」
       으로 읽힌다.

       흰 말풍선은 뺐다. 오프화이트 위의 흰 말풍선은 그 자체가 안 보이는
       요소였고, 남색 위에서는 마이다가 직접 말하는 게 더 자연스럽다. */
    <section className="px-5 pt-5 pb-3">
      <div className="relative overflow-hidden rounded-3xl bg-navy px-5 py-5 flex items-end gap-3">

        {/* 궤도 — 랜딩 히어로·발표 표지와 같은 모티프 */}
        <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 w-64 h-64 rounded-full border border-star-yellow/15" />
        <span aria-hidden className="pointer-events-none absolute -right-8 top-4 w-32 h-32 rounded-full border border-star-yellow/10" />

        <div className="relative flex-1 min-w-0">
          <p className="text-sm font-bold text-star-yellow">안녕하세요, {userName}!</p>
          <p className="mt-1 text-base font-bold text-white leading-snug">
            오늘도 성공적인 궤도를 향해<br />출발할 준비 되셨나요?
          </p>
        </div>

        <img
          src={marsImg}
          alt="Mars-Fit 탐험 대원 마이다"
          className="relative flex-shrink-0 w-28 h-28 object-contain drop-shadow-lg -mb-1"
        />
      </div>
    </section>
  )
}
