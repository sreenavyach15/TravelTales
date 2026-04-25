import { useEffect, useMemo, useState } from 'react'
import PageContainer from '../components/PageContainer'
import { useAuth } from '../hooks/useAuth'
import { getChatRoomByTripId, listUserChatRooms } from '../services/chatService'
import { addTripExpenseEntryDetailed, listTripExpenseEntries } from '../services/expenseService'
import { getTripById, getTripsByUser } from '../services/tripService'
import { getDisplayNameFromEmail, getUserProfileByUid } from '../services/userService'

function money(value) {
  return Number(value || 0).toFixed(2)
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function getDateOnly(value) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  parsed.setHours(0, 0, 0, 0)
  return parsed
}

function isPastTrip(trip) {
  const endDate = getDateOnly(trip?.endDate)
  if (!endDate) {
    return false
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return endDate < today
}

function equalSplit(amount, participantUids) {
  const count = Math.max(1, participantUids.length)
  const base = Number((amount / count).toFixed(2))
  let allocated = 0
  const result = {}
  participantUids.forEach((uid, index) => {
    const share = index === count - 1 ? Number((amount - allocated).toFixed(2)) : base
    result[uid] = share
    allocated += share
  })
  return result
}

function getCreatedAtMillis(item) {
  return item?.createdAt?.toMillis?.() ?? 0
}

function ExpenseTracker() {
  const { user } = useAuth()
  const [allTrips, setAllTrips] = useState([])
  const [tripScope, setTripScope] = useState('current')
  const [selectedTripId, setSelectedTripId] = useState('')

  const [tripMembers, setTripMembers] = useState([])
  const [tripExpenses, setTripExpenses] = useState([])

  const [currentUserName, setCurrentUserName] = useState('')
  const [form, setForm] = useState({
    amount: '',
    purpose: '',
    paidByUid: '',
    paidForAll: true,
    selectedParticipantUids: [],
  })

  const [loading, setLoading] = useState(true)
  const [loadingTripData, setLoadingTripData] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const scopedTrips = useMemo(() => {
    if (tripScope === 'past') {
      return allTrips.filter((trip) => isPastTrip(trip))
    }
    return allTrips.filter((trip) => !isPastTrip(trip))
  }, [allTrips, tripScope])

  const memberByUid = useMemo(() => {
    const map = {}
    tripMembers.forEach((member) => {
      map[member.uid] = member
    })
    return map
  }, [tripMembers])

  const memberIds = useMemo(() => tripMembers.map((member) => member.uid), [tripMembers])

  const participantUids = useMemo(() => {
    if (form.paidForAll) {
      return memberIds
    }
    return [...new Set((form.selectedParticipantUids || []).filter(Boolean))]
  }, [form.paidForAll, form.selectedParticipantUids, memberIds])

  const computed = useMemo(() => {
    const rawIncomingByUid = {}
    const rawOutgoingByUid = {}
    const outgoingPurposeByUid = {}
    let spentByYou = 0

    const activeExpenses = tripExpenses.filter((entry) => entry.settled !== true)

    activeExpenses.forEach((entry) => {
      const payerUid = entry.payerUid || entry.userId
      if (!payerUid) {
        return
      }

      const amount = Number(entry.amount || 0)
      if (!Number.isFinite(amount) || amount <= 0) {
        return
      }

      if (payerUid === user?.uid) {
        spentByYou += amount
      }

      const participants = Array.isArray(entry.participantUids) ? entry.participantUids : []
      if (participants.length === 0) {
        return
      }

      const splitByUid =
        entry.splitBreakdownByUid && Object.keys(entry.splitBreakdownByUid).length > 0
          ? entry.splitBreakdownByUid
          : equalSplit(amount, participants)

      participants.forEach((participantUid) => {
        const share = Number(splitByUid[participantUid] || 0)
        if (!Number.isFinite(share) || share <= 0) {
          return
        }

        if (payerUid === user?.uid && participantUid !== user?.uid) {
          rawIncomingByUid[participantUid] = Number((rawIncomingByUid[participantUid] || 0) + share)
        }

        if (payerUid !== user?.uid && participantUid === user?.uid) {
          rawOutgoingByUid[payerUid] = Number((rawOutgoingByUid[payerUid] || 0) + share)
          if (!outgoingPurposeByUid[payerUid]) {
            outgoingPurposeByUid[payerUid] = new Set()
          }
          outgoingPurposeByUid[payerUid].add(String(entry.purpose || entry.notes || 'Expense').trim())
        }
      })
    })

    const allCounterparties = [...new Set([...Object.keys(rawIncomingByUid), ...Object.keys(rawOutgoingByUid)])]

    const incomingRows = []
    const outgoingRows = []

    allCounterparties.forEach((uid) => {
      const incoming = Number(rawIncomingByUid[uid] || 0)
      const outgoing = Number(rawOutgoingByUid[uid] || 0)
      const net = Number((incoming - outgoing).toFixed(2))

      if (net > 0.01) {
        incomingRows.push({ uid, amount: net })
      } else if (net < -0.01) {
        const purposes = outgoingPurposeByUid[uid]
          ? [...outgoingPurposeByUid[uid]].filter(Boolean).join(', ')
          : 'Expense'
        outgoingRows.push({ uid, amount: Math.abs(net), purpose: purposes || 'Expense' })
      }
    })

    incomingRows.sort((a, b) => b.amount - a.amount)
    outgoingRows.sort((a, b) => b.amount - a.amount)

    const amountYouPay = outgoingRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const amountYouReceive = incomingRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)

    return {
      totalSpentByYou: Number(spentByYou.toFixed(2)),
      amountYouPay: Number(amountYouPay.toFixed(2)),
      amountYouReceive: Number(amountYouReceive.toFixed(2)),
      incomingRows,
      outgoingRows,
    }
  }, [tripExpenses, user?.uid])

  const sortedExpenseList = useMemo(() => {
    return [...tripExpenses].sort((a, b) => getCreatedAtMillis(b) - getCreatedAtMillis(a))
  }, [tripExpenses])

  useEffect(() => {
    let mounted = true

    async function loadTrips() {
      if (!user?.uid) {
        if (mounted) {
          setAllTrips([])
          setSelectedTripId('')
          setLoading(false)
        }
        return
      }

      setLoading(true)
      setError('')

      try {
        const [ownedTrips, joinedRooms, userProfile] = await Promise.all([
          getTripsByUser(user.uid),
          listUserChatRooms(user.uid),
          getUserProfileByUid(user.uid),
        ])

        const byId = {}
        ownedTrips.forEach((trip) => {
          byId[trip.id] = trip
        })

        const joinedTripIds = [...new Set(joinedRooms.map((room) => room.tripId).filter(Boolean))]
        const missingTripIds = joinedTripIds.filter((tripId) => !byId[tripId])
        const missingTrips = await Promise.all(missingTripIds.map((tripId) => getTripById(tripId)))
        missingTrips.forEach((trip) => {
          if (trip?.id) {
            byId[trip.id] = trip
          }
        })

        const mergedTrips = Object.values(byId).sort((a, b) => getCreatedAtMillis(b) - getCreatedAtMillis(a))
        if (!mounted) return

        setAllTrips(mergedTrips)
        const defaultCurrentTripId =
          mergedTrips.find((trip) => !isPastTrip(trip))?.id || mergedTrips[0]?.id || ''
        setSelectedTripId(defaultCurrentTripId)

        const profileName = normalizeName(userProfile?.displayName)
        setCurrentUserName(profileName || getDisplayNameFromEmail(user.email))
      } catch (loadError) {
        if (mounted) {
          setError(loadError.message || 'Failed to load trips.')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadTrips()
    return () => {
      mounted = false
    }
  }, [user?.uid, user?.email])

  useEffect(() => {
    if (!scopedTrips.some((trip) => trip.id === selectedTripId)) {
      setSelectedTripId(scopedTrips[0]?.id || '')
    }
  }, [scopedTrips, selectedTripId])

  useEffect(() => {
    let mounted = true

    async function loadTripData() {
      if (!user?.uid || !selectedTripId) {
        if (mounted) {
          setTripMembers([])
          setTripExpenses([])
        }
        return
      }

      setLoadingTripData(true)
      setError('')

      try {
        const trip = allTrips.find((item) => item.id === selectedTripId)
        const room = await getChatRoomByTripId(selectedTripId, user.uid)
        const candidateUids = room?.memberUids?.length ? room.memberUids : [trip?.userId || user.uid]
        const uniqueMemberUids = [...new Set([...candidateUids, user.uid].filter(Boolean))]

        const profiles = await Promise.all(uniqueMemberUids.map((uid) => getUserProfileByUid(uid)))
        const members = uniqueMemberUids.map((uid, index) => {
          const profile = profiles[index]
          const email = profile?.email || ''
          const name = normalizeName(profile?.displayName) || getDisplayNameFromEmail(email || uid)
          return { uid, email, name }
        })

        const expenses = await listTripExpenseEntries(selectedTripId)
        if (!mounted) return

        setTripMembers(members)
        setTripExpenses(expenses)
        setForm((prev) => ({
          ...prev,
          paidByUid: members.some((member) => member.uid === prev.paidByUid) ? prev.paidByUid : user.uid,
          paidForAll: true,
          selectedParticipantUids: [],
        }))
      } catch (loadError) {
        if (mounted) {
          setError(loadError.message || 'Failed to load trip expenses.')
        }
      } finally {
        if (mounted) {
          setLoadingTripData(false)
        }
      }
    }

    loadTripData()
    return () => {
      mounted = false
    }
  }, [allTrips, selectedTripId, user?.uid])

  function toggleParticipant(uid) {
    setForm((prev) => {
      const exists = prev.selectedParticipantUids.includes(uid)
      return {
        ...prev,
        selectedParticipantUids: exists
          ? prev.selectedParticipantUids.filter((item) => item !== uid)
          : [...prev.selectedParticipantUids, uid],
      }
    })
  }

  async function handleAddExpense(event) {
    event.preventDefault()
    if (!user?.uid || !selectedTripId) {
      return
    }

    setError('')
    setStatus('')

    const amount = Number(form.amount || 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid amount.')
      return
    }
    if (!form.paidByUid) {
      setError('Select who paid.')
      return
    }
    if (participantUids.length === 0) {
      setError('Select at least one participant.')
      return
    }

    setSaving(true)
    try {
      const splitByUid = equalSplit(amount, participantUids)
      const participantNames = participantUids.map(
        (uid) => memberByUid[uid]?.name || getDisplayNameFromEmail(memberByUid[uid]?.email || uid),
      )
      const splitByName = {}
      participantUids.forEach((uid, index) => {
        splitByName[participantNames[index]] = splitByUid[uid]
      })

      await addTripExpenseEntryDetailed({
        userId: user.uid,
        tripId: selectedTripId,
        tripMemberUids: memberIds,
        payerUid: form.paidByUid,
        payer: memberByUid[form.paidByUid]?.name || currentUserName || getDisplayNameFromEmail(user.email),
        amount,
        purpose: String(form.purpose || '').trim() || 'Expense',
        notes: String(form.purpose || '').trim(),
        participants: participantNames,
        participantUids,
        splitType: 'equal',
        splitBreakdown: splitByName,
        splitBreakdownByUid: splitByUid,
      })

      const refreshed = await listTripExpenseEntries(selectedTripId)
      setTripExpenses(refreshed)
      setForm((prev) => ({
        ...prev,
        amount: '',
        purpose: '',
        paidForAll: true,
        selectedParticipantUids: [],
      }))
      setStatus('Expense added.')
    } catch (saveError) {
      setError(saveError.message || 'Could not add expense.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <PageContainer title="Expense Tracker" description="Track trip expenses clearly and simply.">
        <p className="text-sm text-slate-600">Loading trips...</p>
      </PageContainer>
    )
  }

  return (
    <PageContainer title="Expense Tracker" description="Minimal trip-based group expense tracking.">
      <div className="space-y-5">
        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        {status && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            {status}
          </p>
        )}

        <section className="rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">Select Trip</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTripScope('current')}
              className={`rounded-full px-3 py-1 text-xs ${
                tripScope === 'current' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700'
              }`}
            >
              Current Trips
            </button>
            <button
              type="button"
              onClick={() => setTripScope('past')}
              className={`rounded-full px-3 py-1 text-xs ${
                tripScope === 'past' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700'
              }`}
            >
              Past Trips
            </button>
          </div>

          <div className="mt-3">
            <select
              value={selectedTripId}
              onChange={(event) => setSelectedTripId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            >
              {scopedTrips.length === 0 && <option value="">No trips found</option>}
              {scopedTrips.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.destination} ({trip.startDate || '-'} to {trip.endDate || '-'})
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Amount Spent By You</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">Rs. {money(computed.totalSpentByYou)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Amount You Should Pay Others</p>
            <p className="mt-1 text-2xl font-semibold text-rose-700">Rs. {money(computed.amountYouPay)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Amount Others Should Pay You</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-700">Rs. {money(computed.amountYouReceive)}</p>
          </div>
        </section>

        <form onSubmit={handleAddExpense} className="rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">Add Expense</p>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-700">
              <span>Amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
              />
            </label>

            <label className="space-y-1 text-sm text-slate-700">
              <span>Paid by</span>
              <select
                value={form.paidByUid}
                onChange={(event) => setForm((prev) => ({ ...prev, paidByUid: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
              >
                {tripMembers.map((member) => (
                  <option key={member.uid} value={member.uid}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm text-slate-700 md:col-span-2">
              <span>Purpose / Note</span>
              <input
                value={form.purpose}
                onChange={(event) => setForm((prev) => ({ ...prev, purpose: event.target.value }))}
                placeholder="Dinner near beach, taxi, tickets..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
              />
            </label>
          </div>

          <div className="mt-4">
            <p className="text-sm text-slate-700">Paid for</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    paidForAll: !prev.paidForAll,
                    selectedParticipantUids: !prev.paidForAll ? [] : prev.selectedParticipantUids,
                  }))
                }
                className={`rounded-full px-3 py-1 text-xs ${
                  form.paidForAll ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700'
                }`}
              >
                All members
              </button>
            </div>

            {!form.paidForAll && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {tripMembers.map((member) => {
                  const checked = form.selectedParticipantUids.includes(member.uid)
                  return (
                    <label
                      key={member.uid}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleParticipant(member.uid)}
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                      />
                      <span>{member.name}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!selectedTripId || loadingTripData || saving}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add Expense'}
          </button>
        </form>

        <section className="rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">Expense List</p>
          <div className="mt-2 space-y-2">
            {sortedExpenseList.length === 0 && <p className="text-sm text-slate-500">No expenses for this trip yet.</p>}
            {sortedExpenseList.map((entry) => (
              <p key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {memberByUid[entry.payerUid || entry.userId]?.name || entry.payer || 'Traveler'} paid Rs. {money(entry.amount)} for{' '}
                {entry.purpose || 'Expense'} (split among {(entry.participantUids || []).map((uid) => memberByUid[uid]?.name || uid).join(', ') || '-'})
              </p>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">Incoming (Who Owes You)</p>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-2 py-2 font-medium">Person</th>
                  <th className="px-2 py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {computed.incomingRows.length === 0 && (
                  <tr>
                    <td className="px-2 py-3 text-slate-500" colSpan={2}>
                      No incoming balances.
                    </td>
                  </tr>
                )}
                {computed.incomingRows.map((row) => (
                  <tr key={row.uid} className="border-b border-slate-100 text-slate-700">
                    <td className="px-2 py-2">{memberByUid[row.uid]?.name || row.uid}</td>
                    <td className="px-2 py-2">Rs. {money(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">Outgoing (You Owe)</p>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-2 py-2 font-medium">To</th>
                  <th className="px-2 py-2 font-medium">Purpose</th>
                  <th className="px-2 py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {computed.outgoingRows.length === 0 && (
                  <tr>
                    <td className="px-2 py-3 text-slate-500" colSpan={3}>
                      No outgoing balances.
                    </td>
                  </tr>
                )}
                {computed.outgoingRows.map((row, index) => (
                  <tr key={`${row.uid}-${index}`} className="border-b border-slate-100 text-slate-700">
                    <td className="px-2 py-2">{memberByUid[row.uid]?.name || row.uid}</td>
                    <td className="px-2 py-2">{row.purpose || 'Expense'}</td>
                    <td className="px-2 py-2">Rs. {money(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PageContainer>
  )
}

export default ExpenseTracker
