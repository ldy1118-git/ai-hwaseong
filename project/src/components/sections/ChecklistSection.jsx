export default function ChecklistSection({ items, onToggle }) {
  return (
    <section className="pb-10">
      <h2 className="text-base font-bold text-navy mb-3">제출 서류 체크리스트</h2>
      <div className="space-y-2">
        {items.map(item => (
          <label
            key={item.id}
            className={[
              'flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer',
              'transition-all duration-150',
              item.checked
                ? 'bg-warm-gray/10 border-warm-gray/30'
                : 'bg-white border-warm-gray/30 hover:border-navy/30',
            ].join(' ')}
          >
            <input
              type="checkbox"
              checked={item.checked}
              onChange={() => onToggle(item.id)}
              className="mt-0.5 w-4.5 h-4.5 accent-sunset-orange flex-shrink-0 cursor-pointer"
            />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium transition-all duration-150 ${item.checked ? 'line-through text-warm-gray' : 'text-navy'}`}>
                {item.label}
              </p>
              {item.desc && (
                <p className="text-xs text-warm-gray mt-0.5">{item.desc}</p>
              )}
              {item.url && !item.checked && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="inline-block mt-1 text-xs text-sunset-orange underline underline-offset-2 hover:opacity-70"
                >
                  발급하기 →
                </a>
              )}
            </div>
            {item.checked && (
              <span className="flex-shrink-0 text-xs font-semibold text-sunset-orange">완료</span>
            )}
          </label>
        ))}
      </div>
    </section>
  )
}
