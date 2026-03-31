import { useState } from 'react'
import PageContainer from '../components/PageContainer'

function TravelDiary() {
  const [entry, setEntry] = useState('')
  const [savedEntry, setSavedEntry] = useState('')

  const handleSave = (event) => {
    event.preventDefault()
    setSavedEntry(entry.trim())
  }

  return (
    <PageContainer title="TravelDiary" description="Capture daily highlights and reflections.">
      <form className="space-y-4" onSubmit={handleSave}>
        <textarea
          value={entry}
          onChange={(event) => setEntry(event.target.value)}
          rows={6}
          placeholder="Write about today’s adventure..."
          className="w-full rounded-md border border-slate-300 px-3 py-2"
        />
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Save Entry
        </button>
      </form>
      {savedEntry && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Latest Entry</h3>
          <p className="mt-2 text-sm text-slate-700">{savedEntry}</p>
        </div>
      )}
    </PageContainer>
  )
}

export default TravelDiary
