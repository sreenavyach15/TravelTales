import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'

function getDbInstance() {
  if (!db) {
    throw new Error('Firebase Firestore is not configured. Add VITE_FIREBASE_* values first.')
  }
  return db
}

function getDateOnly(date) {
  const normalized = new Date(date)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

function hasTripStartedByDate(startDate) {
  if (!startDate) {
    return false
  }

  const today = getDateOnly(new Date())
  const tripStart = getDateOnly(startDate)
  return today >= tripStart
}

export function canDeleteTrip(trip) {
  return !hasTripStartedByDate(trip?.startDate)
}

function normalizeInterests(interestsInput) {
  if (Array.isArray(interestsInput)) {
    return interestsInput
      .map((interest) => String(interest || '').trim().toLowerCase())
      .filter(Boolean)
  }

  if (typeof interestsInput === 'string') {
    return interestsInput
      .split(',')
      .map((interest) => interest.trim().toLowerCase())
      .filter(Boolean)
  }

  return []
}

function normalizeMustVisitPlaces(placesInput) {
  if (Array.isArray(placesInput)) {
    return [...new Set(placesInput.map((place) => String(place || '').trim()).filter(Boolean))]
  }

  if (typeof placesInput === 'string') {
    return [
      ...new Set(
        placesInput
          .split(/[\n,;]+/g)
          .map((place) => place.trim())
          .filter(Boolean),
      ),
    ]
  }

  return []
}

function normalizeFoodPreference(foodPreferenceInput) {
  const normalized = String(foodPreferenceInput || '')
    .trim()
    .toLowerCase()

  if (normalized === 'veg' || normalized === 'non-veg' || normalized === 'vegan') {
    return normalized
  }

  return 'veg'
}

function normalizeChoice(value, allowed, fallback) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  return allowed.includes(normalized) ? normalized : fallback
}

function normalizeNonNegativeNumber(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0
  }

  return Math.round(parsed)
}

function normalizeBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(minimum, Math.min(maximum, parsed))
}

function normalizeTimeValue(value) {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }

  const match = text.match(/^(\d{2}):(\d{2})$/)
  if (!match) {
    return ''
  }

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return ''
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return ''
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function normalizePassengerCount(value) {
  return clampInteger(value, 1, 100, 1)
}

function normalizePreferences(tripInput) {
  const preferenceInput = tripInput?.preferences || {}
  const advancedInput = preferenceInput?.advancedOptions || {}

  return {
    travelStyle: normalizeChoice(
      preferenceInput.travelStyle ?? tripInput.travelStyle,
      ['budget', 'balanced', 'luxury'],
      'balanced',
    ),
    transportMode: normalizeChoice(
      preferenceInput.transportMode ?? tripInput.transportMode,
      ['scooter', 'cab', 'mixed'],
      'mixed',
    ),
    transportOwnership: normalizeChoice(
      preferenceInput.transportOwnership ?? tripInput.transportOwnership,
      ['own', 'public'],
      'public',
    ),
    pace: normalizeChoice(
      preferenceInput.pace ?? tripInput.pace,
      ['chill', 'moderate', 'packed', 'relaxed', 'balanced', 'fast'],
      'moderate',
    ),
    interests: normalizeInterests(preferenceInput.interests ?? tripInput.interests),
    mustVisitPlaces: normalizeMustVisitPlaces(
      preferenceInput.mustVisitPlaces ?? tripInput.mustVisitPlaces,
    ),
    foodPreference: normalizeFoodPreference(preferenceInput.foodPreference ?? tripInput.foodPreference),
    crowdTolerance: normalizeChoice(
      preferenceInput.crowdTolerance ?? tripInput.crowdTolerance,
      ['low', 'medium', 'high'],
      'medium',
    ),
    advancedOptions: {
      hotelBudgetPerNight: normalizeNonNegativeNumber(
        advancedInput.hotelBudgetPerNight ?? tripInput.hotelBudgetPerNight,
      ),
      foodBudgetPerDay: normalizeNonNegativeNumber(
        advancedInput.foodBudgetPerDay ?? tripInput.foodBudgetPerDay,
      ),
      activityBudgetPerDay: normalizeNonNegativeNumber(
        advancedInput.activityBudgetPerDay ?? tripInput.activityBudgetPerDay,
      ),
    },
  }
}

function normalizeConstraints(tripInput) {
  const constraintsInput = tripInput?.constraints || {}

  return {
    maxTravelTimePerDay: clampInteger(constraintsInput.maxTravelTimePerDay, 2, 12, 6),
    maxPlacesPerDay: clampInteger(constraintsInput.maxPlacesPerDay, 1, 10, 4),
    restTimeRequired: normalizeBoolean(constraintsInput.restTimeRequired),
    weatherSensitive: normalizeBoolean(constraintsInput.weatherSensitive),
  }
}

function buildTripPayload(userId, tripInput) {
  const preferences = normalizePreferences(tripInput)
  const constraints = normalizeConstraints(tripInput)
  const passengerCount = normalizePassengerCount(tripInput.passengerCount)
  const budgetPerHead = normalizeNonNegativeNumber(tripInput.budgetPerHead ?? tripInput.budget)
  const totalBudget = normalizeNonNegativeNumber(budgetPerHead * passengerCount)

  return {
    userId,
    destination: String(tripInput.destination || '').trim(),
    startDate: tripInput.startDate || '',
    endDate: tripInput.endDate || '',
    arrivalTime: normalizeTimeValue(tripInput.arrivalTime),
    departureTime: normalizeTimeValue(tripInput.departureTime),
    passengerCount,
    budgetPerHead,
    budget: totalBudget,
    budgetInputType: 'per_head',
    preferences,
    constraints,
    interests: preferences.interests,
    mustVisitPlaces: preferences.mustVisitPlaces,
    foodPreference: preferences.foodPreference,
    pace: preferences.pace,
  }
}

export async function createTrip(userId, tripInput) {
  const database = getDbInstance()
  const normalizedBase = buildTripPayload(userId, tripInput)
  const payload = {
    ...normalizedBase,
    status: 'ongoing',
    itinerary: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = await addDoc(collection(database, 'trips'), payload)
  return docRef.id
}

export async function getOngoingTrips(userId) {
  const database = getDbInstance()
  const tripsQuery = query(collection(database, 'trips'), where('userId', '==', userId))

  const snapshot = await getDocs(tripsQuery)
  const trips = snapshot.docs.map((tripDoc) => ({
    id: tripDoc.id,
    ...tripDoc.data(),
  }))

  return trips
    .filter((trip) => trip.status === 'ongoing')
    .sort((firstTrip, secondTrip) => {
      const firstTime = firstTrip.createdAt?.toMillis?.() ?? 0
      const secondTime = secondTrip.createdAt?.toMillis?.() ?? 0
      return secondTime - firstTime
    })
}

export async function getTripsByUser(userId) {
  if (!userId) {
    return []
  }

  const database = getDbInstance()
  const tripsQuery = query(collection(database, 'trips'), where('userId', '==', userId))
  const snapshot = await getDocs(tripsQuery)

  return snapshot.docs
    .map((tripDoc) => ({
      id: tripDoc.id,
      ...tripDoc.data(),
    }))
    .sort((firstTrip, secondTrip) => {
      const firstTime = firstTrip.createdAt?.toMillis?.() ?? 0
      const secondTime = secondTrip.createdAt?.toMillis?.() ?? 0
      return secondTime - firstTime
    })
}

export async function getTripById(tripId) {
  const database = getDbInstance()
  const tripRef = doc(database, 'trips', tripId)
  const snapshot = await getDoc(tripRef)

  if (!snapshot.exists()) {
    return null
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  }
}

export async function saveTripItinerary(tripId, itinerary) {
  const database = getDbInstance()
  const tripRef = doc(database, 'trips', tripId)
  await updateDoc(tripRef, { itinerary, updatedAt: serverTimestamp() })
}

export async function updateTripIfItineraryNotGenerated({ tripId, userId, tripInput }) {
  const normalizedTripId = String(tripId || '').trim()
  if (!normalizedTripId) {
    throw new Error('Trip id is required.')
  }

  const database = getDbInstance()
  const tripRef = doc(database, 'trips', normalizedTripId)
  const snapshot = await getDoc(tripRef)

  if (!snapshot.exists()) {
    throw new Error('Trip not found.')
  }

  const existingTrip = snapshot.data()
  if (existingTrip.userId !== userId) {
    throw new Error('You are not allowed to edit this trip.')
  }

  const hasPlan = Array.isArray(existingTrip?.itinerary?.days) && existingTrip.itinerary.days.length > 0
  if (hasPlan) {
    throw new Error('Trip details cannot be edited after itinerary is generated.')
  }

  const normalizedBase = buildTripPayload(userId, tripInput)
  await updateDoc(tripRef, {
    ...normalizedBase,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteTripIfAllowed({ tripId, userId }) {
  const database = getDbInstance()
  const tripRef = doc(database, 'trips', tripId)
  const snapshot = await getDoc(tripRef)

  if (!snapshot.exists()) {
    throw new Error('Trip not found.')
  }

  const trip = snapshot.data()
  if (trip.userId !== userId) {
    throw new Error('You are not allowed to delete this trip.')
  }

  if (hasTripStartedByDate(trip.startDate)) {
    throw new Error('Trip cannot be deleted because it has already started.')
  }

  await deleteDoc(tripRef)
}
