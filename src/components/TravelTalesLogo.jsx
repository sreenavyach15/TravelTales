function TravelTalesLogo({ compact = false, className = '' }) {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`.trim()}>
      <div className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-5 w-5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4.5 12a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0-15 0Z" />
          <path d="M4.8 10.3h14.4" />
          <path d="M5.4 13.9h13.2" />
          <path d="M12 4.5c1.9 2.1 2.9 4.6 2.9 7.5S13.9 17.4 12 19.5" />
          <path d="M12 4.5c-1.9 2.1-2.9 4.6-2.9 7.5s1 5.4 2.9 7.5" />
          <path d="m15.2 3.9 2.7 2.3" />
        </svg>
      </div>

      {!compact && (
        <div className="min-w-0">
          <p className="truncate text-base font-bold tracking-tight text-slate-900">Travel Tales</p>
          <p className="truncate text-[11px] font-medium text-slate-500">Plan together. Travel better.</p>
        </div>
      )}
    </div>
  )
}

export default TravelTalesLogo

