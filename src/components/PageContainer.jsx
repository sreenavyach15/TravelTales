function PageContainer({ title, description, children }) {
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-3xl font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-600">{description}</p>
      </header>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
    </section>
  )
}

export default PageContainer
