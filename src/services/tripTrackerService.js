import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { recalculateItinerary } from './itineraryService'

const LOW_PRIORITY_TERMS = [
  'market walk',
  'shopping',
  'cafe',
  'coffee',
  'tea break',
  'viewpoint',
  'free time',
  'relax',
  'leisure',
]

const HIGH_PRIORITY_TERMS = [
  'fort',
  'palace',
  'museum',
  'temple',
  'beach',
  'falls',
  'waterfall',
  'sunset point',
  'sunrise point',
  'landmark',
  'monument',
  'heritage',
  'national park',
  'wildlife',
]

const FIXED_BOOKING_TERMS = [
  'check-in',
  'check in',
  'check-out',
  'check out',
  'airport',
  'station',
  'flight',
  'train',
  'bus transfer',
  'hotel',
]

const TICKET_TERMS = ['ticket', 'prepaid', 'booking', 'reservation', 'entry pass']

function getDbInstance() {
  if (!db) {
    throw new Error('Firebase Firestore is not configured. Add VITE_FIREBASE_* values first.')
  }
  return db
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function includesAny(value, terms) {
  const normalized = normalizeText(value)
  if (!normalized) return false
  return terms.some((term) => normalized.includes(term))
}

function toDateOnly(dateInput) {
  const dateValue = new Date(dateInput)
  if (Number.isNaN(dateValue.getTime())) {
    return null
  }
  dateValue.setHours(0, 0, 0, 0)
  return dateValue
}

export function getLocalDateISO(dateInput = new Date()) {
  const date = toDateOnly(dateInput) || toDateOnly(new Date())
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseTimeLabel(timeLabel) {
  const text = String(timeLabel || '').trim()
  if (!text) {
    return { start: null, end: null }
  }

  const match = text.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/)
  if (!match) {
    return { start: null, end: null }
  }

  const startHour = Number(match[1])
  const startMinute = Number(match[2])
  const endHour = Number(match[3])
  const endMinute = Number(match[4])
  if (
    !Number.isFinite(startHour) ||
    !Number.isFinite(startMinute) ||
    !Number.isFinite(endHour) ||
    !Number.isFinite(endMinute)
  ) {
    return { start: null, end: null }
  }

  const start = startHour * 60 + startMinute
  const end = endHour * 60 + endMinute
  return {
    start: start >= 0 && start <= 1440 ? start : null,
    end: end >= 0 && end <= 1440 ? end : null,
  }
}

function toTimeLabel(minutes) {
  const safeMinutes = Math.max(0, Math.min(1439, Math.round(minutes)))
  const hour = Math.floor(safeMinutes / 60)
  const minute = safeMinutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function estimateDurationLabel(timeLabel) {
  const parsed = parseTimeLabel(timeLabel)
  if (parsed.start === null || parsed.end === null || parsed.end <= parsed.start) {
    return '1h'
  }

  const durationMinutes = parsed.end - parsed.start
  if (durationMinutes % 60 === 0) {
    return `${durationMinutes / 60}h`
  }
  return `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
}

function sortPlacesByTime(places) {
  return [...(Array.isArray(places) ? places : [])].sort((first, second) => {
    const firstStart = parseTimeLabel(first?.estimatedTime).start
    const secondStart = parseTimeLabel(second?.estimatedTime).start
    if (firstStart === null && secondStart === null) return 0
    if (firstStart === null) return 1
    if (secondStart === null) return -1
    return firstStart - secondStart
  })
}

function cloneDeep(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeTripTrackerState(value) {
  if (!value || typeof value !== 'object') {
    return {
      dailyProgress: {},
      movedHistory: {},
      changeLog: [],
    }
  }

  return {
    dailyProgress: value.dailyProgress && typeof value.dailyProgress === 'object' ? value.dailyProgress : {},
    movedHistory: value.movedHistory && typeof value.movedHistory === 'object' ? value.movedHistory : {},
    changeLog: Array.isArray(value.changeLog) ? value.changeLog : [],
  }
}

export function getTripTrackerStateFromTrip(trip) {
  return normalizeTripTrackerState(trip?.tripTracker)
}

function getPlaceKey(place, dayDate = '') {
  const placeId = String(place?.id || '').trim()
  if (placeId) {
    return placeId
  }

  const name = normalizeText(place?.name || 'place')
  const date = String(dayDate || place?.date || '').trim()
  return `${date}_${name || 'place'}`
}

function getFutureDays(itinerary, fromDayIndex) {
  const days = Array.isArray(itinerary?.days) ? itinerary.days : []
  return days
    .map((day, index) => ({ ...day, __index: index }))
    .filter((day) => day.__index > fromDayIndex)
}

function computeAffinityScore(placeName, dayPlaces) {
  const placeTokens = new Set(normalizeText(placeName).split(' ').filter(Boolean))
  if (placeTokens.size === 0) {
    return 0
  }

  const scores = (dayPlaces || []).map((item) => {
    const tokens = new Set(normalizeText(item?.name).split(' ').filter(Boolean))
    let overlap = 0
    placeTokens.forEach((token) => {
      if (tokens.has(token)) overlap += 1
    })
    return overlap
  })

  return scores.length ? Math.max(...scores) : 0
}

function isFixedBookingPlace(place) {
  return includesAny(place?.name, FIXED_BOOKING_TERMS)
}

function getMovedCount(trackerState, placeKey) {
  const movedHistory = trackerState?.movedHistory || {}
  return Number(movedHistory?.[placeKey]?.count || 0)
}

function getTripConstraints(trip) {
  const constraints = trip?.constraints || {}
  return {
    maxPlacesPerDay: Math.max(1, Number(constraints?.maxPlacesPerDay || 4)),
    maxTravelTimePerDay: Math.max(2, Number(constraints?.maxTravelTimePerDay || 8)),
    restTimeRequired: Boolean(constraints?.restTimeRequired),
  }
}

function getTripPreferences(trip) {
  const preferences = trip?.preferences || {}
  return {
    pace: String(preferences?.pace || trip?.pace || 'moderate').trim().toLowerCase(),
    interests: Array.isArray(preferences?.interests)
      ? preferences.interests.map((item) => normalizeText(item)).filter(Boolean)
      : Array.isArray(trip?.interests)
        ? trip.interests.map((item) => normalizeText(item)).filter(Boolean)
        : [],
  }
}

function getProgressByDate(itinerary, dateISO) {
  const days = Array.isArray(itinerary?.days) ? itinerary.days : []
  if (!days.length) {
    return { dayIndex: -1, dayCount: 0, day: null }
  }

  const indexByDate = days.findIndex((day) => String(day?.date || '').trim() === dateISO)
  if (indexByDate >= 0) {
    return {
      dayIndex: indexByDate,
      dayCount: days.length,
      day: days[indexByDate],
    }
  }

  const startDate = toDateOnly(days[0]?.date)
  const targetDate = toDateOnly(dateISO)
  if (!startDate || !targetDate) {
    return {
      dayIndex: 0,
      dayCount: days.length,
      day: days[0],
    }
  }

  const offset = Math.floor((targetDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))
  const clampedIndex = Math.max(0, Math.min(days.length - 1, offset))
  return {
    dayIndex: clampedIndex,
    dayCount: days.length,
    day: days[clampedIndex],
  }
}

export function getTripTrackerView({ trip, dateISO = getLocalDateISO() }) {
  const itinerary = recalculateItinerary(trip?.itinerary || {}, trip)
  const trackerState = getTripTrackerStateFromTrip(trip)
  const { dayIndex, dayCount, day } = getProgressByDate(itinerary, dateISO)
  const tomorrowBase = new Date(`${dateISO}T00:00:00`)
  tomorrowBase.setDate(tomorrowBase.getDate() + 1)
  const tomorrowDate = getLocalDateISO(tomorrowBase)

  const todayAgenda = sortPlacesByTime(day?.places || []).map((place) => {
    const placeKey = getPlaceKey(place, day?.date || dateISO)
    const dayProgress = trackerState.dailyProgress?.[dateISO]
    const status = dayProgress?.itemStatuses?.[placeKey] || 'pending'
    return {
      ...place,
      placeKey,
      status,
      durationLabel: estimateDurationLabel(place?.estimatedTime),
    }
  })

  const tomorrowInfo = getProgressByDate(itinerary, getLocalDateISO(new Date(`${tomorrowDate}T00:00:00`)))
  const tomorrowAgenda = sortPlacesByTime(tomorrowInfo.day?.places || []).map((place) => ({
    ...place,
    placeKey: getPlaceKey(place, tomorrowInfo.day?.date || ''),
    durationLabel: estimateDurationLabel(place?.estimatedTime),
  }))

  return {
    itinerary,
    trackerState,
    today: {
      date: dateISO,
      dayIndex,
      dayNumber: day?.dayNumber || dayIndex + 1,
      dayCount,
      agenda: todayAgenda,
    },
    tomorrow: {
      date: tomorrowInfo.day?.date || '',
      dayNumber: tomorrowInfo.day?.dayNumber || '',
      agenda: tomorrowAgenda,
    },
  }
}

export function classifyMissedPlacePriority(place, trip) {
  const placeName = String(place?.name || '').trim()
  const normalizedName = normalizeText(placeName)

  if (!normalizedName) {
    return 'low'
  }
  if (includesAny(normalizedName, LOW_PRIORITY_TERMS)) {
    return 'low'
  }
  if (includesAny(normalizedName, TICKET_TERMS)) {
    return 'high'
  }
  if (includesAny(normalizedName, HIGH_PRIORITY_TERMS)) {
    return 'high'
  }

  const preferences = getTripPreferences(trip)
  if (preferences.interests.some((interest) => normalizedName.includes(interest))) {
    return 'high'
  }

  if (Number(place?.estimatedBudget || 0) >= 2000) {
    return 'medium'
  }

  return 'medium'
}

function createSuggestedTimeSlot(targetDay) {
  const places = sortPlacesByTime(targetDay?.places || [])
  if (!places.length) {
    return '09:00 - 10:30'
  }

  const lastPlace = places[places.length - 1]
  const { end } = parseTimeLabel(lastPlace?.estimatedTime)
  const startMinutes = end === null ? 17 * 60 : Math.min(21 * 60, end + 45)
  const duration = 90
  const endMinutes = Math.min(22 * 60 + 30, startMinutes + duration)
  return `${toTimeLabel(startMinutes)} - ${toTimeLabel(endMinutes)}`
}

export function evaluateReschedulePracticality({
  itinerary,
  trip,
  trackerState,
  fromDayIndex,
  place,
}) {
  const futureDays = getFutureDays(itinerary, fromDayIndex)
  if (futureDays.length === 0) {
    return {
      practical: false,
      reason: 'No future days available for reschedule.',
    }
  }

  const placeKey = getPlaceKey(place, itinerary?.days?.[fromDayIndex]?.date || '')
  if (getMovedCount(trackerState, placeKey) >= 1) {
    return {
      practical: false,
      reason: 'This place was already rescheduled earlier.',
    }
  }

  if (isFixedBookingPlace(place)) {
    return {
      practical: false,
      reason: 'This stop is tied to fixed travel/hotel booking and cannot be moved safely.',
    }
  }

  const constraints = getTripConstraints(trip)
  const preferences = getTripPreferences(trip)
  const budgetLimit = Number(itinerary?.budgetLimit || trip?.budget || 0)
  const plannedBudget = Number(itinerary?.plannedBudget || 0)
  if (budgetLimit > 0 && plannedBudget > budgetLimit * 1.03) {
    return {
      practical: false,
      reason: 'Current plan is already above remaining budget.',
    }
  }

  const scoredCandidates = futureDays
    .filter((day) => {
      const placeCount = Array.isArray(day?.places) ? day.places.length : 0
      if (placeCount >= constraints.maxPlacesPerDay) {
        return false
      }

      const isFinalDay = day.__index === (itinerary?.days?.length || 1) - 1
      if (isFinalDay && placeCount >= Math.max(2, constraints.maxPlacesPerDay - 1)) {
        return false
      }

      if (constraints.restTimeRequired && placeCount >= Math.max(2, constraints.maxPlacesPerDay - 1)) {
        return false
      }

      if (preferences.pace === 'chill' && placeCount >= 3) {
        return false
      }

      if (Number(day?.travelFare || 0) > Number(day?.totalDayBudget || 0) * 0.55 && placeCount >= 2) {
        return false
      }

      return true
    })
    .map((day) => {
      const affinity = computeAffinityScore(place?.name, day?.places || [])
      const placeCount = Array.isArray(day?.places) ? day.places.length : 0
      const capacityScore = Math.max(0, constraints.maxPlacesPerDay - placeCount)
      const score = affinity * 4 + capacityScore * 2 - placeCount
      return {
        ...day,
        __score: score,
      }
    })
    .sort((a, b) => b.__score - a.__score)

  if (scoredCandidates.length === 0) {
    return {
      practical: false,
      reason: 'No future day has safe capacity for this place.',
    }
  }

  const targetDay = scoredCandidates[0]
  const afterPlace = (targetDay?.places || []).slice(-1)[0]
  return {
    practical: true,
    targetDayIndex: targetDay.__index,
    targetDayId: targetDay.id,
    targetDayNumber: targetDay.dayNumber || targetDay.__index + 1,
    targetDate: targetDay.date || '',
    targetTimeSlot: createSuggestedTimeSlot(targetDay),
    afterPlaceName: String(afterPlace?.name || '').trim(),
  }
}

export function evaluateEndOfDayReview({
  trip,
  itinerary,
  trackerState,
  reviewDate,
  completionMap,
}) {
  const normalizedTracker = normalizeTripTrackerState(trackerState)
  const normalizedItinerary = recalculateItinerary(itinerary, trip)
  const { day, dayIndex } = getProgressByDate(normalizedItinerary, reviewDate)
  const dayPlaces = sortPlacesByTime(day?.places || [])
  const existingStatuses = normalizedTracker?.dailyProgress?.[reviewDate]?.itemStatuses || {}

  const reviewItems = dayPlaces.map((place) => {
    const placeKey = getPlaceKey(place, day?.date || reviewDate)
    const checked = completionMap?.[placeKey] === true
    const previousStatus = existingStatuses?.[placeKey] || 'pending'
    const status = checked ? 'completed' : previousStatus === 'completed' ? 'completed' : 'missed'
    const priority = checked ? 'none' : classifyMissedPlacePriority(place, trip)
    return {
      place,
      placeKey,
      checked,
      status,
      priority,
    }
  })

  const suggestions = reviewItems
    .filter((item) => item.status === 'missed' && (item.priority === 'high' || item.priority === 'medium'))
    .map((item) => {
      const practicality = evaluateReschedulePracticality({
        itinerary: normalizedItinerary,
        trip,
        trackerState: normalizedTracker,
        fromDayIndex: dayIndex,
        place: item.place,
      })

      return {
        ...item,
        practicality,
      }
    })

  return {
    reviewDate,
    dayIndex,
    day,
    reviewItems,
    suggestions,
  }
}

function applyMoveToItinerary({
  itinerary,
  fromDayIndex,
  targetDayIndex,
  placeKey,
  targetTimeSlot,
  targetDate,
}) {
  const next = cloneDeep(itinerary)
  const sourceDay = next?.days?.[fromDayIndex]
  const targetDay = next?.days?.[targetDayIndex]
  if (!sourceDay || !targetDay) {
    return { itinerary: next, movedPlace: null }
  }

  const sourcePlaces = Array.isArray(sourceDay.places) ? sourceDay.places : []
  const sourceIndex = sourcePlaces.findIndex((place) => getPlaceKey(place, sourceDay.date) === placeKey)
  if (sourceIndex < 0) {
    return { itinerary: next, movedPlace: null }
  }

  const [moved] = sourcePlaces.splice(sourceIndex, 1)
  const movedPlace = {
    ...moved,
    date: targetDate || targetDay.date || moved?.date || '',
    estimatedTime: targetTimeSlot || moved?.estimatedTime || '',
    movedFromDate: sourceDay.date || '',
    movedToDate: targetDate || targetDay.date || '',
    isMovedByTracker: true,
  }

  if (!Array.isArray(targetDay.places)) {
    targetDay.places = []
  }
  targetDay.places.push(movedPlace)
  targetDay.places = sortPlacesByTime(targetDay.places)

  return {
    itinerary: next,
    movedPlace,
  }
}

export function buildReschedulePreview({
  trip,
  itinerary,
  trackerState,
  reviewResult,
  decisionsByPlaceKey,
  reviewerUid,
}) {
  const normalizedTracker = normalizeTripTrackerState(trackerState)
  const normalizedItinerary = recalculateItinerary(itinerary, trip)
  const statusMap = {}
  const moveSummaries = []
  const notRescheduled = []
  let workingItinerary = cloneDeep(normalizedItinerary)

  const completedKeys = reviewResult.reviewItems
    .filter((item) => item.status === 'completed')
    .map((item) => item.placeKey)
  completedKeys.forEach((key) => {
    statusMap[key] = 'completed'
  })

  const lowPriorityMisses = reviewResult.reviewItems.filter(
    (item) => item.status === 'missed' && item.priority === 'low',
  )
  lowPriorityMisses.forEach((item) => {
    statusMap[item.placeKey] = 'skipped'
  })

  reviewResult.suggestions.forEach((suggestion) => {
    const decision = decisionsByPlaceKey?.[suggestion.placeKey]

    if (!suggestion.practicality?.practical) {
      statusMap[suggestion.placeKey] = 'missed'
      notRescheduled.push({
        placeName: suggestion.place?.name || 'Place',
        reason: suggestion.practicality?.reason || 'This place could not be reasonably rescheduled.',
      })
      return
    }

    if (decision !== 'yes') {
      statusMap[suggestion.placeKey] = 'missed'
      return
    }

    const { itinerary: movedItinerary, movedPlace } = applyMoveToItinerary({
      itinerary: workingItinerary,
      fromDayIndex: reviewResult.dayIndex,
      targetDayIndex: suggestion.practicality.targetDayIndex,
      placeKey: suggestion.placeKey,
      targetTimeSlot: suggestion.practicality.targetTimeSlot,
      targetDate: suggestion.practicality.targetDate,
    })
    workingItinerary = movedItinerary

    if (!movedPlace) {
      statusMap[suggestion.placeKey] = 'missed'
      notRescheduled.push({
        placeName: suggestion.place?.name || 'Place',
        reason: 'Move could not be applied due to data conflict.',
      })
      return
    }

    statusMap[suggestion.placeKey] = 'moved'
    moveSummaries.push({
      placeKey: suggestion.placeKey,
      placeName: suggestion.place?.name || movedPlace.name || 'Place',
      fromDayNumber: reviewResult.day?.dayNumber || reviewResult.dayIndex + 1,
      fromDate: reviewResult.day?.date || reviewResult.reviewDate,
      toDayNumber: suggestion.practicality.targetDayNumber,
      toDate: suggestion.practicality.targetDate,
      toTimeSlot: suggestion.practicality.targetTimeSlot,
      afterPlaceName: suggestion.practicality.afterPlaceName || '',
    })
  })

  reviewResult.reviewItems
    .filter((item) => item.status === 'missed' && item.priority !== 'low')
    .forEach((item) => {
      if (!statusMap[item.placeKey]) {
        statusMap[item.placeKey] = 'missed'
      }
    })

  const updatedTracker = cloneDeep(normalizedTracker)
  const existingDayProgress = updatedTracker.dailyProgress?.[reviewResult.reviewDate] || {}
  updatedTracker.dailyProgress = {
    ...updatedTracker.dailyProgress,
    [reviewResult.reviewDate]: {
      ...existingDayProgress,
      reviewCompleted: true,
      reviewedByUid: reviewerUid || '',
      reviewedAtMs: Date.now(),
      itemStatuses: statusMap,
      movedItemKeys: Object.keys(statusMap).filter((key) => statusMap[key] === 'moved'),
      skippedItemKeys: Object.keys(statusMap).filter((key) => statusMap[key] === 'skipped'),
      missedItemKeys: Object.keys(statusMap).filter((key) => statusMap[key] === 'missed'),
      completedItemKeys: Object.keys(statusMap).filter((key) => statusMap[key] === 'completed'),
    },
  }

  updatedTracker.movedHistory = { ...(updatedTracker.movedHistory || {}) }
  moveSummaries.forEach((move) => {
    const prev = updatedTracker.movedHistory[move.placeKey] || {}
    updatedTracker.movedHistory[move.placeKey] = {
      count: Number(prev.count || 0) + 1,
      lastMovedToDate: move.toDate,
      lastMovedAtMs: Date.now(),
    }
  })

  if (moveSummaries.length > 0) {
    updatedTracker.changeLog = Array.isArray(updatedTracker.changeLog) ? updatedTracker.changeLog : []
    updatedTracker.changeLog.unshift({
      id: `change_${Date.now()}`,
      date: reviewResult.reviewDate,
      createdAtMs: Date.now(),
      type: 'reschedule',
      movedItems: moveSummaries,
      message: `${moveSummaries.length} missed place(s) rescheduled.`,
    })
    updatedTracker.changeLog = updatedTracker.changeLog.slice(0, 50)
  }

  return {
    previewItinerary: recalculateItinerary(workingItinerary, trip),
    previewTrackerState: updatedTracker,
    moveSummaries,
    notRescheduled,
    statusMap,
  }
}

export async function saveTripTrackerUpdate({ tripId, itinerary, trackerState }) {
  const normalizedTripId = String(tripId || '').trim()
  if (!normalizedTripId) {
    throw new Error('Trip id is required.')
  }

  const database = getDbInstance()
  await updateDoc(doc(database, 'trips', normalizedTripId), {
    itinerary,
    tripTracker: trackerState,
    updatedAt: serverTimestamp(),
  })
}
