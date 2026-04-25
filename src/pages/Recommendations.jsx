import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageContainer from '../components/PageContainer'
import { useAuth } from '../hooks/useAuth'
import {
  generateItineraryWithGemini,
  hasGeminiConfig,
  replanItineraryWithGemini,
  suggestNearbyPlacesWithGemini,
} from '../services/geminiPlannerService'
import {
  createEmptyPlace,
  generateItineraryFromTrip,
  recalculateItinerary,
} from '../services/itineraryService'
import { isNavigableLocation, openInGoogleMaps } from '../services/mapsService'
import { downloadItineraryPdf } from '../services/planPdfService'
import { getTripById, saveTripItinerary } from '../services/tripService'

function getExpandedState(days, previous = {}) {
  const nextState = {}
  days.forEach((day) => {
    nextState[day.id] = previous[day.id] ?? true
  })
  return nextState
}

function cloneDeep(value) {
  return JSON.parse(JSON.stringify(value))
}

function getFallbackNearbySuggestions(destination, dayDate) {
  return [
    {
      name: `${destination} Local Street Market`,
      date: dayDate,
      estimatedTime: '16:00 - 18:00',
      travelModeFromPrevious: 'Walk',
      travelFare: 0,
      activities: 'Browse local stores, interact with vendors, and explore handicrafts.',
      thingsToTry: 'Street snacks and regional sweets.',
      estimatedBudget: 600,
      description:
        'This market area is ideal for understanding local lifestyle, shopping patterns, and food culture in one compact walkable zone.',
    },
    {
      name: `${destination} Cultural Performance Center`,
      date: dayDate,
      estimatedTime: '18:30 - 20:00',
      travelModeFromPrevious: 'Cab',
      travelFare: 250,
      activities: 'Watch live cultural performances and traditional showcases.',
      thingsToTry: 'Local beverages and small traditional treats.',
      estimatedBudget: 800,
      description:
        'A curated place to experience regional dance, music, and storytelling traditions with historical context.',
    },
    {
      name: `${destination} Riverside Food Lane`,
      date: dayDate,
      estimatedTime: '20:00 - 21:30',
      travelModeFromPrevious: 'Walk',
      travelFare: 0,
      activities: 'Evening walk, tasting stalls, and photography.',
      thingsToTry: 'Signature local dishes and dessert stalls.',
      estimatedBudget: 700,
      description:
        'A lively evening destination known for local food experiences and social atmosphere, suitable as an end-of-day stop.',
    },
  ]
}

function Recommendations() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const tripId = searchParams.get('tripId')

  const [trip, setTrip] = useState(null)
  const [itinerary, setItinerary] = useState(null)
  const [expandedDays, setExpandedDays] = useState({})
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isReplanning, setIsReplanning] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editSnapshot, setEditSnapshot] = useState(null)
  const [hasSavedPlan, setHasSavedPlan] = useState(false)
  const [suggestingDayId, setSuggestingDayId] = useState('')

  const refreshItinerary = (nextItinerary, tripContext = trip) => {
    const normalized = recalculateItinerary(nextItinerary, tripContext)
    setItinerary(normalized)
    setExpandedDays((previous) => getExpandedState(normalized.days || [], previous))
  }

  useEffect(() => {
    let isMounted = true

    async function loadTripAndPlan() {
      if (!tripId) {
        if (isMounted) {
          setError('Open Trip Details and click "Start planning" for a specific trip.')
          setLoading(false)
        }
        return
      }

      try {
        const fetchedTrip = await getTripById(tripId)

        if (!fetchedTrip) {
          throw new Error('Trip not found.')
        }
        if (fetchedTrip.userId !== user?.uid) {
          throw new Error('You are not allowed to access this trip.')
        }

        const savedPlanExists = Boolean(fetchedTrip.itinerary?.days?.length)
        let plan = null
        let localStatus = ''

        if (savedPlanExists) {
          plan = recalculateItinerary(fetchedTrip.itinerary)
        } else if (hasGeminiConfig) {
          setIsGenerating(true)
          try {
            plan = await generateItineraryWithGemini(fetchedTrip)
            localStatus = 'AI itinerary generated successfully.'
          } finally {
            setIsGenerating(false)
          }
        } else {
          plan = generateItineraryFromTrip(fetchedTrip)
          localStatus = 'Gemini key not configured. Loaded fallback itinerary.'
        }

        if (isMounted) {
          setTrip(fetchedTrip)
          refreshItinerary(plan, fetchedTrip)
          setHasSavedPlan(savedPlanExists)
          setIsEditMode(false)
          setEditSnapshot(null)
          if (localStatus) {
            setStatus(localStatus)
          }
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

    loadTripAndPlan()
    return () => {
      isMounted = false
    }
  }, [tripId, user?.uid])

  const budgetInfo = useMemo(() => {
    const passengerCount = Math.max(1, Number(trip?.passengerCount || 1))
    const budgetLimit = Number(itinerary?.budgetLimit || trip?.budget || 0)
    const perHeadBudget = Number(
      trip?.budgetPerHead || (passengerCount > 0 ? budgetLimit / passengerCount : budgetLimit),
    )
    const placesBudget = Number(itinerary?.totalEstimatedBudget || 0)
    const travelFare = Number(itinerary?.totalTravelFare || 0)
    const plannedTotal = Number(itinerary?.plannedBudget || placesBudget + travelFare)

    return {
      budgetLimit,
      perHeadBudget,
      placesBudget,
      travelFare,
      plannedTotal,
      isOverBudget: plannedTotal > budgetLimit,
    }
  }, [itinerary, trip?.budget, trip?.budgetPerHead, trip?.passengerCount])

  const planningContext = useMemo(() => {
    const preferences = trip?.preferences || {}
    const mustVisitRaw = preferences.mustVisitPlaces ?? trip?.mustVisitPlaces ?? []
    const mustVisit = Array.isArray(mustVisitRaw)
      ? mustVisitRaw.map((place) => String(place || '').trim()).filter(Boolean)
      : String(mustVisitRaw || '')
          .split(/[\n,;]+/g)
          .map((place) => place.trim())
          .filter(Boolean)

    return {
      budgetPerHead: Math.round(
        Number(
          trip?.budgetPerHead ||
            Number(trip?.budget || 0) / Math.max(1, Number(trip?.passengerCount || 1)),
        ),
      ),
      arrivalTime: trip?.arrivalTime || 'Not set',
      departureTime: trip?.departureTime || 'Not set',
      passengerCount: Math.max(1, Number(trip?.passengerCount || 1)),
      transportAccess: String(preferences.transportOwnership || trip?.transportOwnership || 'public'),
      mustVisitPlaces: mustVisit,
    }
  }, [trip])

  const updateItinerary = (updater) => {
    setItinerary((previous) => {
      if (!previous) return previous
      const next = recalculateItinerary(updater(previous), trip)
      setExpandedDays((oldExpanded) => getExpandedState(next.days || [], oldExpanded))
      return next
    })
  }

  const toggleDay = (dayId) => {
    setExpandedDays((previous) => ({
      ...previous,
      [dayId]: !previous[dayId],
    }))
  }

  const setAllDaysExpanded = (value) => {
    setExpandedDays((previous) => {
      const next = { ...previous }
      Object.keys(next).forEach((key) => {
        next[key] = value
      })
      return next
    })
  }

  const handleNavigate = (placeName) => {
    openInGoogleMaps(placeName)
  }

  const handleEnterEditMode = () => {
    if (!itinerary) return
    setEditSnapshot(cloneDeep(itinerary))
    setIsEditMode(true)
    setStatus('Edit mode enabled. You can now modify the plan.')
    setError('')
  }

  const handleCancelEdit = () => {
    if (editSnapshot) {
      refreshItinerary(editSnapshot)
    }
    setIsEditMode(false)
    setEditSnapshot(null)
    setStatus('Edit mode cancelled. Reverted to last saved/viewed plan.')
    setError('')
  }

  const handlePlaceChange = (dayId, placeId, field, value) => {
    if (!isEditMode) return

    updateItinerary((previous) => ({
      ...previous,
      days: previous.days.map((day) =>
        day.id !== dayId
          ? day
          : {
              ...day,
              places: day.places.map((place) =>
                place.id === placeId
                  ? {
                      ...place,
                      [field]:
                        field === 'estimatedBudget' || field === 'travelFare'
                          ? Number(value || 0)
                          : value,
                    }
                  : place,
              ),
            },
      ),
    }))
  }

  const handleDeletePlace = (dayId, placeId) => {
    if (!isEditMode) return

    updateItinerary((previous) => ({
      ...previous,
      days: previous.days.map((day) =>
        day.id !== dayId
          ? day
          : {
              ...day,
              places: day.places.filter((place) => place.id !== placeId),
            },
      ),
    }))
  }

  const handleAddPlace = (dayId) => {
    if (!isEditMode) return

    updateItinerary((previous) => ({
      ...previous,
      days: previous.days.map((day) =>
        day.id !== dayId
          ? day
          : {
              ...day,
              places: [...day.places, createEmptyPlace(day.date || '')],
            },
      ),
    }))
  }

  const handleMovePlace = (dayId, index, direction) => {
    if (!isEditMode) return

    updateItinerary((previous) => ({
      ...previous,
      days: previous.days.map((day) => {
        if (day.id !== dayId) return day

        const targetIndex = direction === 'up' ? index - 1 : index + 1
        if (targetIndex < 0 || targetIndex >= day.places.length) {
          return day
        }

        const reordered = [...day.places]
        const [selected] = reordered.splice(index, 1)
        reordered.splice(targetIndex, 0, selected)
        return { ...day, places: reordered }
      }),
    }))
  }

  const handleSuggestNearbyPlaces = async (dayId) => {
    if (!isEditMode || !itinerary) return

    const day = itinerary.days.find((item) => item.id === dayId)
    if (!day) return

    setError('')
    setStatus('')
    setSuggestingDayId(dayId)

    try {
      let suggestions = []
      if (hasGeminiConfig) {
        suggestions = await suggestNearbyPlacesWithGemini({
          destination: itinerary.destination || trip?.destination || '',
          dayNumber: day.dayNumber,
          date: day.date,
          existingPlaces: day.places.map((place) => place.name).filter(Boolean),
        })
      } else {
        suggestions = getFallbackNearbySuggestions(itinerary.destination || trip?.destination || '', day.date)
      }

      const normalizedSuggestions = suggestions.map((suggestion) => ({
        ...createEmptyPlace(day.date || ''),
        ...suggestion,
      }))

      updateItinerary((previous) => ({
        ...previous,
        days: previous.days.map((item) =>
          item.id !== dayId ? item : { ...item, places: [...item.places, ...normalizedSuggestions] },
        ),
      }))

      setStatus('Nearby place suggestions added to this day.')
    } catch (suggestError) {
      setError(suggestError.message)
    } finally {
      setSuggestingDayId('')
    }
  }

  const getReplacementSuggestion = async (day, reason, currentPlaceName = '') => {
    let suggestions = []
    if (hasGeminiConfig) {
      suggestions = await suggestNearbyPlacesWithGemini({
        destination: itinerary.destination || trip?.destination || '',
        dayNumber: day.dayNumber,
        date: day.date,
        existingPlaces: day.places.map((place) => place.name).filter(Boolean),
      })
    } else {
      suggestions = getFallbackNearbySuggestions(itinerary.destination || trip?.destination || '', day.date)
    }

    const match =
      suggestions.find((suggestion) => suggestion.name && suggestion.name !== currentPlaceName) ||
      suggestions[0]

    if (!match) {
      throw new Error(`No alternative found for ${reason}.`)
    }

    return {
      ...createEmptyPlace(day.date || ''),
      ...match,
    }
  }

  const handleReplacePlace = async (dayId, placeId, reason) => {
    if (!isEditMode || !itinerary) return

    const day = itinerary.days.find((item) => item.id === dayId)
    const place = day?.places.find((item) => item.id === placeId)
    if (!day || !place) return

    setError('')
    setStatus('')
    try {
      const replacement = await getReplacementSuggestion(day, reason, place.name)
      updateItinerary((previous) => ({
        ...previous,
        days: previous.days.map((item) =>
          item.id !== dayId
            ? item
            : {
                ...item,
                places: item.places.map((itemPlace) =>
                  itemPlace.id === placeId ? { ...replacement, id: placeId } : itemPlace,
                ),
              },
        ),
      }))
      setStatus(`Replaced "${place.name}" due to ${reason}.`)
    } catch (replaceError) {
      setError(replaceError.message)
    }
  }

  const handleDynamicReplan = async (reason) => {
    if (!trip || !itinerary) return

    if (hasSavedPlan && !isEditMode) {
      setError('This plan is locked. Click "Edit Plan" to replan.')
      return
    }

    setError('')
    setStatus('')
    setIsReplanning(true)
    try {
      if (hasGeminiConfig) {
        const replanned = await replanItineraryWithGemini({ trip, itinerary, reason })
        refreshItinerary(replanned, trip)
      } else {
        const fallbackDays = itinerary.days.map((day) => {
          const suggestions = getFallbackNearbySuggestions(
            itinerary.destination || trip?.destination || '',
            day.date,
          )
          if (day.places.length === 0 || suggestions.length === 0) {
            return day
          }
          const firstSuggestion = { ...createEmptyPlace(day.date || ''), ...suggestions[0] }
          return {
            ...day,
            places: [firstSuggestion, ...day.places.slice(1)],
          }
        })
        refreshItinerary({ ...itinerary, days: fallbackDays }, trip)
      }

      setStatus(`Dynamic replan applied for: ${reason}.`)
    } catch (replanError) {
      setError(replanError.message)
    } finally {
      setIsReplanning(false)
    }
  }

  const handleGenerateWithAi = async () => {
    if (!trip) return

    if (hasSavedPlan && !isEditMode) {
      setError('This plan is locked. Click "Edit Plan" to regenerate or modify it.')
      return
    }

    setError('')
    setStatus('')
    if (!hasGeminiConfig) {
      setError('Gemini API key is missing. Add VITE_GEMINI_API_KEY to .env.')
      return
    }

    setIsGenerating(true)
    try {
      const aiPlan = await generateItineraryWithGemini(trip)
      refreshItinerary(aiPlan, trip)
      setStatus('AI itinerary regenerated successfully.')
    } catch (generationError) {
      setError(generationError.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSavePlan = async () => {
    if (!trip?.id || !itinerary) return

    setStatus('')
    setError('')
    setIsSaving(true)
    try {
      await saveTripItinerary(trip.id, itinerary)
      setTrip((previous) => (previous ? { ...previous, itinerary } : previous))
      setHasSavedPlan(true)
      setIsEditMode(false)
      setEditSnapshot(null)
      setStatus('Plan saved successfully.')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDownloadPlan = async () => {
    if (!trip || !itinerary) return

    setError('')
    setStatus('')
    setIsDownloading(true)
    try {
      downloadItineraryPdf({ trip, itinerary })
      setStatus('Plan downloaded as PDF.')
    } catch (downloadError) {
      setError(downloadError.message)
    } finally {
      setIsDownloading(false)
    }
  }

  if (loading) {
    return <PageContainer title="Recommendations" description="Loading your trip plan..." />
  }

  if (error && !itinerary) {
    return (
      <PageContainer title="Recommendations" description="Build your day-wise itinerary plan.">
        <p className="text-sm text-rose-600">{error}</p>
      </PageContainer>
    )
  }

  if (!trip || !itinerary) {
    return (
      <PageContainer title="Recommendations" description="Build your day-wise itinerary plan.">
        <p className="text-sm text-slate-600">No trip selected.</p>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title="Recommendations"
      description={`AI-powered day-wise travel guide for ${trip.destination}.`}
    >
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Budget / Head</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{Math.round(budgetInfo.perHeadBudget)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total Budget Limit</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{budgetInfo.budgetLimit}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Places Budget</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{budgetInfo.placesBudget}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Travel Fare</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{budgetInfo.travelFare}</p>
            </div>
            <div className={`rounded-lg p-3 ${budgetInfo.isOverBudget ? 'bg-rose-50' : 'bg-emerald-50'}`}>
              <p className="text-xs uppercase tracking-wide text-slate-500">Total Planned</p>
              <p
                className={`mt-1 text-lg font-semibold ${
                  budgetInfo.isOverBudget ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {budgetInfo.plannedTotal}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 md:grid-cols-2">
            <p>
              <span className="font-semibold text-slate-900">Arrival time:</span>{' '}
              {planningContext.arrivalTime}
            </p>
            <p>
              <span className="font-semibold text-slate-900">Departure time:</span>{' '}
              {planningContext.departureTime}
            </p>
            <p>
              <span className="font-semibold text-slate-900">Passengers:</span>{' '}
              {planningContext.passengerCount}
            </p>
            <p>
              <span className="font-semibold text-slate-900">Budget / head:</span>{' '}
              {planningContext.budgetPerHead}
            </p>
            <p>
              <span className="font-semibold text-slate-900">Transport access:</span>{' '}
              {planningContext.transportAccess}
            </p>
            <p className="md:col-span-2">
              <span className="font-semibold text-slate-900">Must-visit places:</span>{' '}
              {planningContext.mustVisitPlaces.length > 0
                ? planningContext.mustVisitPlaces.join(', ')
                : 'none specified'}
            </p>
          </div>

          {itinerary.whyThisPlan && (
            <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 md:grid-cols-2">
              <p>
                <span className="font-semibold text-slate-900">Why this plan (Budget):</span>{' '}
                {itinerary.whyThisPlan.budget}
              </p>
              <p>
                <span className="font-semibold text-slate-900">Interests:</span>{' '}
                {itinerary.whyThisPlan.interests}
              </p>
              <p>
                <span className="font-semibold text-slate-900">Pace:</span> {itinerary.whyThisPlan.pace}
              </p>
              <p>
                <span className="font-semibold text-slate-900">Route logic:</span>{' '}
                {itinerary.whyThisPlan.optimization}
              </p>
            </div>
          )}

          {hasSavedPlan && !isEditMode && (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              This plan is locked. Click <span className="font-semibold">Edit Plan</span> to make changes.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {!isEditMode ? (
              <button
                type="button"
                onClick={handleEnterEditMode}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Edit Plan
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel Edit
              </button>
            )}

            <button
              type="button"
              onClick={handleGenerateWithAi}
              disabled={isGenerating}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              {isGenerating ? 'Generating AI plan...' : 'Regenerate Itinerary'}
            </button>
            <button
              type="button"
              onClick={() => handleDynamicReplan('weather change')}
              disabled={isReplanning}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              {isReplanning ? 'Replanning...' : 'Replan for Weather'}
            </button>
            <button
              type="button"
              onClick={() => handleDynamicReplan('time constraints')}
              disabled={isReplanning}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              {isReplanning ? 'Replanning...' : 'Replan for Time'}
            </button>
            <button
              type="button"
              onClick={handleSavePlan}
              disabled={isSaving}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSaving ? 'Saving...' : 'Save Plan'}
            </button>
            <button
              type="button"
              onClick={handleDownloadPlan}
              disabled={isDownloading}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              {isDownloading ? 'Preparing PDF...' : 'Download Plan (PDF)'}
            </button>
            <button
              type="button"
              onClick={() => setAllDaysExpanded(true)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Expand All Days
            </button>
            <button
              type="button"
              onClick={() => setAllDaysExpanded(false)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Collapse All Days
            </button>
            {status && <p className="text-sm text-emerald-700">{status}</p>}
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>
        </section>

        {itinerary.days.map((day) => (
          <section key={day.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Day {day.dayNumber}</h3>
                <p className="text-sm text-slate-500">{day.date || 'Date not set'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  Day Total: {day.totalDayBudget || 0}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  Stay: {day.accommodationCost || 0}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  Visit+Travel: {(day.placesBudget || 0) + (day.travelFare || 0)}
                </span>
                <button
                  type="button"
                  onClick={() => toggleDay(day.id)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {expandedDays[day.id] ? 'Collapse' : 'Expand'}
                </button>
              </div>
            </div>

            {expandedDays[day.id] && (
              <div className="p-4">
                {!isEditMode ? (
                  <div className="relative pl-8">
                    <div className="absolute bottom-0 left-2 top-0 w-px bg-slate-200" />
                    <div className="space-y-4">
                      {day.places.map((place, index) => (
                        <article key={place.id} className="relative rounded-lg border border-slate-200 bg-slate-50 p-4">
                          <span className="absolute -left-[27px] top-6 h-3 w-3 rounded-full bg-slate-900" />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-base font-semibold text-slate-900">
                              {index + 1}. {place.name || 'Unnamed Place'}
                            </h4>
                            <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-700">
                              {place.estimatedTime || 'Time not set'}
                            </span>
                          </div>
                          <div className="mt-2 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                            <p>
                              <span className="font-medium text-slate-900">Travel:</span>{' '}
                              {place.travelModeFromPrevious || 'Not set'}
                            </p>
                            <p>
                              <span className="font-medium text-slate-900">Fare:</span>{' '}
                              {place.travelFare || 0}
                            </p>
                            <p>
                              <span className="font-medium text-slate-900">Place Budget:</span>{' '}
                              {place.estimatedBudget || 0}
                            </p>
                            <p>
                              <span className="font-medium text-slate-900">Visit Date:</span>{' '}
                              {place.date || day.date || 'Not set'}
                            </p>
                          </div>
                          <div className="mt-3 space-y-2 text-sm text-slate-700">
                            <p>
                              <span className="font-medium text-slate-900">Activities:</span>{' '}
                              {place.activities || 'Not specified'}
                            </p>
                            <p>
                              <span className="font-medium text-slate-900">Things To Try:</span>{' '}
                              {place.thingsToTry || 'Not specified'}
                            </p>
                            <p className="rounded-md bg-white p-3 leading-relaxed text-slate-700">
                              <span className="font-medium text-slate-900">About this place:</span>{' '}
                              {place.description || 'No description available.'}
                            </p>
                          </div>
                          {isNavigableLocation(place) && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handleNavigate(place.name)}
                                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                              >
                                Navigate
                              </button>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {day.places.map((place, index) => (
                      <article key={place.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-700">Stop {index + 1}</p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleMovePlace(day.id, index, 'up')}
                              disabled={!isEditMode}
                              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Move Up
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMovePlace(day.id, index, 'down')}
                              disabled={!isEditMode}
                              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Move Down
                            </button>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="text-sm text-slate-700">
                            Place Name
                            <input
                              value={place.name}
                              onChange={(event) =>
                                handlePlaceChange(day.id, place.id, 'name', event.target.value)
                              }
                              readOnly={!isEditMode}
                              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 read-only:bg-slate-100"
                            />
                          </label>
                          <label className="text-sm text-slate-700">
                            Visit Date
                            <input
                              type="date"
                              value={place.date}
                              onChange={(event) =>
                                handlePlaceChange(day.id, place.id, 'date', event.target.value)
                              }
                              readOnly={!isEditMode}
                              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 read-only:bg-slate-100"
                            />
                          </label>
                          <label className="text-sm text-slate-700">
                            Estimated Time
                            <input
                              value={place.estimatedTime}
                              onChange={(event) =>
                                handlePlaceChange(day.id, place.id, 'estimatedTime', event.target.value)
                              }
                              readOnly={!isEditMode}
                              placeholder="09:00 - 11:00"
                              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 read-only:bg-slate-100"
                            />
                          </label>
                          <label className="text-sm text-slate-700">
                            Place Budget
                            <input
                              type="number"
                              min="0"
                              value={place.estimatedBudget}
                              onChange={(event) =>
                                handlePlaceChange(day.id, place.id, 'estimatedBudget', event.target.value)
                              }
                              readOnly={!isEditMode}
                              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 read-only:bg-slate-100"
                            />
                          </label>
                          <label className="text-sm text-slate-700">
                            Travel Mode From Previous
                            <input
                              value={place.travelModeFromPrevious}
                              onChange={(event) =>
                                handlePlaceChange(
                                  day.id,
                                  place.id,
                                  'travelModeFromPrevious',
                                  event.target.value,
                                )
                              }
                              readOnly={!isEditMode}
                              placeholder="Walk / Cab / Metro / Bus"
                              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 read-only:bg-slate-100"
                            />
                          </label>
                          <label className="text-sm text-slate-700">
                            Travel Fare
                            <input
                              type="number"
                              min="0"
                              value={place.travelFare}
                              onChange={(event) =>
                                handlePlaceChange(day.id, place.id, 'travelFare', event.target.value)
                              }
                              readOnly={!isEditMode}
                              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 read-only:bg-slate-100"
                            />
                          </label>
                        </div>

                        <div className="mt-3 grid gap-3">
                          <label className="text-sm text-slate-700">
                            Activities
                            <textarea
                              value={place.activities}
                              onChange={(event) =>
                                handlePlaceChange(day.id, place.id, 'activities', event.target.value)
                              }
                              rows={2}
                              readOnly={!isEditMode}
                              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 read-only:bg-slate-100"
                            />
                          </label>
                          <label className="text-sm text-slate-700">
                            Things To Try
                            <textarea
                              value={place.thingsToTry}
                              onChange={(event) =>
                                handlePlaceChange(day.id, place.id, 'thingsToTry', event.target.value)
                              }
                              rows={2}
                              readOnly={!isEditMode}
                              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 read-only:bg-slate-100"
                            />
                          </label>
                          <label className="text-sm text-slate-700">
                            Detailed Description
                            <textarea
                              value={place.description}
                              onChange={(event) =>
                                handlePlaceChange(day.id, place.id, 'description', event.target.value)
                              }
                              rows={4}
                              readOnly={!isEditMode}
                              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 read-only:bg-slate-100"
                            />
                          </label>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleReplacePlace(day.id, place.id, 'place unavailable')}
                            disabled={!isEditMode}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Replace (Unavailable)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReplacePlace(day.id, place.id, 'weather impact')}
                            disabled={!isEditMode}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Replace (Weather/Time)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePlace(day.id, place.id)}
                            disabled={!isEditMode}
                            className="rounded-md bg-rose-100 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Delete Place
                          </button>
                        </div>
                      </article>
                    ))}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleAddPlace(day.id)}
                        disabled={!isEditMode}
                        className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Add Place
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSuggestNearbyPlaces(day.id)}
                        disabled={!isEditMode || suggestingDayId === day.id}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {suggestingDayId === day.id ? 'Suggesting...' : 'Suggest Nearby Places'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        ))}
      </div>
    </PageContainer>
  )
}

export default Recommendations
