import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageContainer from '../components/PageContainer'
import { useAuth } from '../hooks/useAuth'
import { listUserChatRooms, sendSystemMessageToChatRoom } from '../services/chatService'
import { isNavigableLocation, openInGoogleMaps } from '../services/mapsService'
import {
  createTripNotifications,
  listTripNotificationsForUser,
} from '../services/tripNotificationService'
import {
  evaluateEndOfDayReview,
  buildReschedulePreview,
  getLocalDateISO,
  getTripTrackerView,
  saveTripTrackerUpdate,
} from '../services/tripTrackerService'
import { getTripById, getTripsByUser } from '../services/tripService'

function formatDateLong(dateISO) {
  const parsed = new Date(`${dateISO}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return dateISO || '-'
  }
  return parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function statusClass(status) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'completed') return 'bg-emerald-100 text-emerald-700'
  if (normalized === 'missed') return 'bg-rose-100 text-rose-700'
  if (normalized === 'moved') return 'bg-blue-100 text-blue-700'
  if (normalized === 'skipped') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-700'
}

function getStartDateMs(date) {
  const parsed = new Date(`${String(date || '').trim()}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime()
}

function isTripActive(trip, todayMs) {
  const startMs = getStartDateMs(trip?.startDate)
  const endMs = getStartDateMs(trip?.endDate)
  if (startMs === null || endMs === null) {
    return false
  }
  return todayMs >= startMs && todayMs <= endMs
}

function normalizeDecisionLabel(decision) {
  if (decision === 'yes') return 'Yes'
  if (decision === 'no') return 'No'
  return 'Pending'
}

function TripTracker() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const queryTripId = searchParams.get('tripId') || ''

  const [trips, setTrips] = useState([])
  const [selectedTripId, setSelectedTripId] = useState('')
  const [tripNotifications, setTripNotifications] = useState([])
  const [userRooms, setUserRooms] = useState([])

  const [activeTab, setActiveTab] = useState('today')
  const [loading, setLoading] = useState(true)
  const [loadingTrip, setLoadingTrip] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const [todayCompletionMap, setTodayCompletionMap] = useState({})
  const [showReviewPanel, setShowReviewPanel] = useState(false)
  const [reviewResult, setReviewResult] = useState(null)
  const [decisionsByPlaceKey, setDecisionsByPlaceKey] = useState({})
  const [preview, setPreview] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  const todayISO = getLocalDateISO()
  const todayMs = getStartDateMs(todayISO)

  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) || null,
    [trips, selectedTripId],
  )

  const activeTrips = useMemo(() => {
    return trips.filter((trip) => isTripActive(trip, todayMs))
  }, [todayMs, trips])

  const trackerView = useMemo(() => {
    if (!selectedTrip?.itinerary?.days?.length) {
      return null
    }
    return getTripTrackerView({
      trip: selectedTrip,
      dateISO: todayISO,
    })
  }, [selectedTrip, todayISO])

  const roomForSelectedTrip = useMemo(
    () => userRooms.find((room) => room.tripId === selectedTripId) || null,
    [selectedTripId, userRooms],
  )

  const selectedTripNotifications = useMemo(() => {
    return tripNotifications.filter((item) => item.tripId === selectedTripId)
  }, [selectedTripId, tripNotifications])

  useEffect(() => {
    let mounted = true

    async function loadAllTrips() {
      if (!user?.uid) {
        if (mounted) {
          setTrips([])
          setSelectedTripId('')
          setLoading(false)
        }
        return
      }

      setLoading(true)
      setError('')
      try {
        const [ownedTrips, joinedRooms, notifications] = await Promise.all([
          getTripsByUser(user.uid),
          listUserChatRooms(user.uid),
          listTripNotificationsForUser(user.uid),
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

        const mergedTrips = Object.values(byId).sort((a, b) => {
          const first = b?.createdAt?.toMillis?.() ?? 0
          const second = a?.createdAt?.toMillis?.() ?? 0
          return first - second
        })

        if (!mounted) {
          return
        }

        setTrips(mergedTrips)
        setUserRooms(joinedRooms)
        setTripNotifications(notifications.slice(0, 30))

        const activeCandidates = mergedTrips.filter((trip) => isTripActive(trip, todayMs))
        const defaultTripId =
          (queryTripId && mergedTrips.some((trip) => trip.id === queryTripId) ? queryTripId : '') ||
          activeCandidates[0]?.id ||
          mergedTrips[0]?.id ||
          ''

        setSelectedTripId(defaultTripId)
      } catch (loadError) {
        if (mounted) {
          setError(loadError.message || 'Failed to load trip tracker.')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadAllTrips()
    return () => {
      mounted = false
    }
  }, [queryTripId, todayMs, user?.uid])

  useEffect(() => {
    if (!trackerView?.today?.agenda) {
      setTodayCompletionMap({})
      return
    }

    const nextMap = {}
    trackerView.today.agenda.forEach((item) => {
      nextMap[item.placeKey] = item.status === 'completed'
    })
    setTodayCompletionMap(nextMap)
  }, [trackerView?.today?.agenda])

  useEffect(() => {
    setShowReviewPanel(false)
    setReviewResult(null)
    setDecisionsByPlaceKey({})
    setPreview(null)
  }, [selectedTripId])

  const handleNavigate = (placeName) => {
    openInGoogleMaps(placeName)
  }

  const handleToggleComplete = (placeKey) => {
    setTodayCompletionMap((previous) => ({
      ...previous,
      [placeKey]: !previous[placeKey],
    }))
  }

  const handleOpenReview = () => {
    if (!selectedTrip || !trackerView?.itinerary) {
      return
    }

    setError('')
    setStatus('')

    const result = evaluateEndOfDayReview({
      trip: selectedTrip,
      itinerary: trackerView.itinerary,
      trackerState: trackerView.trackerState,
      reviewDate: todayISO,
      completionMap: todayCompletionMap,
    })

    const initialDecisions = {}
    result.suggestions.forEach((item) => {
      initialDecisions[item.placeKey] = 'no'
    })

    setReviewResult(result)
    setDecisionsByPlaceKey(initialDecisions)
    setPreview(null)
    setShowReviewPanel(true)
  }

  const handleGeneratePreview = () => {
    if (!selectedTrip || !trackerView?.itinerary || !reviewResult) {
      return
    }

    const generated = buildReschedulePreview({
      trip: selectedTrip,
      itinerary: trackerView.itinerary,
      trackerState: trackerView.trackerState,
      reviewResult,
      decisionsByPlaceKey,
      reviewerUid: user?.uid,
    })
    setPreview(generated)
  }

  const handleCancelReview = () => {
    setShowReviewPanel(false)
    setReviewResult(null)
    setDecisionsByPlaceKey({})
    setPreview(null)
    setStatus('Day update cancelled. No itinerary changes made.')
    setError('')
  }

  async function reloadSelectedTrip() {
    if (!selectedTripId) {
      return
    }
    const refreshedTrip = await getTripById(selectedTripId)
    if (!refreshedTrip) {
      return
    }
    setTrips((previous) =>
      previous.map((trip) => (trip.id === refreshedTrip.id ? refreshedTrip : trip)),
    )
  }

  const handleConfirmChanges = async () => {
    if (!selectedTrip || !preview) {
      return
    }

    setIsSaving(true)
    setError('')
    setStatus('')
    setLoadingTrip(true)

    try {
      await saveTripTrackerUpdate({
        tripId: selectedTrip.id,
        itinerary: preview.previewItinerary,
        trackerState: preview.previewTrackerState,
      })

      await reloadSelectedTrip()

      if (preview.moveSummaries.length > 0) {
        const moveSummaryText = preview.moveSummaries
          .map(
            (move) =>
              `${move.placeName} moved to Day ${move.toDayNumber} ${move.toTimeSlot}.`,
          )
          .join(' ')

        const notificationMessage = `Trip plan updated: ${moveSummaryText}`
        const recipients =
          roomForSelectedTrip?.memberUids?.length > 0
            ? roomForSelectedTrip.memberUids
            : [user?.uid].filter(Boolean)

        await createTripNotifications({
          tripId: selectedTrip.id,
          message: notificationMessage,
          recipientUids: recipients,
          triggeredByUid: user?.uid,
          type: 'trip_tracker_update',
          metadata: {
            movedCount: preview.moveSummaries.length,
          },
        })

        if (roomForSelectedTrip?.id) {
          await sendSystemMessageToChatRoom({
            roomId: roomForSelectedTrip.id,
            user,
            text: `Trip plan updated: ${moveSummaryText}`,
            metadata: {
              tripId: selectedTrip.id,
              source: 'trip_tracker',
            },
          })
        }
      }

      if (preview.notRescheduled.length > 0) {
        const cannotMove = preview.notRescheduled
          .map((item) => `${item.placeName}: ${item.reason}`)
          .join(' | ')
        setStatus(
          `Day updated. ${preview.moveSummaries.length} place(s) moved. Some places could not be rescheduled: ${cannotMove}`,
        )
      } else {
        setStatus(`Day updated successfully. ${preview.moveSummaries.length} place(s) moved.`)
      }

      setShowReviewPanel(false)
      setReviewResult(null)
      setDecisionsByPlaceKey({})
      setPreview(null)
      setActiveTab('updates')
    } catch (saveError) {
      setError(saveError.message || 'Could not save trip tracker updates.')
    } finally {
      setIsSaving(false)
      setLoadingTrip(false)
    }
  }

  if (loading) {
    return (
      <PageContainer title="Trip Tracker" description="Live itinerary progress while traveling.">
        <p className="text-sm text-slate-600">Loading tracker...</p>
      </PageContainer>
    )
  }

  if (!selectedTrip) {
    return (
      <PageContainer title="Trip Tracker" description="Live itinerary progress while traveling.">
        <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600">
          No trips found.
        </p>
      </PageContainer>
    )
  }

  if (!selectedTrip?.itinerary?.days?.length || !trackerView) {
    return (
      <PageContainer title="Trip Tracker" description="Live itinerary progress while traveling.">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            This trip does not have a saved itinerary yet. Generate and save a plan in Recommendations first.
          </p>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title="Trip Tracker"
      description="Track today's plan, recover missed places, and keep co-travelers informed."
    >
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

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{selectedTrip.destination}</h3>
              <p className="text-sm text-slate-600">
                {formatDateLong(todayISO)} | Day {trackerView.today.dayNumber} of {trackerView.today.dayCount}
              </p>
              <p className="text-xs text-slate-500">
                Progress today: {Object.values(todayCompletionMap).filter(Boolean).length} /{' '}
                {trackerView.today.agenda.length} completed
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeTrips.length > 0 && (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                  Active Trip
                </span>
              )}
              <select
                value={selectedTripId}
                onChange={(event) => setSelectedTripId(event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {trips.map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {trip.destination} ({trip.startDate || '-'} to {trip.endDate || '-'})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'today', label: "Today's Agenda" },
              { id: 'tomorrow', label: 'Tomorrow Preview' },
              { id: 'updates', label: 'Updated Plans' },
              { id: 'notifications', label: 'Notifications' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-300 bg-white text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {activeTab === 'today' && (
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-base font-semibold text-slate-900">Today&apos;s Agenda</h4>
              <button
                type="button"
                onClick={handleOpenReview}
                disabled={loadingTrip || isSaving}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Update Today&apos;s Day
              </button>
            </div>

            <div className="mt-3">
              {trackerView.today.agenda.length === 0 && (
                <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                  No tasks planned for today.
                </p>
              )}

              {trackerView.today.agenda.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="hidden items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:flex">
                    <span className="w-6">Done</span>
                    <span className="min-w-0 flex-1">Place / Activity</span>
                    <span className="w-28 text-right">Time</span>
                    <span className="w-24 text-right">Duration</span>
                    <span className="w-24 text-center">Status</span>
                    <span className="w-24 text-right">Action</span>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {trackerView.today.agenda.map((item, index) => {
                      const currentStatus = todayCompletionMap[item.placeKey]
                        ? 'completed'
                        : item.status || 'pending'

                      return (
                        <article
                          key={item.placeKey}
                          className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm text-slate-700 md:flex-nowrap md:gap-3"
                        >
                          <label className="inline-flex w-6 items-center justify-center">
                            <input
                              type="checkbox"
                              checked={todayCompletionMap[item.placeKey] === true}
                              onChange={() => handleToggleComplete(item.placeKey)}
                              className="h-4 w-4 rounded border-slate-300"
                              aria-label={`Mark ${item.name || 'item'} as completed`}
                            />
                          </label>

                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-slate-900">
                              {index + 1}. {item.name || 'Unnamed stop'}
                            </p>
                          </div>

                          <p className="w-full text-xs text-slate-500 md:w-28 md:text-right md:text-sm">
                            {item.estimatedTime || '-'}
                          </p>
                          <p className="w-full text-xs text-slate-500 md:w-24 md:text-right md:text-sm">
                            {item.durationLabel || '-'}
                          </p>

                          <div className="md:w-24 md:text-center">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(currentStatus)}`}>
                              {currentStatus}
                            </span>
                          </div>

                          <div className="md:w-24 md:text-right">
                            {isNavigableLocation(item) && (
                              <button
                                type="button"
                                onClick={() => handleNavigate(item.name)}
                                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
                              >
                                Navigate
                              </button>
                            )}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'tomorrow' && (
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h4 className="text-base font-semibold text-slate-900">Tomorrow Preview</h4>
            <p className="mt-1 text-sm text-slate-500">{formatDateLong(trackerView.tomorrow.date)}</p>

            <div className="mt-3 space-y-2">
              {trackerView.tomorrow.agenda.length === 0 && (
                <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                  No tasks planned for tomorrow.
                </p>
              )}
              {trackerView.tomorrow.agenda.map((item, index) => (
                <div
                  key={item.placeKey}
                  className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
                >
                  <p className="font-medium text-slate-900">
                    {index + 1}. {item.name || 'Unnamed stop'}
                  </p>
                  <p className="mt-1">
                    {item.estimatedTime || '-'} | {item.durationLabel || '-'}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'updates' && (
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h4 className="text-base font-semibold text-slate-900">Updated Plans</h4>
            <div className="mt-3 space-y-2">
              {(trackerView.trackerState.changeLog || []).length === 0 && (
                <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                  No plan updates yet.
                </p>
              )}
              {(trackerView.trackerState.changeLog || []).map((log) => (
                <article key={log.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-900">{log.message || 'Plan updated'}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {log.date ? formatDateLong(log.date) : '-'}
                  </p>
                  {Array.isArray(log.movedItems) && log.movedItems.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-slate-700">
                      {log.movedItems.map((item) => (
                        <li key={`${log.id}_${item.placeKey}`}>
                          {item.placeName}
                          {' -> '}Day {item.toDayNumber} ({item.toTimeSlot})
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'notifications' && (
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h4 className="text-base font-semibold text-slate-900">Trip Notifications</h4>
            <div className="mt-3 space-y-2">
              {selectedTripNotifications.length === 0 && (
                <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                  No trip-tracker notifications yet.
                </p>
              )}
              {selectedTripNotifications.map((notification) => (
                <article
                  key={notification.id}
                  className={`rounded-md border p-3 text-sm ${
                    notification.isRead
                      ? 'border-slate-200 bg-slate-50 text-slate-700'
                      : 'border-blue-200 bg-blue-50 text-blue-900'
                  }`}
                >
                  <p>{notification.message}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {showReviewPanel && reviewResult && (
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h4 className="text-base font-semibold text-slate-900">End Of Day Review</h4>
            <p className="mt-1 text-sm text-slate-600">
              Review completed tasks and approve any practical rescheduling suggestions.
            </p>

            <div className="mt-3 space-y-2">
              {reviewResult.reviewItems.map((item) => {
                const practicalSuggestion = reviewResult.suggestions.find(
                  (candidate) => candidate.placeKey === item.placeKey,
                )
                return (
                  <div
                    key={item.placeKey}
                    className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
                  >
                    <p className="font-medium text-slate-900">{item.place?.name || 'Place'}</p>
                    <p className="mt-1">
                      Status:{' '}
                      <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(item.status)}`}>
                        {item.status}
                      </span>{' '}
                      {item.status === 'missed' && (
                        <>
                          | Priority:{' '}
                          <span className="font-semibold text-slate-800">{item.priority}</span>
                        </>
                      )}
                    </p>

                    {practicalSuggestion && practicalSuggestion.practicality?.practical && (
                      <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 p-2">
                        <p className="text-xs text-blue-900">
                          You missed {item.place?.name}. It can be moved to Day{' '}
                          {practicalSuggestion.practicality.targetDayNumber}{' '}
                          {practicalSuggestion.practicality.targetTimeSlot}
                          {practicalSuggestion.practicality.afterPlaceName
                            ? ` after ${practicalSuggestion.practicality.afterPlaceName}`
                            : ''}
                          . Would you like to adjust your plan?
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setDecisionsByPlaceKey((previous) => ({
                                ...previous,
                                [item.placeKey]: 'yes',
                              }))
                            }
                            className={`rounded-md px-2 py-1 text-xs ${
                              decisionsByPlaceKey[item.placeKey] === 'yes'
                                ? 'bg-slate-900 text-white'
                                : 'border border-slate-300 bg-white text-slate-700'
                            }`}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDecisionsByPlaceKey((previous) => ({
                                ...previous,
                                [item.placeKey]: 'no',
                              }))
                            }
                            className={`rounded-md px-2 py-1 text-xs ${
                              decisionsByPlaceKey[item.placeKey] === 'no'
                                ? 'bg-slate-900 text-white'
                                : 'border border-slate-300 bg-white text-slate-700'
                            }`}
                          >
                            No
                          </button>
                          <span className="self-center text-xs text-slate-600">
                            Decision: {normalizeDecisionLabel(decisionsByPlaceKey[item.placeKey])}
                          </span>
                        </div>
                      </div>
                    )}

                    {practicalSuggestion && !practicalSuggestion.practicality?.practical && (
                      <p className="mt-2 text-xs text-rose-700">
                        This place could not be reasonably rescheduled. Reason:{' '}
                        {practicalSuggestion.practicality?.reason || 'Not practical'}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleGeneratePreview}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Generate Updated Preview
              </button>
              <button
                type="button"
                onClick={handleCancelReview}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>

            {preview && (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">Updated Plan Preview</p>
                {preview.moveSummaries.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600">No place moves selected for reschedule.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {preview.moveSummaries.map((move) => (
                      <li key={move.placeKey}>
                        Day {move.toDayNumber}: {move.toTimeSlot} {move.placeName} (moved)
                      </li>
                    ))}
                  </ul>
                )}

                {preview.notRescheduled.length > 0 && (
                  <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                    {preview.notRescheduled.map((item, index) => (
                      <p key={`${item.placeName}_${index}`}>
                        {item.placeName}: {item.reason}
                      </p>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmChanges}
                    disabled={isSaving}
                    className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Confirm Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </PageContainer>
  )
}

export default TripTracker
