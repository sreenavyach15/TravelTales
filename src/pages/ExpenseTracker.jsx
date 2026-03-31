import { useEffect, useMemo, useState } from 'react'
import PageContainer from '../components/PageContainer'
import { useAuth } from '../hooks/useAuth'
import { addExpenseEntry, listExpenseEntries } from '../services/expenseService'

const DOMAIN_OPTIONS = ['food', 'travel', 'entry fee', 'stay', 'shopping', 'activity', 'other']
const TIME_SLOT_OPTIONS = ['morning', 'afternoon', 'evening']

function getTodayDate() {
  return new Date().toISOString().split('T')[0]
}

function formatLabel(text) {
  const value = String(text || '').trim()
  if (!value) return '-'
  return value
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function ExpenseTracker() {
  const { user } = useAuth()
  const [entries, setEntries] = useState([])
  const [form, setForm] = useState({
    amount: '',
    purpose: '',
    date: getTodayDate(),
    timeSlot: 'morning',
    domain: 'food',
    entryType: 'expense',
    borrowedFrom: '',
  })
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadEntries() {
      if (!user?.uid) {
        if (isMounted) {
          setEntries([])
          setLoading(false)
        }
        return
      }

      try {
        const expenseEntries = await listExpenseEntries(user.uid)
        if (isMounted) {
          setEntries(expenseEntries)
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadEntries()
    return () => {
      isMounted = false
    }
  }, [user?.uid])

  const totals = useMemo(() => {
    const totalSpent = entries
      .filter((entry) => entry.entryType !== 'borrowed')
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
    const totalBorrowed = entries
      .filter((entry) => entry.entryType === 'borrowed')
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)

    return {
      totalSpent,
      totalBorrowed,
      totalEntries: entries.length,
    }
  }, [entries])

  const handleInputChange = (event) => {
    const { name, value } = event.target
    setForm((previous) => ({
      ...previous,
      [name]: value,
    }))
  }

  const setEntryType = (entryType) => {
    setForm((previous) => ({
      ...previous,
      entryType,
      borrowedFrom: entryType === 'borrowed' ? previous.borrowedFrom : '',
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setStatus('')

    if (!user?.uid) {
      setError('Please log in to add expenses.')
      return
    }

    setIsSubmitting(true)
    try {
      const createdEntry = await addExpenseEntry(user.uid, form)
      setEntries((previous) => [createdEntry, ...previous])
      setStatus(
        form.entryType === 'borrowed'
          ? 'Borrowed amount entry added.'
          : 'Expense entry added successfully.',
      )
      setForm((previous) => ({
        ...previous,
        amount: '',
        purpose: '',
        borrowedFrom: '',
      }))
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PageContainer
      title="ExpenseTracker"
      description="Add trip expenses and borrowed amounts with time and domain details."
    >
      <div className="space-y-6">
        <form className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div className="md:col-span-2">
            <p className="text-sm font-medium text-slate-700">Entry Type</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                { label: 'Expense', value: 'expense' },
                { label: 'Borrowed', value: 'borrowed' },
              ].map((option) => {
                const isSelected = form.entryType === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setEntryType(option.value)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                      isSelected
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="text-sm font-medium text-slate-700">
            Amount
            <input
              type="number"
              name="amount"
              min="1"
              value={form.amount}
              onChange={handleInputChange}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Purpose
            <input
              type="text"
              name="purpose"
              value={form.purpose}
              onChange={handleInputChange}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Date
            <input
              type="date"
              name="date"
              value={form.date}
              onChange={handleInputChange}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Time
            <select
              name="timeSlot"
              value={form.timeSlot}
              onChange={handleInputChange}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            >
              {TIME_SLOT_OPTIONS.map((timeSlot) => (
                <option key={timeSlot} value={timeSlot}>
                  {formatLabel(timeSlot)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Domain
            <select
              name="domain"
              value={form.domain}
              onChange={handleInputChange}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            >
              {DOMAIN_OPTIONS.map((domain) => (
                <option key={domain} value={domain}>
                  {formatLabel(domain)}
                </option>
              ))}
            </select>
          </label>

          {form.entryType === 'borrowed' && (
            <label className="text-sm font-medium text-slate-700">
              Borrowed From
              <input
                type="text"
                name="borrowedFrom"
                value={form.borrowedFrom}
                onChange={handleInputChange}
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
          )}

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? 'Saving...' : 'Add Entry'}
            </button>
            {status && <p className="mt-2 text-sm text-emerald-700">{status}</p>}
            {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
          </div>
        </form>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total Spent</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{totals.totalSpent}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Borrowed Total</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{totals.totalBorrowed}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Entries</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{totals.totalEntries}</p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-600">Loading expense entries...</p>
        ) : entries.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600">
            No expense entries yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Purpose</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Time</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Domain</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Borrowed From</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 text-slate-700">{formatLabel(entry.entryType)}</td>
                    <td className="px-4 py-3 text-slate-700">{entry.amount || 0}</td>
                    <td className="px-4 py-3 text-slate-700">{entry.purpose || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{entry.date || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{formatLabel(entry.timeSlot)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatLabel(entry.domain)}</td>
                    <td className="px-4 py-3 text-slate-700">{entry.borrowedFrom || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageContainer>
  )
}

export default ExpenseTracker
