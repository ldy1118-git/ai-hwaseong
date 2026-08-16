import MarsAvatar from './MarsAvatar'

function TermHighlight({ term, definition }) {
  return (
    <span className="relative inline group">
      <span
        className="bg-star-yellow/70 group-hover:bg-star-yellow text-navy font-semibold
                   px-0.5 rounded cursor-default transition-colors duration-100"
      >
        {term}
      </span>
      <span className="absolute bottom-full left-0 mb-2 w-56 z-20
                       bg-navy text-white text-xs rounded-xl px-3 py-2.5
                       shadow-lg leading-relaxed pointer-events-none
                       opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <strong className="block text-star-yellow mb-1">{term}</strong>
        {definition}
        <span className="absolute top-full left-4 w-0 h-0
                         border-x-[5px] border-x-transparent
                         border-t-[5px] border-t-navy" />
      </span>
    </span>
  )
}

function parseText(text, terms) {
  if (!terms || Object.keys(terms).length === 0) return text

  const escaped = Object.keys(terms).map(t =>
    t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  )
  const pattern = new RegExp(`(${escaped.join('|')})`, 'g')
  const parts = text.split(pattern)

  return parts.map((part, i) =>
    terms[part]
      ? <TermHighlight key={i} term={part} definition={terms[part]} />
      : part
  )
}

export default function ChatBubble({ message }) {
  const isMars = message.role === 'mars'

  if (!isMars) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] bg-navy text-white text-sm leading-relaxed
                        rounded-2xl rounded-br-none px-4 py-2.5">
          {message.text}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-end gap-2">
      <MarsAvatar size="sm" alt="Mars" />
      <div className="max-w-[75%] bg-white border border-warm-gray/30 text-navy text-sm
                      leading-relaxed rounded-2xl rounded-bl-none px-4 py-2.5 shadow-sm">
        {parseText(message.text, message.terms)}
      </div>
    </div>
  )
}
