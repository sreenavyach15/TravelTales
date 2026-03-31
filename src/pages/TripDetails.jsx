import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import MapView from '../components/MapView'
import PageContainer from '../components/PageContainer'
import { useAuth } from '../hooks/useAuth'
import { getChatRoomByTripId } from '../services/chatService'
import { getCoordinates, openInGoogleMaps } from '../services/mapsService'
import { canDeleteTrip, deleteTripIfAllowed, getOngoingTrips } from '../services/tripService'

function TripDetails() {
  const { user } = useAuth()
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [deletingTripId, setDeletingTripId] = useState('')
  const [chatRoomByTripId, setChatRoomByTripId] = useState({})
  const [selectedMapTripId, setSelectedMapTripId] = useState('')
  const [selectedMapDayId, setSelectedMapDayId] = useState('all')
  const [mapPlaces, setMapPlaces] = useState([])
  const [mapLoading, setMapLoading] = useState(false)
  const [mapError, setMapError] = useState('')
  const [focusedMapPlaceName, setFocusedMapPlaceName] = useState('')

  const formatFoodPreferenceLabel = (trip) => {
    const value = String(trip?.preferences?.foodPreference || trip?.foodPreference || 'veg')
      .trim()
      .toLowerCase()

    if (value === 'non-veg') {
      return 'Non-veg'
    }

    if (value === 'vegan') {
      return 'Vegan'
    }

    return 'Veg'
  }

  const getPassengerCount = (trip) => Math.max(1, Number(trip?.passengerCount || 1))

  const getBudgetPerHead = (trip) => {
    const explicitPerHead = Number(trip?.budgetPerHead)
    if (Number.isFinite(explicitPerHead) && explicitPerHead >= 0) {
      return Math.round(explicitPerHead)
    }

    const totalBudget = Number(trip?.budget || 0)
    const passengerCount = getPassengerCount(trip)
    return Math.round(totalBudget / passengerCount)
  }

  useEffect(() => {
    let isMounted = true

    async function loadTrips() {
      if (!user?.uid) {
        if (isMounted) {
          setTrips([])
          setLoading(false)
        }
        return
      }

      try {
        const ongoingTrips = await getOngoingTrips(user.uid)
        if (isMounted) {
          setTrips(ongoingTrips)
        }

        const roomEntries = await Promise.all(
          ongoingTrips.map(async (trip) => {
            try {
              const room = await getChatRoomByTripId(trip.id)
              return [trip.id, room?.id || '']
            } catch {
              return [trip.id, '']
            }
          }),
        )

        if (isMounted) {
          setChatRoomByTripId(
            roomEntries.reduce((accumulator, [tripId, roomId]) => {
              if (roomId) {
                accumulator[tripId] = roomId
              }
              return accumulator
            }, {}),
          )
        }
      } catch (fetchError) {
        if (isMounted) {
          setError(fetchError.message)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadTrips()
    return () => {
      isMounted = false
    }
  }, [user?.uid])

  const mappableTrips = useMemo(
    () => trips.filter((trip) => Array.isArray(trip?.itinerary?.days) && trip.itinerary.days.length > 0),
    [trips],
  )

  const selectedMapTrip = useMemo(
    () => mappableTrips.find((trip) => trip.id === selectedMapTripId) || mappableTrips[0] || null,
    [mappableTrips, selectedMapTripId],
  )

  const mapDayOptions = useMemo(() => {
    const days = selectedMapTrip?.itinerary?.days || []
    return [
      { id: 'all', label: 'All Days' },
      ...days.map((day) => ({ id: day.id, label: `Day ${day.dayNumber}` })),
    ]
  }, [selectedMapTrip])

  const selectedMapPlaces = useMemo(() => {
    const days = selectedMapTrip?.itinerary?.days || []
    if (days.length === 0) {
      return []
    }

    if (selectedMapDayId === 'all') {
      return days.flatMap((day) =>
        (day.places || []).map((place) => ({
          ...place,
          dayId: day.id,
        })),
      )
    }

    const selectedDay = days.find((day) => day.id === selectedMapDayId)
    return (selectedDay?.places || []).map((place) => ({
      ...place,
      dayId: selectedMapDayId,
    }))
  }, [selectedMapTrip, selectedMapDayId])

  useEffect(() => {
    if (mappableTrips.length === 0) {
      setSelectedMapTripId('')
      setSelectedMapDayId('all')
      return
    }

    if (!mappableTrips.some((trip) => trip.id === selectedMapTripId)) {
      setSelectedMapTripId(mappableTrips[0].id)
      setSelectedMapDayId('all')
    }
  }, [mappableTrips, selectedMapTripId])

  useEffect(() => {
    const days = selectedMapTrip?.itinerary?.days || []
    if (selectedMapDayId === 'all') {
      return
    }

    if (!days.some((day) => day.id === selectedMapDayId)) {
      setSelectedMapDayId('all')
    }
  }, [selectedMapTrip, selectedMapDayId])

  useEffect(() => {
    let isMounted = true

    async function loadMapPlaces() {
      const destination = String(selectedMapTrip?.destination || '').trim()
      const uniqueNames = [...new Set(
        selectedMapPlaces
          .map((place) => String(place?.name || '').trim())
          .filter(Boolean),
      )]

      if (uniqueNames.length === 0) {
        if (isMounted) {
          setMapPlaces([])
          setMapError('')
          setMapLoading(false)
        }
        return
      }

      setMapLoading(true)
      setMapError('')

      const resolved = await Promise.allSettled(
        uniqueNames.map(async (name) => {
          const coordinates = await getCoordinates(destination ? `${name}, ${destination}` : name)
          return { name, ...coordinates }
        }),
      )

      if (!isMounted) {
        return
      }

      const success = resolved
        .filter((item) => item.status === 'fulfilled')
        .map((item) => item.value)
      const failedCount = resolved.filter((item) => item.status === 'rejected').length

      setMapPlaces(success)
      setMapLoading(false)
      setMapError(failedCount > 0 ? `Could not map ${failedCount} place(s).` : '')
    }

    loadMapPlaces().catch((loadError) => {
      if (isMounted) {
        setMapLoading(false)
        setMapError(loadError.message)
      }
    })

    return () => {
      isMounted = false
    }
  }, [selectedMapPlaces, selectedMapTrip])

  const handleViewOnMap = (dayId, placeName) => {
    setSelectedMapDayId(dayId || 'all')
    setFocusedMapPlaceName(String(placeName || '').trim())
  }

  const handleNavigate = (placeName) => {
    openInGoogleMaps(placeName)
  }

  const handleDeleteTrip = async (trip) => {
    if (!user?.uid) {
      return
    }

    const confirmed = window.confirm(
      `Delete trip "${trip.destination}"? This action cannot be undone.`,
    )
    if (!confirmed) {
      return
    }

    setError('')
    setStatus('')
    setDeletingTripId(trip.id)

    try {
      await deleteTripIfAllowed({ tripId: trip.id, userId: user.uid })
      setTrips((previous) => previous.filter((item) => item.id !== trip.id))
      setChatRoomByTripId((previous) => {
        const next = { ...previous }
        delete next[trip.id]
        return next
      })
      setStatus(`Trip "${trip.destination}" deleted successfully.`)
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setDeletingTripId('')
    }
  }

  return (
    <PageContainer
      title="TripDetails"
      description="Track your ongoing trips and begin detailed planning."
    >
      {loading && <p className="text-sm text-slate-600">Loading trips...</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {status && <p className="text-sm text-emerald-700">{status}</p>}

      {!loading && !error && trips.length === 0 && (
        <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600">
          no ongoing trips
        </p>
      )}

      {!loading && !error && trips.length > 0 && (
        <div className="space-y-4">
          {trips.map((trip) => (
            <article key={trip.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-xl font-semibold text-slate-900">{trip.destination}</h3>
              <p className="mt-1 text-sm text-slate-600">
                Dates: {trip.startDate || 'Not set'} to {trip.endDate || 'Not set'}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Budget/head: {getBudgetPerHead(trip)} | Passengers: {getPassengerCount(trip)} | Total
                Budget: {trip.budget || 0}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Food preference: {formatFoodPreferenceLabel(trip)}
              </p>
              {trip.itinerary?.days?.length > 0 && (
                <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">
                  <p className="font-semibold">Plan saved</p>
                  <p>
                    Days: {trip.itinerary.days.length} | Total planned: {trip.itinerary.plannedBudget || 0}
                  </p>
                </div>
              )}
              <div className="mt-3">
                <div className="flex flex-wrap gap-2">
                  {Boolean(chatRoomByTripId[trip.id]) ? (
                    <Link
                      to={`/chat?tripId=${trip.id}`}
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      View Chat Room
                    </Link>
                  ) : (
                    <Link
                      to={`/chat?tripId=${trip.id}`}
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Create Chat Room
                    </Link>
                  )}

                  <Link
                    to={`/photos?tripId=${trip.id}`}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    View Album
                  </Link>

                  {trip.itinerary?.days?.length > 0 ? (
                    <Link
                      to={`/recommendations?tripId=${trip.id}`}
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      View Plan
                    </Link>
                  ) : (
                    <Link
                      to={`/recommendations?tripId=${trip.id}`}
                      className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                    >
                      Start planning
                    </Link>
                  )}

                  {canDeleteTrip(trip) ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteTrip(trip)}
                      disabled={deletingTripId === trip.id}
                      className="rounded-md bg-rose-100 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingTripId === trip.id ? 'Deleting...' : 'Delete Trip'}
                    </button>
                  ) : (
                    <span className="rounded-md bg-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
                      Trip started - cannot delete
                    </span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading && !error && (
        <section className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-lg font-semibold text-slate-900">Trip Map & Route</h3>
          <p className="text-sm text-slate-600">
            Explore saved itinerary places on the map and navigate directly.
          </p>

          {mappableTrips.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600">
              Save a trip plan to enable map routing.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {mappableTrips.map((trip) => (
                  <button
                    key={trip.id}
                    type="button"
                    onClick={() => {
                      setSelectedMapTripId(trip.id)
                      setSelectedMapDayId('all')
                      setFocusedMapPlaceName('')
                    }}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      selectedMapTrip?.id === trip.id
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {trip.destination}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {mapDayOptions.map((dayOption) => (
                  <button
                    key={dayOption.id}
                    type="button"
                    onClick={() => setSelectedMapDayId(dayOption.id)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      selectedMapDayId === dayOption.id
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {dayOption.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                {selectedMapPlaces.length === 0 ? (
                  <p className="text-sm text-slate-600">No places available for this selection.</p>
                ) : (
                  selectedMapPlaces.map((place, index) => (
                    <div
                      key={`${place.dayId || 'day'}-${place.id || place.name || index}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white p-3"
                    >
                      <p className="text-sm font-medium text-slate-800">
                        {index + 1}. {place.name || 'Unnamed Place'}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleViewOnMap(place.dayId, place.name)}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          View on Map
                        </button>
                        <button
                          type="button"
                          onClick={() => handleNavigate(place.name)}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Navigate
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {mapLoading && <p className="text-sm text-slate-600">Loading coordinates...</p>}
              {mapError && <p className="text-sm text-amber-700">{mapError}</p>}

              <MapView places={mapPlaces} focusedPlaceName={focusedMapPlaceName} />
            </>
          )}
        </section>
      )}
    </PageContainer>
  )
}

export default TripDetails
