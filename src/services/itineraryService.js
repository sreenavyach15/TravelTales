function getTripDayCount(startDate, endDate) {
  if (!startDate || !endDate) {
    return 3
  }

  const start = new Date(startDate)
  const end = new Date(endDate)
  const diffMs = end.getTime() - start.getTime()
  const rawDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1
  return Math.max(1, rawDays)
}

function addDays(dateString, offset) {
  if (!dateString) {
    return ''
  }

  const base = new Date(dateString)
  base.setDate(base.getDate() + offset)
  return base.toISOString().split('T')[0]
}

function roundBudget(value) {
  return Math.max(0, Math.round(Number(value || 0)))
}

function parseTimeToHour(timeValue) {
  const text = String(timeValue || '').trim()
  const match = text.match(/^(\d{2}):(\d{2})$/)
  if (!match) {
    return null
  }

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }

  return hour + minute / 60
}

function formatHour(value) {
  const clamped = Math.max(0, Math.min(23.5, Number(value || 0)))
  const hour = Math.floor(clamped)
  const minute = Math.round((clamped - hour) * 60)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function parseEstimatedTimeRange(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/)
  if (!match) {
    return null
  }

  const startHour = Number(match[1]) + Number(match[2]) / 60
  const endHour = Number(match[3]) + Number(match[4]) / 60

  if (!Number.isFinite(startHour) || !Number.isFinite(endHour) || endHour <= startHour) {
    return null
  }

  return { startHour, endHour }
}

function distributeEvenly(total, count) {
  const safeCount = Math.max(1, Number(count || 1))
  const safeTotal = roundBudget(total)
  const baseValue = Math.floor(safeTotal / safeCount)
  let remainder = safeTotal - baseValue * safeCount

  return Array.from({ length: safeCount }).map(() => {
    const bump = remainder > 0 ? 1 : 0
    remainder -= bump
    return baseValue + bump
  })
}

const COMPLEMENTARY_DESTINATION_CATALOG = [
  {
    keywords: ['visakhapatnam', 'vizag'],
    places: [
      {
        name: 'Araku Valley',
        tags: ['nature', 'food'],
        popularity: 95,
        minimumTripDays: 2,
        travelMode: 'Train / Cab',
        travelFareBase: 1200,
        activities: 'Scenic hill views, coffee estate visits, and local tribal culture exploration.',
        thingsToTry: 'Araku coffee, bamboo chicken, and tribal handicrafts.',
        description:
          'Araku Valley is a highland retreat known for cool climate, coffee plantations, and indigenous cultural heritage, making it a meaningful extension from Visakhapatnam.',
      },
      {
        name: 'Borra Caves',
        tags: ['nature', 'history', 'spiritual'],
        popularity: 82,
        minimumTripDays: 2,
        travelMode: 'Cab',
        travelFareBase: 900,
        activities: 'Limestone cave walk, geological formations, and viewpoint stops.',
        thingsToTry: 'Local snacks around cave viewpoints and nearby village produce.',
        description:
          'Borra Caves feature dramatic stalactite and stalagmite formations and are often paired with Araku as a full-day nature-and-heritage circuit.',
      },
    ],
  },
  {
    keywords: ['dehradun'],
    places: [
      {
        name: 'Mussoorie',
        tags: ['nature', 'food', 'party'],
        popularity: 93,
        minimumTripDays: 2,
        travelMode: 'Cab / Bus',
        travelFareBase: 1000,
        activities: 'Mall Road walk, viewpoints, colonial-era sites, and evening cafes.',
        thingsToTry: 'Hill-station bakery items, local Tibetan food, and tea cafes.',
        description:
          'Mussoorie is the classic hill companion for Dehradun, offering mountain views, colonial charm, and relaxed evening experiences.',
      },
      {
        name: "Robber's Cave",
        tags: ['nature', 'adventure'],
        popularity: 74,
        minimumTripDays: 1,
        travelMode: 'Cab',
        travelFareBase: 500,
        activities: 'Stream walk inside cave passages and short nature exploration.',
        thingsToTry: 'Quick local snacks and tea stalls nearby.',
        description:
          "Robber's Cave is a compact natural attraction near Dehradun, useful for half-day scenic and light-adventure plans.",
      },
    ],
  },
  {
    keywords: ['delhi', 'new delhi'],
    places: [
      {
        name: 'Agra',
        tags: ['history', 'food'],
        popularity: 97,
        minimumTripDays: 3,
        travelMode: 'Train / Cab',
        travelFareBase: 2000,
        activities: 'Taj Mahal visit, Agra Fort, and Mughal-era heritage trail.',
        thingsToTry: 'Petha sweets, Mughlai cuisine, and local marble craft shopping.',
        description:
          'Agra is one of the most common extensions from Delhi for iconic Mughal heritage and architecture-led cultural immersion.',
      },
      {
        name: 'Jaipur',
        tags: ['history', 'food', 'shopping', 'party'],
        popularity: 96,
        minimumTripDays: 4,
        travelMode: 'Train / Cab',
        travelFareBase: 2500,
        activities: 'Amber Fort, City Palace, bazaars, and evening cultural shows.',
        thingsToTry: 'Rajasthani thali, block-printed textiles, and handicraft shopping.',
        description:
          'Jaipur complements Delhi with palace architecture, vibrant bazaars, and strong cultural identity, ideal for longer North India circuits.',
      },
      {
        name: 'Neemrana Fort',
        tags: ['history', 'luxury'],
        popularity: 70,
        minimumTripDays: 2,
        travelMode: 'Cab',
        travelFareBase: 1400,
        activities: 'Fort exploration, heritage stay experience, and sunset viewpoints.',
        thingsToTry: 'Traditional North Indian cuisine within heritage property settings.',
        description:
          'Neemrana offers a shorter heritage detour from Delhi with fort architecture and a distinct historical atmosphere.',
      },
    ],
  },
  {
    keywords: ['goa'],
    places: [
      {
        name: 'Dudhsagar Falls',
        tags: ['nature', 'adventure'],
        popularity: 90,
        minimumTripDays: 3,
        travelMode: 'Cab / Jeep',
        travelFareBase: 1800,
        activities: 'Waterfall viewpoints, forest-route transit, and nature photography.',
        thingsToTry: 'Goan village-style meals and seasonal local produce.',
        description:
          'Dudhsagar Falls is a popular high-impact day excursion from Goa, adding dramatic inland nature to a beach-focused trip.',
      },
      {
        name: 'South Goa Coastal Circuit',
        tags: ['beach', 'nature', 'spiritual'],
        popularity: 88,
        minimumTripDays: 2,
        travelMode: 'Scooter / Cab',
        travelFareBase: 1000,
        activities: 'Palolem/Colva side beaches, quieter coves, and sunset viewpoints.',
        thingsToTry: 'Seafood shacks, beach cafes, and local coconut-based dishes.',
        description:
          'South Goa provides a calmer contrast to busier zones, with scenic beaches and relaxed pacing suitable for balanced itineraries.',
      },
      {
        name: 'Old Goa Churches',
        tags: ['history', 'spiritual'],
        popularity: 80,
        minimumTripDays: 2,
        travelMode: 'Cab / Bus',
        travelFareBase: 700,
        activities: 'Heritage church circuit, museum visits, and cultural architecture walk.',
        thingsToTry: 'Traditional bakery items and heritage district cafes.',
        description:
          "Old Goa's UNESCO-linked churches bring colonial-era religious architecture and historical depth to a Goa trip.",
      },
    ],
  },
]

export function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function defaultDescription(destination, placeName) {
  return `${placeName} is one of the notable places in ${destination}. The area reflects local history and culture, and it offers a practical way to understand how the destination evolved over time. Highlights typically include architecture, nearby markets, and opportunities to interact with local food and everyday life.`
}

export function createEmptyPlace(date = '') {
  return {
    id: generateId('place'),
    name: '',
    date,
    estimatedTime: '',
    travelModeFromPrevious: '',
    travelFare: 0,
    activities: '',
    thingsToTry: '',
    estimatedBudget: 0,
    description: '',
  }
}

function buildActivity({
  dayNumber,
  stopNumber,
  destination,
  date,
  itemBudget,
  dayStartHour = 9,
  transportPlan = null,
}) {
  const templates = [
    {
      name: 'Heritage Quarter',
      mode: 'Metro + Walk',
      activities: 'Explore old architecture, watch local performances, and visit heritage streets.',
      try: 'Street snacks, handicraft shopping, and local tea.',
    },
    {
      name: 'City Museum',
      mode: 'Cab',
      activities: 'Follow curated galleries and historical exhibits with an audio guide.',
      try: 'Museum cafe specials and curated souvenir corner.',
    },
    {
      name: 'Old Market Street',
      mode: 'Walk',
      activities: 'Walk through market lanes, photography, and local interactions.',
      try: 'Regional sweets, quick eats, and bargain shopping.',
    },
    {
      name: 'Riverfront Promenade',
      mode: 'Bus',
      activities: 'Leisure walk, sunset view, and local cultural stalls.',
      try: 'Boat ride, evening snacks, and local crafts.',
    },
  ]

  const selected = templates[(dayNumber + stopNumber) % templates.length]
  const name = `${destination} ${selected.name}`

  const startHour = dayStartHour + (stopNumber - 1) * 2
  const endHour = Math.min(startHour + 2, 23.5)
  const fareMultiplier = Number(transportPlan?.fareMultiplier || 1)
  const resolvedTravelMode = transportPlan?.forceMode ? transportPlan.modeLabel : selected.mode

  return {
    id: generateId('place'),
    name,
    date,
    estimatedTime: `${formatHour(startHour)} - ${formatHour(endHour)}`,
    travelModeFromPrevious:
      stopNumber === 1
        ? transportPlan?.firstLegLabel || 'Hotel -> Place (Cab)'
        : resolvedTravelMode,
    travelFare: roundBudget(itemBudget * 0.12 * fareMultiplier),
    activities: selected.activities,
    thingsToTry: selected.try,
    estimatedBudget: itemBudget,
    description: defaultDescription(destination, name),
  }
}

function buildComplementaryActivity({
  destination,
  date,
  itemBudget,
  stopNumber,
  complementaryPlace,
  dayStartHour = 9,
  transportPlan = null,
}) {
  const startHour = dayStartHour + Math.max(0, stopNumber - 1) * 2
  const endHour = Math.min(startHour + 2, 23.5)
  const resolvedTravelMode = transportPlan?.forceMode
    ? transportPlan.modeLabel
    : complementaryPlace.travelMode || transportPlan?.modeLabel || 'Cab / Bus'
  const fareMultiplier = Number(transportPlan?.fareMultiplier || 1)

  return {
    id: generateId('place'),
    name: complementaryPlace.name,
    date,
    estimatedTime: `${formatHour(startHour)} - ${formatHour(endHour)}`,
    travelModeFromPrevious: resolvedTravelMode,
    travelFare: roundBudget(
      Math.max(itemBudget * 0.18, complementaryPlace.travelFareBase || 0) * fareMultiplier,
    ),
    activities:
      complementaryPlace.activities ||
      `Day excursion to ${complementaryPlace.name} from ${destination}.`,
    thingsToTry:
      complementaryPlace.thingsToTry || 'Local cuisine, regional culture, and neighborhood highlights.',
    estimatedBudget: roundBudget(itemBudget * 1.15),
    description:
      complementaryPlace.description ||
      `${complementaryPlace.name} is a meaningful nearby extension to ${destination}, often included to broaden the overall travel experience.`,
  }
}

function normalizePlace(place, fallbackDate = '') {
  return {
    id: place?.id || generateId('place'),
    name: String(place?.name || place?.place || '').trim(),
    date: String(place?.date || fallbackDate || '').trim(),
    estimatedTime: String(place?.estimatedTime || '').trim(),
    travelModeFromPrevious: String(place?.travelModeFromPrevious || '').trim(),
    travelFare: roundBudget(place?.travelFare),
    activities: String(place?.activities || place?.thingsToDo || '').trim(),
    thingsToTry: String(place?.thingsToTry || '').trim(),
    estimatedBudget: roundBudget(place?.estimatedBudget),
    description: String(place?.description || '').trim(),
  }
}

function summarizeDay(day, accommodationCost) {
  const placesBudget = day.places.reduce((sum, place) => sum + place.estimatedBudget, 0)
  const travelFare = day.places.reduce((sum, place) => sum + place.travelFare, 0)
  return {
    ...day,
    accommodationCost,
    placesBudget,
    travelFare,
    totalDayBudget: placesBudget + travelFare + accommodationCost,
  }
}

function getTripPreference(trip, key, fallback = '') {
  const nestedValue = trip?.preferences?.[key]
  const topLevelValue = trip?.[key]
  return nestedValue ?? topLevelValue ?? fallback
}

function getTripInterests(trip) {
  const nestedInterests = trip?.preferences?.interests
  const topLevelInterests = trip?.interests
  return Array.isArray(nestedInterests) ? nestedInterests : Array.isArray(topLevelInterests) ? topLevelInterests : []
}

function getTripMustVisitPlaces(trip) {
  const nestedPlaces = trip?.preferences?.mustVisitPlaces
  const topLevelPlaces = trip?.mustVisitPlaces
  const source = Array.isArray(nestedPlaces)
    ? nestedPlaces
    : Array.isArray(topLevelPlaces)
      ? topLevelPlaces
      : typeof nestedPlaces === 'string'
        ? nestedPlaces.split(/[\n,;]+/g)
        : typeof topLevelPlaces === 'string'
          ? topLevelPlaces.split(/[\n,;]+/g)
          : []

  return [...new Set(source.map((place) => String(place || '').trim()).filter(Boolean))]
}

function getTripLogistics(trip) {
  return {
    arrivalHour: parseTimeToHour(trip?.arrivalTime),
    departureHour: parseTimeToHour(trip?.departureTime),
    passengerCount: Math.max(1, Number(trip?.passengerCount || 1)),
  }
}

function getTransportPlan(trip) {
  const transportOwnership = String(getTripPreference(trip, 'transportOwnership', 'public'))
    .trim()
    .toLowerCase()
  const passengerCount = Math.max(1, Number(trip?.passengerCount || 1))

  if (transportOwnership === 'own') {
    return {
      modeLabel: 'Cab / Walk',
      firstLegLabel: 'Hotel -> Place (Cab)',
      fareMultiplier: Math.max(0.7, Math.min(1.2, 0.8 + passengerCount * 0.08)),
      forceMode: true,
    }
  }

  return {
    modeLabel: 'Public Transit + Walk',
    firstLegLabel: 'Hotel -> Place (Bus / Metro)',
    fareMultiplier: Math.max(1, Math.min(3, 0.8 + passengerCount * 0.35)),
    forceMode: false,
  }
}

function normalizeTransportModeLabel(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (!normalized) {
    return ''
  }

  if (normalized.includes('walk')) return 'Walk'
  if (normalized.includes('metro')) return 'Metro'
  if (normalized.includes('bus')) return 'Bus'
  if (normalized.includes('train')) return 'Train'
  if (normalized.includes('cab') || normalized.includes('taxi') || normalized.includes('auto')) return 'Cab'
  return ''
}

function inferPublicTransportMode(travelFare) {
  const fare = Number(travelFare || 0)
  if (fare <= 80) return 'Walk'
  if (fare <= 180) return 'Bus'
  if (fare <= 320) return 'Metro'
  if (fare <= 500) return 'Train'
  return 'Cab'
}

export function applyTransportAccessRules(itinerary, trip) {
  if (!itinerary?.days?.length) {
    return itinerary
  }

  const ownership = String(getTripPreference(trip, 'transportOwnership', 'public'))
    .trim()
    .toLowerCase()

  const normalizedDays = itinerary.days.map((day) => {
    const places = Array.isArray(day?.places) ? day.places : []
    const normalizedPlaces = places.map((place, index) => {
      const currentMode = normalizeTransportModeLabel(place?.travelModeFromPrevious)

      if (ownership === 'own') {
        const mode =
          currentMode === 'Walk' || currentMode === 'Cab'
            ? currentMode
            : Number(place?.travelFare || 0) <= 100
              ? 'Walk'
              : 'Cab'
        return {
          ...place,
          travelModeFromPrevious: index === 0 ? `Hotel -> Place (${mode})` : mode,
          travelFare: mode === 'Walk' ? 0 : roundBudget(place?.travelFare || 150),
        }
      }

      const mode = currentMode || inferPublicTransportMode(place?.travelFare)
      return {
        ...place,
        travelModeFromPrevious: index === 0 ? `Hotel -> Place (${mode})` : mode,
        travelFare: mode === 'Walk' ? 0 : roundBudget(place?.travelFare || 120),
      }
    })

    return {
      ...day,
      places: normalizedPlaces,
    }
  })

  return recalculateItinerary(
    {
      ...itinerary,
      days: normalizedDays,
    },
    trip,
  )
}

function getTripConstraints(trip) {
  const constraints = trip?.constraints || {}
  return {
    maxTravelTimePerDay: Number(constraints.maxTravelTimePerDay ?? 8),
    maxPlacesPerDay: Number(constraints.maxPlacesPerDay ?? 4),
    restTimeRequired: Boolean(constraints.restTimeRequired),
  }
}

function getTripTravelStyle(trip) {
  return String(getTripPreference(trip, 'travelStyle', 'balanced'))
    .trim()
    .toLowerCase()
}

const INTEREST_KEYWORD_MAP = {
  beach: ['beach', 'coast', 'sea', 'bay', 'island', 'sunset'],
  food: ['food', 'cafe', 'restaurant', 'street', 'market', 'dining', 'taste'],
  history: ['museum', 'fort', 'palace', 'heritage', 'history', 'monument', 'old'],
  party: ['nightlife', 'club', 'bar', 'music', 'party', 'pub'],
  nature: ['park', 'valley', 'hill', 'lake', 'waterfall', 'garden', 'nature'],
  spiritual: ['temple', 'church', 'mosque', 'ashram', 'spiritual', 'shrine'],
}

function getInterestKeywords(trip) {
  const interests = getTripInterests(trip).map((interest) => normalizeText(interest))
  const keywords = new Set()

  interests.forEach((interest) => {
    const mapped = INTEREST_KEYWORD_MAP[interest]
    if (mapped) {
      mapped.forEach((keyword) => keywords.add(normalizeText(keyword)))
    }
    if (interest) {
      keywords.add(interest)
    }
  })

  return keywords
}

function scorePlaceByPreferences(place, interestKeywords) {
  const haystack = normalizeText(
    `${place?.name || ''} ${place?.activities || ''} ${place?.thingsToTry || ''} ${place?.description || ''}`,
  )
  if (!haystack) {
    return 0
  }

  let score = 0
  interestKeywords.forEach((keyword) => {
    if (keyword && haystack.includes(keyword)) {
      score += 10
    }
  })

  return score
}

function estimatePlaceDurationHours(place) {
  const range = parseEstimatedTimeRange(place?.estimatedTime)
  if (range) {
    return Math.max(1, Math.min(3.5, range.endHour - range.startHour))
  }
  return 2
}

function estimateTransitHours(place) {
  const mode = normalizeText(place?.travelModeFromPrevious)
  if (mode.includes('walk')) return 0.25
  if (mode.includes('metro') || mode.includes('bus') || mode.includes('train')) return 0.75
  return 0.5
}

function estimateDayHours(places) {
  return places.reduce((sum, place) => sum + estimatePlaceDurationHours(place) + estimateTransitHours(place), 0)
}

function getTripDateRange(trip, fallbackCount) {
  const fallbackDayCount = Math.max(1, Number(fallbackCount || 1))
  const dayCount =
    trip?.startDate && trip?.endDate
      ? getTripDayCount(trip.startDate, trip.endDate)
      : fallbackDayCount

  if (!trip?.startDate || !trip?.endDate) {
    return Array.from({ length: dayCount }).map((_, index) => ({
      dayNumber: index + 1,
      date: '',
    }))
  }

  const generated = []
  for (let index = 0; index < dayCount; index += 1) {
    generated.push({
      dayNumber: index + 1,
      date: addDays(trip.startDate, index),
    })
  }
  return generated
}

function getDayWindow({ trip, dayIndex, totalDays }) {
  const defaultStartHour = 9
  const defaultEndHour = 20
  const arrivalHour = parseTimeToHour(trip?.arrivalTime)
  const departureHour = parseTimeToHour(trip?.departureTime)

  let startHour = defaultStartHour
  let endHour = defaultEndHour

  if (dayIndex === 0 && arrivalHour !== null) {
    startHour = Math.max(defaultStartHour, Math.min(defaultEndHour - 2, Math.ceil(arrivalHour + 0.5)))
  }
  if (dayIndex === totalDays - 1 && departureHour !== null) {
    endHour = Math.min(defaultEndHour, Math.max(startHour + 2, Math.floor(departureHour - 0.5)))
  }

  if (endHour <= startHour + 1) {
    endHour = Math.min(23.5, startHour + 2)
  }

  return { startHour, endHour }
}

function applySequentialTimeFlow(places, startHour, endHour, includeRest) {
  if (!Array.isArray(places) || places.length === 0) {
    return []
  }

  const remainingGapBudget = Math.max(0.25, endHour - startHour - places.length * 1.5)
  const gapPerStop = Math.max(0.2, Math.min(0.75, remainingGapBudget / Math.max(1, places.length)))

  let cursor = startHour
  return places.map((place, index) => {
    const rawDuration = estimatePlaceDurationHours(place)
    const maxDurationAllowed = Math.max(1, endHour - cursor - (places.length - index - 1) * 1.5)
    const duration = Math.max(1, Math.min(2.5, rawDuration, maxDurationAllowed))
    const start = cursor
    const end = Math.min(endHour, start + duration)
    cursor = Math.min(endHour, end + gapPerStop)

    const nextActivities =
      includeRest && index === 1
        ? `${place.activities || ''} Include a short rest break before the next stop.`.trim()
        : place.activities

    return {
      ...place,
      estimatedTime: `${formatHour(start)} - ${formatHour(end)}`,
      activities: nextActivities,
    }
  })
}

function enforceDailyFeasibility(day, trip, dayIndex, totalDays, constraints, interestKeywords) {
  const date = String(day?.date || '').trim()
  const placesRaw = Array.isArray(day?.places) ? day.places : []

  const uniqueByName = new Map()
  placesRaw.forEach((place) => {
    const normalized = normalizePlace(place, date)
    const key = normalizeText(normalized.name) || normalized.id
    if (!uniqueByName.has(key)) {
      uniqueByName.set(key, normalized)
    }
  })

  let places = [...uniqueByName.values()]
  const maxPlacesPerDay = Math.max(1, Number(constraints.maxPlacesPerDay || 4))
  const maxTravelHours = Math.max(2, Number(constraints.maxTravelTimePerDay || 8))

  while (places.length > maxPlacesPerDay) {
    const scored = places.map((place, index) => ({
      index,
      score: scorePlaceByPreferences(place, interestKeywords),
    }))
    scored.sort((a, b) => a.score - b.score)
    places.splice(scored[0].index, 1)
  }

  while (places.length > 1 && estimateDayHours(places) > maxTravelHours) {
    const scored = places.map((place, index) => ({
      index,
      score: scorePlaceByPreferences(place, interestKeywords) - estimatePlaceDurationHours(place) * 2,
    }))
    scored.sort((a, b) => a.score - b.score)
    places.splice(scored[0].index, 1)
  }

  const dayWindow = getDayWindow({ trip, dayIndex, totalDays })
  const timedPlaces = applySequentialTimeFlow(
    places,
    dayWindow.startHour,
    dayWindow.endHour,
    Boolean(constraints.restTimeRequired),
  )

  return {
    ...day,
    date,
    places: timedPlaces,
  }
}

function applyBudgetDistributionWithBuffer(itinerary, trip) {
  if (!itinerary?.days?.length) {
    return itinerary
  }

  const travelStyle = getTripTravelStyle(trip)
  const dayCount = itinerary.days.length
  const budgetLimit = roundBudget(itinerary?.budgetLimit || trip?.budget || 0)
  const effectiveBudget = roundBudget(budgetLimit * 0.92)

  const accommodationRatio =
    travelStyle === 'luxury' ? 0.4 : travelStyle === 'budget' ? 0.28 : 0.34
  const accommodationByDay = distributeEvenly(roundBudget(effectiveBudget * accommodationRatio), dayCount)
  const variableBudget = Math.max(0, effectiveBudget - accommodationByDay.reduce((sum, value) => sum + value, 0))

  const weightByDay = Array.from({ length: dayCount }).map((_, dayIndex) => {
    if (dayCount <= 2) return 1
    if (dayIndex === 0 || dayIndex === dayCount - 1) return 0.85
    return 1.1
  })
  const weightTotal = weightByDay.reduce((sum, value) => sum + value, 0) || 1

  const updatedDays = itinerary.days.map((day, dayIndex) => {
    const dayTargetVariable = (variableBudget * weightByDay[dayIndex]) / weightTotal
    const currentPlacesBudget = day.places.reduce((sum, place) => sum + roundBudget(place.estimatedBudget), 0)
    const currentTravelFare = day.places.reduce((sum, place) => sum + roundBudget(place.travelFare), 0)
    const currentVariable = Math.max(1, currentPlacesBudget + currentTravelFare)
    const scale = dayTargetVariable / currentVariable

    const scaledPlaces = day.places.map((place) => ({
      ...place,
      estimatedBudget: roundBudget(place.estimatedBudget * scale),
      travelFare: normalizeText(place.travelModeFromPrevious).includes('walk')
        ? 0
        : roundBudget(place.travelFare * scale),
    }))

    return {
      ...day,
      accommodationCost: accommodationByDay[dayIndex] || 0,
      places: scaledPlaces,
    }
  })

  return {
    ...itinerary,
    budgetLimit,
    budgetBuffer: Math.max(0, budgetLimit - effectiveBudget),
    days: updatedDays,
  }
}

export function optimizeItineraryForTrip(itinerary, trip) {
  if (!itinerary?.days?.length) {
    return itinerary
  }

  return applyTransportAccessRules(recalculateItinerary(itinerary, trip), trip)
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSpreadDayIndexes(dayCount, count) {
  if (dayCount <= 0 || count <= 0) {
    return []
  }

  if (dayCount === 1) {
    return [0]
  }

  const indexes = []
  const step = dayCount / (count + 1)

  for (let index = 0; index < count; index += 1) {
    let dayIndex = Math.round(step * (index + 1)) - 1
    dayIndex = Math.max(0, Math.min(dayCount - 1, dayIndex))

    while (indexes.includes(dayIndex) && dayIndex < dayCount - 1) {
      dayIndex += 1
    }
    while (indexes.includes(dayIndex) && dayIndex > 0) {
      dayIndex -= 1
    }

    indexes.push(dayIndex)
  }

  return indexes
}

function getComplementaryCountLimit(trip, dayCount) {
  const constraints = getTripConstraints(trip)
  const budgetPerDay = dayCount > 0 ? roundBudget(trip?.budget) / dayCount : roundBudget(trip?.budget)

  let maxCount = dayCount <= 3 ? 1 : dayCount <= 6 ? 2 : 3
  if (constraints.maxPlacesPerDay <= 2 || constraints.maxTravelTimePerDay <= 5) {
    maxCount = Math.min(maxCount, 1)
  }
  if (budgetPerDay > 0 && budgetPerDay < 1800) {
    maxCount = Math.min(maxCount, 1)
  }

  return Math.max(0, maxCount)
}

function getComplementaryEntry(destination) {
  const normalizedDestination = normalizeText(destination)
  if (!normalizedDestination) {
    return null
  }

  return (
    COMPLEMENTARY_DESTINATION_CATALOG.find((entry) =>
      entry.keywords.some((keyword) => normalizedDestination.includes(normalizeText(keyword))),
    ) || null
  )
}

export function getComplementaryDestinationsForTrip(trip) {
  const dayCount = getTripDayCount(trip?.startDate, trip?.endDate)
  const entry = getComplementaryEntry(trip?.destination)
  if (!entry) {
    return []
  }

  const interestSet = new Set(getTripInterests(trip).map((interest) => normalizeText(interest)))
  const countLimit = getComplementaryCountLimit(trip, dayCount)
  if (countLimit === 0) {
    return []
  }

  const rankedPlaces = entry.places
    .map((place) => {
      const matchingInterestCount = place.tags.filter((tag) => interestSet.has(normalizeText(tag))).length
      const minimumDaysPenalty = dayCount < (place.minimumTripDays || 1) ? 25 : 0
      const score = (place.popularity || 50) + matchingInterestCount * 14 - minimumDaysPenalty
      return { ...place, score }
    })
    .sort((first, second) => second.score - first.score)

  return rankedPlaces.slice(0, countLimit)
}

function normalizeWhyThisPlan(whyThisPlan, trip, dayCount) {
  const interestsArray = getTripInterests(trip)
  const interests =
    interestsArray.length > 0
      ? interestsArray.join(', ')
      : String(getTripPreference(trip, 'interests', 'general highlights')).trim()
  const passengerCount = Math.max(1, Number(trip?.passengerCount || 1))
  const foodPreference = String(getTripPreference(trip, 'foodPreference', 'veg'))
    .trim()
    .toLowerCase()
  const pace = String(getTripPreference(trip, 'pace', 'balanced')).trim()
  const budget = Number(trip?.budget || 0)
  const budgetPerHead = Math.round(
    Number(trip?.budgetPerHead || budget / Math.max(1, passengerCount)),
  )

  return {
    budget:
      whyThisPlan?.budget ||
      `Budget per head ${budgetPerHead} (total ${budget} for ${passengerCount} travelers) is distributed across ${dayCount} days with balanced accommodation, activities, and transport.`,
    interests:
      whyThisPlan?.interests ||
      `Activities and stops are aligned with interests: ${interests}. Food suggestions follow ${foodPreference} preference.`,
    pace:
      whyThisPlan?.pace || `Pace preference is set to ${pace}, so timing and stop count are tuned accordingly.`,
    optimization:
      whyThisPlan?.optimization ||
      'Nearby places are grouped to reduce unnecessary travel and route backtracking.',
  }
}

export function recalculateItinerary(itinerary, trip = null) {
  if (!itinerary?.days) {
    return itinerary
  }

  const normalizedDaysBase = itinerary.days.map((day, index) => {
    const normalizedDayDate = String(day?.date || '').trim()
    const places = Array.isArray(day?.places) ? day.places : []
    const normalizedPlaces = places.map((place) => normalizePlace(place, normalizedDayDate))

    return {
      id: day?.id || generateId('day'),
      dayNumber: Number(day?.dayNumber || index + 1),
      date: normalizedDayDate,
      places: normalizedPlaces,
      accommodationCost: roundBudget(day?.accommodationCost),
    }
  })

  const dayCount = Math.max(1, normalizedDaysBase.length)
  const budgetLimit = roundBudget(itinerary?.budgetLimit || trip?.budget || 0)

  const hasAnyAccommodation = normalizedDaysBase.some((day) => day.accommodationCost > 0)
  const distributedAccommodation = hasAnyAccommodation
    ? normalizedDaysBase.map((day) => day.accommodationCost)
    : distributeEvenly(roundBudget(budgetLimit * 0.35), dayCount)

  const normalizedDays = normalizedDaysBase.map((day, index) =>
    summarizeDay(day, distributedAccommodation[index] ?? 0),
  )

  const totalEstimatedBudget = normalizedDays.reduce((sum, day) => sum + day.placesBudget, 0)
  const totalTravelFare = normalizedDays.reduce((sum, day) => sum + day.travelFare, 0)
  const totalAccommodation = normalizedDays.reduce((sum, day) => sum + day.accommodationCost, 0)
  const plannedBudget = totalEstimatedBudget + totalTravelFare + totalAccommodation

  return {
    ...itinerary,
    budgetLimit,
    days: normalizedDays,
    totalEstimatedBudget,
    totalTravelFare,
    totalAccommodation,
    plannedBudget,
    whyThisPlan: normalizeWhyThisPlan(itinerary?.whyThisPlan, trip, dayCount),
  }
}

export function balanceItineraryBudget(itinerary, trip = null) {
  const normalized = recalculateItinerary(itinerary, trip)
  if (!normalized?.days?.length) {
    return normalized
  }

  const dayCount = normalized.days.length
  const totalAccommodation = normalized.totalAccommodation || 0
  const targetVariableTotal = Math.max(0, normalized.budgetLimit - totalAccommodation)
  const targetPerDay = targetVariableTotal / dayCount

  const adjustedDays = normalized.days.map((day) => {
    const currentVariable = day.placesBudget + day.travelFare
    if (currentVariable <= 0) {
      return day
    }

    const scale = targetPerDay / currentVariable
    const scaledPlaces = day.places.map((place) => ({
      ...place,
      estimatedBudget: roundBudget(place.estimatedBudget * scale),
      travelFare: roundBudget(place.travelFare * scale),
    }))

    return {
      ...day,
      places: scaledPlaces,
    }
  })

  return recalculateItinerary(
    {
      ...normalized,
      days: adjustedDays,
    },
    trip,
  )
}

export function injectComplementaryDestinations(itinerary, trip) {
  if (!itinerary?.days?.length) {
    return itinerary
  }

  const complementaryPlaces = getComplementaryDestinationsForTrip(trip)
  if (complementaryPlaces.length === 0) {
    return itinerary
  }

  const normalizedPlaceNames = itinerary.days
    .flatMap((day) => day.places || [])
    .map((place) => normalizeText(place?.name))

  const missingPlaces = complementaryPlaces.filter((complementaryPlace) => {
    const normalizedComplementaryName = normalizeText(complementaryPlace.name)
    return !normalizedPlaceNames.some((name) =>
      name.includes(normalizedComplementaryName) || normalizedComplementaryName.includes(name),
    )
  })

  if (missingPlaces.length === 0) {
    return itinerary
  }

  const constraints = getTripConstraints(trip)
  const transportPlan = getTransportPlan(trip)
  const maxPlacesPerDay = Math.max(1, constraints.maxPlacesPerDay)
  const dayIndexes = getSpreadDayIndexes(itinerary.days.length, missingPlaces.length)
  const missingByDayIndex = new Map(dayIndexes.map((dayIndex, index) => [dayIndex, missingPlaces[index]]))
  const defaultItemBudget = roundBudget(
    Number(itinerary?.budgetLimit || trip?.budget || 0) /
      Math.max(1, itinerary.days.length * Math.max(2, maxPlacesPerDay)),
  )

  const updatedDays = itinerary.days.map((day, dayIndex) => {
    const selectedComplementaryPlace = missingByDayIndex.get(dayIndex)
    if (!selectedComplementaryPlace) {
      return day
    }

    const places = Array.isArray(day.places) ? [...day.places] : []
    const insertionIndex = places.length >= maxPlacesPerDay ? maxPlacesPerDay - 1 : places.length
    const complementaryStop = buildComplementaryActivity({
      destination: itinerary.destination || trip?.destination || 'Destination',
      date: day.date || '',
      itemBudget: defaultItemBudget,
      stopNumber: insertionIndex + 1,
      complementaryPlace: selectedComplementaryPlace,
      transportPlan,
    })

    if (places.length >= maxPlacesPerDay) {
      places[insertionIndex] = complementaryStop
    } else {
      places.push(complementaryStop)
    }

    return {
      ...day,
      places,
    }
  })

  return {
    ...itinerary,
    days: updatedDays,
  }
}

export function generateItineraryFromTrip(trip) {
  const destination = trip.destination || 'Destination'
  const dayCount = getTripDayCount(trip.startDate, trip.endDate)
  const tripBudget = roundBudget(trip.budget)
  const passengerCount = Math.max(1, Number(trip?.passengerCount || 1))
  const budgetPerHead = roundBudget(
    Number(trip?.budgetPerHead || tripBudget / Math.max(1, passengerCount)),
  )
  const foodPreference = String(getTripPreference(trip, 'foodPreference', 'veg')).trim().toLowerCase()
  const interestsArray = getTripInterests(trip)
  const mustVisitPlaces = getTripMustVisitPlaces(trip)
  const pace = String(getTripPreference(trip, 'pace', 'balanced')).trim()
  const constraints = getTripConstraints(trip)
  const logistics = getTripLogistics(trip)
  const transportPlan = getTransportPlan(trip)
  const complementaryPlaces = getComplementaryDestinationsForTrip(trip)
  const complementaryDayIndexes = getSpreadDayIndexes(dayCount, complementaryPlaces.length)
  const complementaryByDayIndex = new Map(
    complementaryDayIndexes.map((dayIndex, index) => [dayIndex, complementaryPlaces[index]]),
  )
  const mustVisitDayIndexes = getSpreadDayIndexes(dayCount, mustVisitPlaces.length)
  const mustVisitByDayIndex = new Map(
    mustVisitDayIndexes.map((dayIndex, index) => [dayIndex, mustVisitPlaces[index]]),
  )
  const accommodationByDay = distributeEvenly(roundBudget(tripBudget * 0.35), dayCount)
  const defaultDayStartHour = 9
  const defaultDayEndHour = 20
  const basePlacesPerDay = Math.max(1, Math.min(5, constraints.maxPlacesPerDay || 4))

  const dayConfigs = Array.from({ length: dayCount }).map((_, dayIndex) => {
    let dayStartHour = defaultDayStartHour
    let dayEndHour = defaultDayEndHour

    if (dayIndex === 0 && logistics.arrivalHour !== null) {
      dayStartHour = Math.max(defaultDayStartHour, Math.min(defaultDayEndHour - 2, Math.ceil(logistics.arrivalHour + 0.5)))
    }
    if (dayIndex === dayCount - 1 && logistics.departureHour !== null) {
      dayEndHour = Math.min(defaultDayEndHour, Math.max(dayStartHour + 2, Math.floor(logistics.departureHour - 0.5)))
    }

    if (dayEndHour <= dayStartHour + 1) {
      dayEndHour = Math.min(23.5, dayStartHour + 2)
    }

    const capacityByTime = Math.max(1, Math.floor((dayEndHour - dayStartHour) / 2))
    const placeCount = Math.max(1, Math.min(basePlacesPerDay, capacityByTime))

    return {
      dayStartHour,
      dayEndHour,
      placeCount,
    }
  })

  const variableBudgetTotal = Math.max(0, tripBudget - accommodationByDay.reduce((sum, value) => sum + value, 0))
  const totalPlaces = dayConfigs.reduce((sum, config) => sum + config.placeCount, 0)
  const perPlaceBudget = totalPlaces > 0 ? roundBudget(variableBudgetTotal / totalPlaces) : 0

  const days = []
  for (let day = 0; day < dayCount; day += 1) {
    const dayConfig = dayConfigs[day]
    const date = addDays(trip.startDate, day)
    const places = []
    for (let stop = 1; stop <= dayConfig.placeCount; stop += 1) {
      places.push(
        buildActivity({
          dayNumber: day + 1,
          stopNumber: stop,
          destination,
          date,
          itemBudget: perPlaceBudget,
          dayStartHour: dayConfig.dayStartHour,
          transportPlan,
        }),
      )
    }

    const mustVisitPlace = mustVisitByDayIndex.get(day)
    if (mustVisitPlace && places.length > 0) {
      const insertionIndex = Math.min(1, places.length - 1)
      places[insertionIndex] = {
        ...places[insertionIndex],
        name: mustVisitPlace,
        activities: `Explore ${mustVisitPlace} and surrounding highlights based on trip preferences.`,
        thingsToTry: `Popular local experiences and food options around ${mustVisitPlace}.`,
        description: defaultDescription(destination, mustVisitPlace),
      }
    }

    const complementaryPlace = complementaryByDayIndex.get(day)
    if (complementaryPlace && places.length > 0) {
      const replacementIndex = Math.min(places.length - 1, Math.max(0, dayConfig.placeCount - 1))
      places[replacementIndex] = buildComplementaryActivity({
        destination,
        date,
        itemBudget: perPlaceBudget,
        stopNumber: replacementIndex + 1,
        complementaryPlace,
        dayStartHour: dayConfig.dayStartHour,
        transportPlan,
      })
    }

    days.push({
      id: generateId('day'),
      dayNumber: day + 1,
      date,
      accommodationCost: accommodationByDay[day] || 0,
      places,
    })
  }

  const basePlan = {
    tripId: trip.id,
    destination,
    budgetLimit: tripBudget,
    days,
    whyThisPlan: {
      budget: `Budget per head ${budgetPerHead} (total ${tripBudget} for ${passengerCount} travelers) is distributed across all days, including accommodation split evenly per day.`,
      interests: `Planned around interests: ${
        interestsArray.length > 0
          ? interestsArray.join(', ')
          : getTripPreference(trip, 'interests', 'general exploration and local culture')
      }. Food recommendations are tuned for ${foodPreference}.`,
      pace: `Pace is set to ${pace}. Day 1 starts after ${trip.arrivalTime || 'check-in'} and last day wraps before ${
        trip.departureTime || 'departure'
      } where provided.`,
      optimization:
        complementaryPlaces.length > 0
          ? `Nearby attractions are grouped to reduce travel time and avoid back-and-forth movement. Included complementary destinations: ${complementaryPlaces
              .map((place) => place.name)
              .join(', ')}.`
          : 'Nearby attractions are grouped to reduce travel time and avoid back-and-forth movement.',
    },
  }

  basePlan.whyThisPlan.optimization = `${
    basePlan.whyThisPlan.optimization
  } Transport is planned for ${transportPlan.modeLabel} with budget estimates for ${logistics.passengerCount} passenger(s).${
    mustVisitPlaces.length > 0 ? ` Must-visit places included: ${mustVisitPlaces.join(', ')}.` : ''
  }`

  return optimizeItineraryForTrip(balanceItineraryBudget(basePlan, trip), trip)
}

export function calculatePlannedBudget(itinerary, trip = null) {
  return recalculateItinerary(itinerary, trip)?.plannedBudget || 0
}
