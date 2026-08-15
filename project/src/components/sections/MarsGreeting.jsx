import marsImg from '../../../design/mars.png'

export default function MarsGreeting({ userName = '사장님' }) {
  return (
    <section className="px-5 pt-6 pb-2 flex items-end gap-3">
      {/* 말풍선 */}
      <div className="relative bg-white border border-warm-gray/40 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex-1">
        <span className="absolute -bottom-2 left-5 w-0 h-0 border-l-8 border-l-transparent border-t-8 border-t-white border-r-8 border-r-transparent" />
        <p className="text-sm text-warm-gray font-medium">안녕하세요, {userName}!</p>
        <p className="text-base font-semibold text-navy leading-snug mt-0.5">
          오늘도 성공적인 궤도를 향해<br />출발할 준비 되셨나요?
        </p>
      </div>

      {/* Mars 캐릭터 — 원형 클립 없이 자유 배치 */}
      <div className="relative flex-shrink-0 -mb-2">
        <img
          src={marsImg}
          alt="Mars"
          className="w-28 h-28 object-contain drop-shadow-md"
        />
      </div>
    </section>
  )
}
