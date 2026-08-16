export default function PageWrapper({ children, className = '' }) {
  return (
    <div className={`max-w-2xl mx-auto px-5 py-4 ${className}`}>
      {children}
    </div>
  )
}
