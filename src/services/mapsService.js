const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''
const placesSearchEndpoint = 'https://places.googleapis.com/v1/places:searchText'
const coordinateCache = new Map()

export async function getCoordinates(placeName) {
  const query = String(placeName || '').trim()
  if (!query) {
    throw new Error('Place name is required.')
  }

  if (!googleMapsApiKey) {
    throw new Error('Google Maps API key missing. Add VITE_GOOGLE_MAPS_API_KEY in .env.')
  }

  const cacheKey = query.toLowerCase()
  if (coordinateCache.has(cacheKey)) {
    return coordinateCache.get(cacheKey)
  }

  const response = await fetch(placesSearchEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleMapsApiKey,
      'X-Goog-FieldMask': 'places.displayName,places.location',
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 1,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Places API request failed (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  const firstMatch = data?.places?.[0]
  const lat = Number(firstMatch?.location?.latitude)
  const lng = Number(firstMatch?.location?.longitude)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`No coordinates found for "${query}".`)
  }

  const coordinates = { lat, lng }
  coordinateCache.set(cacheKey, coordinates)
  return coordinates
}

export function openInGoogleMaps(place) {
  const query =
    typeof place === 'string'
      ? String(place || '').trim()
      : String(place?.name || '').trim()

  if (!query) {
    return
  }

  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}
