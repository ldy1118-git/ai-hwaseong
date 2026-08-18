// onToggle(id) : 체크박스 직접 토글
// onDetail(item): 카드 본문 탭 → 상세 드로어 오픈
export default function ChecklistSection({ items, onToggle, onDetail }) {
  return (
    <section className="pb-4">
      <h2 className="text-sm font-bold text-navy mb-3 px-5">서류 체크리스트</h2>

      <div className="px-5 space-y-2.5">
        {items.map(item => (
          <div
            key={item.id}
            className={[
              'flex items-start gap-3 px-4 py-4 rounded-2xl border-2 transition-all duration-300',
              item.checked
                ? 'border-warm-gray/20 bg-warm-gray/10'
                : 'border-warm-gray/30 bg-white',
            ].join(' ')}
          >
            {/* 체크박스 – 직접 토글 */}
            <button
              onClick={() => onToggle?.(item.id)}
              aria-label={item.checked ? '체크 해제' : '완료 체크'}
              className={[
                'w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center mt-0.5 transition-all duration-300',
                item.checked
                  ? 'bg-emerald-500 border-emerald-500'
                  : 'border-warm-gray/60 hover:border-navy/50',
              ].join(' ')}
            >
              {item.checked && (
                <span className="text-white font-bold leading-none" style={{ fontSize: 11 }}>✓</span>
              )}
            </button>

            {/* 카드 본문 – 탭하면 드로어 */}
            <button
              onClick={() => !item.checked && onDetail?.(item)}
              className="flex-1 min-w-0 text-left"
            >
              <p className={[
                'text-sm font-semibold transition-all duration-300',
                item.checked ? 'line-through text-warm-gray/40' : 'text-navy',
              ].join(' ')}>
                {item.label}
              </p>
              {item.desc && (
                <p className={[
                  'text-xs mt-0.5 transition-all',
                  item.checked ? 'text-warm-gray/30' : 'text-warm-text',
                ].join(' ')}>
                  {item.desc}
                </p>
              )}
              {!item.checked && (
                <p className="text-xs text-navy/40 mt-1">발급 절차 보기 →</p>
              )}
            </button>

            {/* 상태 배지 */}
            {item.checked ? (
              <span className="flex-shrink-0 text-xs font-semibold text-emerald-500 self-start mt-0.5">
                완료
              </span>
            ) : (
              <span className="flex-shrink-0 text-warm-gray/40 text-xl self-start leading-none">›</span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
