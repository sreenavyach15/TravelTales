import { useEffect, useMemo, useState } from 'react'
import {
  DirectionsRenderer,
  GoogleMap,
  InfoWindow,
  Marker,
  useJsApiLoader,
} from '@react-google-maps/api'

const containerStyle = {
  width: '100%',
  height: '400px',
}

const fallbackCenter = {
  lat: 20.5937,
  lng: 78.9629,
}

const libraries = ['places']

function MapView({ places = [], focusedPlaceName = '' }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''
  const [activeMarkerName, setActiveMarkerName] = useState('')
  const [directions, setDirections] = useState(null)
  const [routeError, setRouteError] = useState('')

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'travel-tales-google-map',
    googleMapsApiKey: apiKey,
    libraries,
  })

  const normalizedPlaces = useMemo(
    () =>
      (places || []).filter(
        (place) =>
          place &&
          Number.isFinite(Number(place.lat)) &&
          Number.isFinite(Number(place.lng)),
      ),
    [places],
  )

  const center = useMemo(() => {
    if (normalizedPlaces.length === 0) {
      return fallbackCenter
    }
    if (normalizedPlaces.length === 1) {
      return {
        lat: Number(normalizedPlaces[0].lat),
        lng: Number(normalizedPlaces[0].lng),
      }
    }

    const totals = normalizedPlaces.reduce(
      (accumulator, place) => ({
        lat: accumulator.lat + Number(place.lat),
        lng: accumulator.lng + Number(place.lng),
      }),
      { lat: 0, lng: 0 },
    )

    return {
      lat: totals.lat / normalizedPlaces.length,
      lng: totals.lng / normalizedPlaces.length,
    }
  }, [normalizedPlaces])

  const mapOptions = useMemo(
    () => ({
      fullscreenControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      clickableIcons: false,
    }),
    [],
  )

  const routeKey = useMemo(
    () =>
      normalizedPlaces
        .map((place) => `${place.name}:${Number(place.lat).toFixed(5)},${Number(place.lng).toFixed(5)}`)
        .join('|'),
    [normalizedPlaces],
  )

  useEffect(() => {
    if (!focusedPlaceName) {
      return
    }

    const match = normalizedPlaces.find(
      (place) => String(place.name || '').toLowerCase() === String(focusedPlaceName).toLowerCase(),
    )
    if (match) {
      setActiveMarkerName(match.name)
    }
  }, [focusedPlaceName, normalizedPlaces])

  useEffect(() => {
    if (!isLoaded || normalizedPlaces.length < 2 || !window.google?.maps) {
      setDirections(null)
      setRouteError('')
      return
    }

    let cancelled = false
    setRouteError('')

    const service = new window.google.maps.DirectionsService()
    const origin = {
      lat: Number(normalizedPlaces[0].lat),
      lng: Number(normalizedPlaces[0].lng),
    }
    const destination = {
      lat: Number(normalizedPlaces[normalizedPlaces.length - 1].lat),
      lng: Number(normalizedPlaces[normalizedPlaces.length - 1].lng),
    }
    const waypoints = normalizedPlaces.slice(1, -1).map((place) => ({
      location: {
        lat: Number(place.lat),
        lng: Number(place.lng),
      },
      stopover: true,
    }))

    service.route(
      {
        origin,
        destination,
        waypoints,
        optimizeWaypoints: false,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (cancelled) {
          return
        }

        if (status === window.google.maps.DirectionsStatus.OK && result) {
          setDirections(result)
          return
        }

        setDirections(null)
        setRouteError(`Could not render route: ${status}`)
      },
    )

    return () => {
      cancelled = true
    }
  }, [isLoaded, routeKey, normalizedPlaces])

  if (!apiKey) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
        Google Maps key missing. Add `VITE_GOOGLE_MAPS_API_KEY` in `.env`.
      </p>
    )
  }

  if (loadError) {
    return (
      <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
        Failed to load Google Maps.
      </p>
    )
  }

  if (!isLoaded) {
    return <p className="text-sm text-slate-600">Loading map...</p>
  }

  return (
    <div className="space-y-2">
      <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={12} options={mapOptions}>
        {normalizedPlaces.map((place) => (
          <Marker
            key={`${place.name}-${place.lat}-${place.lng}`}
            position={{
              lat: Number(place.lat),
              lng: Number(place.lng),
            }}
            onClick={() => setActiveMarkerName(place.name)}
          >
            {activeMarkerName === place.name && (
              <InfoWindow onCloseClick={() => setActiveMarkerName('')}>
                <div className="text-sm font-medium text-slate-900">{place.name}</div>
              </InfoWindow>
            )}
          </Marker>
        ))}

        {directions && (
          <DirectionsRenderer
            directions={directions}
            options={{
              suppressMarkers: false,
              polylineOptions: {
                strokeColor: '#0f172a',
                strokeOpacity: 0.85,
                strokeWeight: 5,
              },
            }}
          />
        )}
      </GoogleMap>

      {routeError && <p className="text-xs text-amber-700">{routeError}</p>}
    </div>
  )
}

export default MapView
