import {
  balanceItineraryBudget,
  getComplementaryDestinationsForTrip,
  injectComplementaryDestinations,
  optimizeItineraryForTrip,
} from './itineraryService'

const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY ?? ''
const configuredModel = (import.meta.env.VITE_GEMINI_MODEL ?? '').trim()
const configuredApiVersion = (import.meta.env.VITE_GEMINI_API_VERSION ?? 'v1beta').trim()

export const hasGeminiConfig = Boolean(geminiApiKey)

const preferredModelOrder = [
  configuredModel,
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
].filter(Boolean)

function normalizeModelName(modelName) {
  return modelName.startsWith('models/') ? modelName.slice('models/'.length) : modelName
}

function unique(values) {
  return [...new Set(values)]
}

function extractJsonFromText(text) {
  const jsonFence = text.match(/```json\s*([\s\S]*?)```/i)
  if (jsonFence?.[1]) {
    return jsonFence[1].trim()
  }

  const plainFence = text.match(/```\s*([\s\S]*?)```/i)
  if (plainFence?.[1]) {
    return plainFence[1].trim()
  }

  return text.trim()
}

function formatInterests(interests) {
  if (Array.isArray(interests)) {
    const cleaned = interests.map((item) => String(item || '').trim()).filter(Boolean)
    return cleaned.length > 0 ? cleaned.join(', ') : 'general exploration'
  }

  const text = String(interests || '').trim()
  return text || 'general exploration'
}

function formatFoodPreference(foodPreference) {
  const normalized = String(foodPreference || '')
    .trim()
    .toLowerCase()

  if (normalized === 'non-veg') {
    return 'non-veg'
  }

  if (normalized === 'vegan') {
    return 'vegan'
  }

  return 'veg'
}

function formatMustVisitPlaces(mustVisitPlaces) {
  if (Array.isArray(mustVisitPlaces)) {
    const cleaned = mustVisitPlaces.map((item) => String(item || '').trim()).filter(Boolean)
    return cleaned.length > 0 ? cleaned.join(', ') : 'none specified'
  }

  const text = String(mustVisitPlaces || '').trim()
  return text || 'none specified'
}

function getTripPreferences(trip) {
  const preferences = trip?.preferences || {}
  const advancedOptions = preferences?.advancedOptions || {}

  return {
    travelStyle: String(preferences.travelStyle || trip?.travelStyle || 'balanced').trim(),
    transportOwnership: String(
      preferences.transportOwnership || trip?.transportOwnership || 'public',
    ).trim(),
    pace: String(preferences.pace || trip?.pace || 'moderate').trim(),
    interests: preferences.interests ?? trip?.interests ?? [],
    mustVisitPlaces: preferences.mustVisitPlaces ?? trip?.mustVisitPlaces ?? [],
    foodPreference: preferences.foodPreference ?? trip?.foodPreference ?? 'veg',
    crowdTolerance: String(preferences.crowdTolerance || trip?.crowdTolerance || 'medium').trim(),
    advancedOptions: {
      hotelBudgetPerNight: Number(
        advancedOptions.hotelBudgetPerNight ?? trip?.advancedOptions?.hotelBudgetPerNight ?? 0,
      ),
      foodBudgetPerDay: Number(
        advancedOptions.foodBudgetPerDay ?? trip?.advancedOptions?.foodBudgetPerDay ?? 0,
      ),
      activityBudgetPerDay: Number(
        advancedOptions.activityBudgetPerDay ?? trip?.advancedOptions?.activityBudgetPerDay ?? 0,
      ),
    },
  }
}

function getTripLogistics(trip) {
  return {
    arrivalTime: String(trip?.arrivalTime || '').trim(),
    departureTime: String(trip?.departureTime || '').trim(),
    passengerCount: Math.max(1, Number(trip?.passengerCount || 1)),
  }
}

function getTripConstraints(trip) {
  const constraints = trip?.constraints || {}
  return {
    maxTravelTimePerDay: Number(constraints.maxTravelTimePerDay ?? 6),
    maxPlacesPerDay: Number(constraints.maxPlacesPerDay ?? 4),
    restTimeRequired: Boolean(constraints.restTimeRequired),
    weatherSensitive: Boolean(constraints.weatherSensitive),
  }
}

function formatComplementaryDestinations(destinations) {
  if (!Array.isArray(destinations) || destinations.length === 0) {
    return 'No high-confidence nearby destination identified for this route.'
  }

  return destinations.map((destination) => destination.name).join(', ')
}

function buildPrompt(trip) {
  const preferences = getTripPreferences(trip)
  const constraints = getTripConstraints(trip)
  const logistics = getTripLogistics(trip)
  const budgetPerHead = Number(
    trip?.budgetPerHead || Number(trip?.budget || 0) / Math.max(1, logistics.passengerCount),
  )
  const complementaryDestinations = getComplementaryDestinationsForTrip(trip)

  return `
Create a realistic, highly detailed day-wise travel itinerary in strict JSON only.

Trip details:
- Destination: ${trip.destination || 'Unknown'}
- Start date: ${trip.startDate || 'Not provided'}
- End date: ${trip.endDate || 'Not provided'}
- Arrival time (day 1): ${logistics.arrivalTime || 'Not provided'}
- Departure time (last day): ${logistics.departureTime || 'Not provided'}
- Number of passengers: ${logistics.passengerCount}
- Budget per head: ${Math.round(budgetPerHead)}
- Total budget (budget per head * passengers): ${Number(trip.budget || 0)}
- Travel style: ${preferences.travelStyle}
- Transport access type: ${preferences.transportOwnership}
- Pace preference: ${preferences.pace}
- Crowd tolerance: ${preferences.crowdTolerance}
- Interests: ${formatInterests(preferences.interests)}
- Must-visit places: ${formatMustVisitPlaces(preferences.mustVisitPlaces)}
- Food preference: ${formatFoodPreference(preferences.foodPreference)}
- Hotel budget per night: ${preferences.advancedOptions.hotelBudgetPerNight || 'not specified'}
- Food budget per day: ${preferences.advancedOptions.foodBudgetPerDay || 'not specified'}
- Activity budget per day: ${preferences.advancedOptions.activityBudgetPerDay || 'not specified'}
- Max travel time per day: ${constraints.maxTravelTimePerDay} hours
- Max places per day: ${constraints.maxPlacesPerDay}
- Rest time required: ${constraints.restTimeRequired ? 'yes' : 'no'}
- Weather sensitive: ${constraints.weatherSensitive ? 'yes' : 'no'}
- Nearby complementary destinations to prioritize when feasible: ${formatComplementaryDestinations(
    complementaryDestinations,
  )}

Requirements:
- Return only valid JSON.
- Generate each day with 2-${Math.max(2, constraints.maxPlacesPerDay)} places.
- Include practical sequencing between places.
- Keep the total trip budget as close as possible to the given budget without exceeding it.
- Distribute accommodation realistically across all days (do not put full stay cost in one day).
- Balance day budgets so daily spending feels natural.
- Include detailed cultural and historical descriptions for each place.
- Include transport mode and travel fare from previous place to current place.
- Make activities realistic for the place and time window.
- Group nearby places together and avoid route backtracking.
- Respect food preference in food suggestions and activities.
- Keep total active travel + visit time near ${constraints.maxTravelTimePerDay} hours per day.
- If rest time is required, include breaks in day flow.
- If weather sensitive, prioritize indoor fallback options when relevant.
- Integrate complementary nearby destinations naturally into day-wise flow when feasible.
- Include must-visit places at least once when feasible within budget and time constraints.
- Start day-1 activities after arrival time when provided.
- End last-day activities before departure time when provided.
- If transport access type is own, travelModeFromPrevious must be only "cab" or "walk".
- If transport access type is public, choose suitable transport mode from walk/cab/metro/bus/train.
- Keep fares and budgets realistic for ${logistics.passengerCount} passenger(s).
- For short trips (<= 3 days), include at most one highly relevant complementary destination.
- For longer trips, include multiple complementary destinations only when budget/time constraints allow.
- If constraints are tight, prioritize top-relevance nearby destinations and skip weaker ones.
- Avoid overloading any single day when adding nearby destinations.

Output schema:
{
  "destination": "string",
  "budgetLimit": 0,
  "whyThisPlan": {
    "budget": "string",
    "interests": "string",
    "pace": "string",
    "optimization": "string"
  },
  "days": [
    {
      "dayNumber": 1,
      "date": "YYYY-MM-DD",
      "accommodationCost": 0,
      "places": [
        {
          "name": "string",
          "date": "YYYY-MM-DD",
          "estimatedTime": "09:00 - 11:00",
          "travelModeFromPrevious": "walk | cab | metro | bus | train",
          "travelFare": 0,
          "activities": "string",
          "thingsToTry": "string",
          "estimatedBudget": 0,
          "description": "Very detailed place description with history, cultural importance, highlights, and why worth visiting."
        }
      ]
    }
  ]
}
`.trim()
}

function buildDynamicReplanPrompt({ trip, itinerary, reason }) {
  const preferences = getTripPreferences(trip)
  const constraints = getTripConstraints(trip)
  const logistics = getTripLogistics(trip)
  const budgetPerHead = Number(
    trip?.budgetPerHead || Number(itinerary?.budgetLimit || trip?.budget || 0) / Math.max(1, logistics.passengerCount),
  )
  const complementaryDestinations = getComplementaryDestinationsForTrip(trip)
  const compactPlan = JSON.stringify(
    {
      destination: itinerary.destination,
      budgetLimit: itinerary.budgetLimit,
      days: itinerary.days.map((day) => ({
        dayNumber: day.dayNumber,
        date: day.date,
        accommodationCost: day.accommodationCost,
        places: day.places.map((place) => ({
          name: place.name,
          estimatedTime: place.estimatedTime,
          travelModeFromPrevious: place.travelModeFromPrevious,
          travelFare: place.travelFare,
          activities: place.activities,
          thingsToTry: place.thingsToTry,
          estimatedBudget: place.estimatedBudget,
          description: place.description,
        })),
      })),
    },
    null,
    2,
  )

  return `
Replan this itinerary dynamically based on a new constraint.

Reason for replanning: ${reason}
Destination: ${trip.destination || itinerary.destination || 'Unknown'}
Budget limit: ${itinerary.budgetLimit || trip.budget || 0}
Budget per head: ${Math.round(budgetPerHead)}
Arrival time (day 1): ${logistics.arrivalTime || 'Not provided'}
Departure time (last day): ${logistics.departureTime || 'Not provided'}
Passengers: ${logistics.passengerCount}
Travel style: ${preferences.travelStyle}
Transport access type: ${preferences.transportOwnership}
Interests: ${formatInterests(preferences.interests)}
Must-visit places: ${formatMustVisitPlaces(preferences.mustVisitPlaces)}
Food preference: ${formatFoodPreference(preferences.foodPreference)}
Pace: ${preferences.pace}
Crowd tolerance: ${preferences.crowdTolerance}
Max travel time/day: ${constraints.maxTravelTimePerDay} hours
Max places/day: ${constraints.maxPlacesPerDay}
Rest time required: ${constraints.restTimeRequired ? 'yes' : 'no'}
Weather sensitive: ${constraints.weatherSensitive ? 'yes' : 'no'}
Nearby complementary destinations to preserve/prioritize: ${formatComplementaryDestinations(
    complementaryDestinations,
  )}

Current itinerary:
${compactPlan}

Replanning goals:
- Replace skipped/unavailable places with suitable alternatives.
- Adapt scheduling for weather or time constraints.
- Preserve budget and balanced day-wise spending.
- Keep nearby places grouped and reduce travel backtracking.
- Keep recommendations aligned with food preference.
- If transport access type is own, travelModeFromPrevious must be only "cab" or "walk".
- If transport access type is public, choose suitable transport mode from walk/cab/metro/bus/train.
- Keep day flow within travel-time and max-place constraints.
- Keep day-1 activities after arrival time and final-day activities before departure time when provided.
- Preserve must-visit places as much as possible.
- Maintain complementary nearby destinations where feasible after replanning.
- Keep fares and budgets realistic for ${logistics.passengerCount} passenger(s).

Return ONLY JSON in the same schema as the itinerary generator.
Include updated "whyThisPlan" to explain changes.
`.trim()
}

function buildNearbyPlacesPrompt({ destination, dayNumber, date, existingPlaces = [] }) {
  const existingList =
    existingPlaces.length > 0 ? existingPlaces.map((place) => `- ${place}`).join('\n') : '- none'

  return `
Suggest nearby places to enrich a travel day plan.

Trip context:
- Destination: ${destination || 'Unknown'}
- Day: ${dayNumber}
- Date: ${date || 'Not provided'}
- Existing places:
${existingList}

Return only valid JSON in this exact shape:
{
  "places": [
    {
      "name": "string",
      "estimatedTime": "12:00 - 13:30",
      "travelModeFromPrevious": "walk | cab | metro | bus | train",
      "travelFare": 0,
      "activities": "string",
      "thingsToTry": "string",
      "estimatedBudget": 0,
      "description": "short detailed description with highlights and why worth visiting"
    }
  ]
}

Rules:
- Give 3 suggestions.
- Keep them practical and close to existing places.
- Keep suggestions budget-conscious.
`.trim()
}

function parseGeminiText(data) {
  const rawText =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('\n')
      .trim() || ''

  if (!rawText) {
    throw new Error('Gemini returned an empty response.')
  }

  try {
    return JSON.parse(extractJsonFromText(rawText))
  } catch {
    throw new Error('Failed to parse Gemini itinerary JSON response.')
  }
}

async function fetchAvailableModels(apiVersion) {
  const endpoint = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${geminiApiKey}`
  const response = await fetch(endpoint)
  if (!response.ok) {
    return []
  }

  const data = await response.json()
  const models = Array.isArray(data?.models) ? data.models : []

  return models
    .filter((model) => Array.isArray(model?.supportedGenerationMethods))
    .filter((model) => model.supportedGenerationMethods.includes('generateContent'))
    .map((model) => normalizeModelName(model.name))
}

function rankModels(availableModels) {
  const preferred = preferredModelOrder
    .map((model) => normalizeModelName(model))
    .filter((model) => availableModels.includes(model))

  const remaining = availableModels.filter((model) => !preferred.includes(model))
  return [...preferred, ...remaining]
}

async function requestGenerate(apiVersion, model, prompt) {
  const endpoint = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${geminiApiKey}`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5 },
    }),
  })

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      errorText: await response.text(),
    }
  }

  return {
    ok: true,
    data: await response.json(),
  }
}

async function runGeminiPrompt(prompt) {
  const apiVersions = unique([configuredApiVersion, 'v1beta', 'v1'])
  const failures = []

  for (const apiVersion of apiVersions) {
    const availableModels = await fetchAvailableModels(apiVersion)
    const candidateModels =
      availableModels.length > 0
        ? rankModels(availableModels)
        : unique(preferredModelOrder.map((model) => normalizeModelName(model)))

    for (const model of candidateModels) {
      const result = await requestGenerate(apiVersion, model, prompt)
      if (result.ok) {
        return parseGeminiText(result.data)
      }

      failures.push(`[${apiVersion}/${model}] ${result.errorText}`)
      if (result.status === 404) {
        continue
      }
    }
  }

  throw new Error(
    `Gemini request failed after trying available models. ${failures[0] || 'Please verify API key/model access.'}`,
  )
}

export async function generateItineraryWithGemini(trip) {
  if (!hasGeminiConfig) {
    throw new Error('Gemini API key is missing. Add VITE_GEMINI_API_KEY to .env.')
  }

  const parsed = await runGeminiPrompt(buildPrompt(trip))
  const generated = {
    tripId: trip.id,
    destination: parsed?.destination || trip.destination || 'Destination',
    budgetLimit: Number(parsed?.budgetLimit || trip.budget || 0),
    whyThisPlan: parsed?.whyThisPlan || null,
    days: Array.isArray(parsed?.days) ? parsed.days : [],
  }

  return optimizeItineraryForTrip(
    balanceItineraryBudget(injectComplementaryDestinations(generated, trip), trip),
    trip,
  )
}

export async function suggestNearbyPlacesWithGemini({
  destination,
  dayNumber,
  date,
  existingPlaces = [],
}) {
  if (!hasGeminiConfig) {
    throw new Error('Gemini API key is missing. Add VITE_GEMINI_API_KEY to .env.')
  }

  const parsed = await runGeminiPrompt(
    buildNearbyPlacesPrompt({ destination, dayNumber, date, existingPlaces }),
  )
  const places = Array.isArray(parsed?.places) ? parsed.places : []

  return places.map((place) => ({
    name: String(place?.name || '').trim(),
    date: String(date || '').trim(),
    estimatedTime: String(place?.estimatedTime || '').trim(),
    travelModeFromPrevious: String(place?.travelModeFromPrevious || '').trim(),
    travelFare: Number(place?.travelFare || 0),
    activities: String(place?.activities || '').trim(),
    thingsToTry: String(place?.thingsToTry || '').trim(),
    estimatedBudget: Number(place?.estimatedBudget || 0),
    description: String(place?.description || '').trim(),
  }))
}

export async function replanItineraryWithGemini({ trip, itinerary, reason }) {
  if (!hasGeminiConfig) {
    throw new Error('Gemini API key is missing. Add VITE_GEMINI_API_KEY to .env.')
  }

  const parsed = await runGeminiPrompt(buildDynamicReplanPrompt({ trip, itinerary, reason }))
  const replanned = {
    ...itinerary,
    destination: parsed?.destination || itinerary.destination || trip.destination || 'Destination',
    budgetLimit: Number(parsed?.budgetLimit || itinerary.budgetLimit || trip.budget || 0),
    whyThisPlan: parsed?.whyThisPlan || itinerary.whyThisPlan,
    days: Array.isArray(parsed?.days) ? parsed.days : itinerary.days,
  }

  return optimizeItineraryForTrip(
    balanceItineraryBudget(injectComplementaryDestinations(replanned, trip), trip),
    trip,
  )
}
