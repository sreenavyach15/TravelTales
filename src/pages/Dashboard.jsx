import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { listAccessibleTripAlbums, listTripAlbumPhotos } from '../services/photoAlbumService'
import { getTripsByUser } from '../services/tripService'
import { getDisplayNameFromEmail, getUserProfileByUid } from '../services/userService'

const DAILY_QUOTES = [
  'Travel is the art of collecting moments, not things.',
  'The best journeys answer questions you never thought to ask.',
  'Every destination changes you a little.',
  'A good trip is measured in stories, not miles.',
  'Wander often, connect deeply, remember forever.',
  'Wherever you go, go with curiosity and come back with gratitude.',
  'Great trips are built from small shared moments.',
]

function getStartDateMs(dateText) {
  const normalized = String(dateText || '').trim()
  if (!normalized) {
    return null
  }
  const parsed = new Date(`${normalized}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime()
}

function formatDateRange(startDate, endDate) {
  const start = String(startDate || '').trim()
  const end = String(endDate || '').trim()
  if (start && end) return `${start} to ${end}`
  if (start) return start
  if (end) return end
  return 'Dates not set'
}

function formatCount(value) {
  return Number(value || 0).toLocaleString()
}

function hashSeed(seed) {
  const source = String(seed || '')
  let hash = 0
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) % 2147483647
  }
  return Math.abs(hash)
}

function getTodaySeed() {
  const now = new Date()
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
}

function Dashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [greetingName, setGreetingName] = useState('Traveler')
  const [trips, setTrips] = useState([])
  const [photoSummary, setPhotoSummary] = useState({
    totalPhotos: 0,
    recentPhotos: [],
  })

  useEffect(() => {
    let mounted = true

    async function loadDashboardData() {
      if (!user?.uid) {
        if (mounted) {
          setLoading(false)
          setTrips([])
          setPhotoSummary({ totalPhotos: 0, recentPhotos: [] })
          setGreetingName('Traveler')
        }
        return
      }

      setLoading(true)
      setError('')

      const fallbackName =
        String(user?.displayName || '').trim() || getDisplayNameFromEmail(user?.email || '')

      try {
        const [profile, userTrips, albums] = await Promise.all([
          getUserProfileByUid(user.uid).catch(() => null),
          getTripsByUser(user.uid).catch(() => []),
          listAccessibleTripAlbums(user.uid).catch(() => []),
        ])

        const photosByAlbum = await Promise.all(
          albums.map((album) =>
            listTripAlbumPhotos({ tripId: album.tripId, userId: user.uid }).catch(() => []),
          ),
        )

        const albumByTripId = Object.fromEntries(albums.map((album) => [album.tripId, album]))
        const allPhotos = photosByAlbum.flatMap((photos, albumIndex) => {
          const tripId = albums[albumIndex]?.tripId || ''
          const album = albumByTripId[tripId]
          return photos.map((photo) => ({
            ...photo,
            destination: photo.destination || album?.destination || 'Trip',
          }))
        })

        const recentPhotos = [...allPhotos]
          .sort((first, second) => {
            const firstTime = first?.createdAt?.toMillis?.() ?? 0
            const secondTime = second?.createdAt?.toMillis?.() ?? 0
            return secondTime - firstTime
          })
          .slice(0, 8)

        if (!mounted) {
          return
        }

        setGreetingName(String(profile?.displayName || '').trim() || fallbackName || 'Traveler')
        setTrips(userTrips)
        setPhotoSummary({
          totalPhotos: allPhotos.length,
          recentPhotos,
        })
      } catch (loadError) {
        if (mounted) {
          setError(loadError.message || 'Unable to load dashboard right now.')
          setGreetingName(fallbackName || 'Traveler')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadDashboardData()
    return () => {
      mounted = false
    }
  }, [user?.displayName, user?.email, user?.uid])

  const todayMs = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return now.getTime()
  }, [])

  const activeTrip = useMemo(() => {
    if (trips.length === 0) {
      return null
    }

    const current = trips.find((trip) => {
      const startMs = getStartDateMs(trip.startDate)
      const endMs = getStartDateMs(trip.endDate)
      return startMs !== null && endMs !== null && todayMs >= startMs && todayMs <= endMs
    })
    if (current) {
      return current
    }

    const upcoming = [...trips]
      .filter((trip) => {
        const startMs = getStartDateMs(trip.startDate)
        return startMs !== null && startMs > todayMs
      })
      .sort((first, second) => getStartDateMs(first.startDate) - getStartDateMs(second.startDate))

    return upcoming[0] || trips[0]
  }, [todayMs, trips])

  const stats = useMemo(() => {
    const tripsCreated = trips.length
    const completedTrips = trips.filter((trip) => {
      const endMs = getStartDateMs(trip.endDate)
      return endMs !== null && endMs < todayMs
    }).length

    const uniquePlaces = new Set()
    trips.forEach((trip) => {
      const days = Array.isArray(trip?.itinerary?.days) ? trip.itinerary.days : []
      days.forEach((day) => {
        const places = Array.isArray(day?.places) ? day.places : []
        places.forEach((place) => {
          const name = String(place?.name || '').trim()
          if (name) {
            uniquePlaces.add(name.toLowerCase())
          }
        })
      })
    })

    const photosUploaded = photoSummary.totalPhotos
    const memoriesMade = Math.max(
      tripsCreated,
      completedTrips * 3 + uniquePlaces.size + Math.ceil(photosUploaded / 4),
    )

    return {
      tripsCreated,
      completedTrips,
      placesVisited: uniquePlaces.size,
      photosUploaded,
      memoriesMade,
    }
  }, [photoSummary.totalPhotos, todayMs, trips])

  const milestones = useMemo(
    () => [
      {
        label: 'First Trip Created',
        achieved: stats.tripsCreated >= 1,
      },
      {
        label: '5 Trips Completed',
        achieved: stats.completedTrips >= 5,
      },
      {
        label: '50 Photos Uploaded',
        achieved: stats.photosUploaded >= 50,
      },
      {
        label: 'Group Explorer',
        achieved: trips.some((trip) => Number(trip?.passengerCount || 1) > 1),
      },
    ],
    [stats.completedTrips, stats.photosUploaded, stats.tripsCreated, trips],
  )

  const dailyQuote = useMemo(() => {
    const seed = `${getTodaySeed()}-${user?.uid || greetingName}`
    return DAILY_QUOTES[hashSeed(seed) % DAILY_QUOTES.length]
  }, [greetingName, user?.uid])

  return (
    <section className="space-y-6">
      <div>
        <p className="text-2xl font-semibold tracking-tight text-slate-900">
          Hello, {greetingName} <span aria-hidden="true">👋</span>
        </p>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-cyan-50 to-slate-100 px-6 py-10 text-center shadow-sm">
        <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-cyan-100/60 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-16 h-44 w-44 rounded-full bg-slate-200/60 blur-2xl" />
        <h2 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Travel Tales</h2>
        <p className="mx-auto mt-4 max-w-3xl text-base font-medium text-slate-600 sm:text-lg">
          Where Trips Are Planned Together and Memories Last Forever
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Building your dashboard...
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-12">
          <article className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md xl:col-span-5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900">Current Trip</h3>
              <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-medium text-cyan-700">
                Live
              </span>
            </div>

            {activeTrip ? (
              <div className="mt-3 space-y-2">
                <p className="text-xl font-semibold text-slate-900">{activeTrip.destination || 'Untitled Trip'}</p>
                <p className="text-sm text-slate-600">
                  {formatDateRange(activeTrip.startDate, activeTrip.endDate)}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    to={`/recommendations?tripId=${activeTrip.id}`}
                    className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    Open Itinerary
                  </Link>
                  <Link
                    to="/trip"
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    View Trip Details
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-slate-600">No trips yet. Start your first adventure.</p>
                <Link
                  to="/create-trip"
                  className="inline-flex rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Create Trip
                </Link>
              </div>
            )}
          </article>

          <article className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md xl:col-span-4">
            <h3 className="text-lg font-semibold text-slate-900">Milestones</h3>
            <ul className="mt-3 space-y-2">
              {milestones.map((milestone) => (
                <li
                  key={milestone.label}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                    milestone.achieved
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}
                >
                  <span>{milestone.label}</span>
                  <span className="text-base" aria-hidden="true">
                    {milestone.achieved ? '✓' : '•'}
                  </span>
                </li>
              ))}
            </ul>
          </article>

          <article className="group rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md xl:col-span-3">
            <h3 className="text-lg font-semibold">Travel Quote</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-100">&ldquo;{dailyQuote}&rdquo;</p>
            <p className="mt-5 text-xs uppercase tracking-wide text-slate-300">Quote of the day</p>
          </article>

          <article className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md xl:col-span-12">
            <h3 className="text-lg font-semibold text-slate-900">Quick Stats</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Trips Created</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{formatCount(stats.tripsCreated)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Places Visited</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{formatCount(stats.placesVisited)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Photos Uploaded</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{formatCount(stats.photosUploaded)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Memories Made</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{formatCount(stats.memoriesMade)}</p>
              </div>
            </div>
          </article>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-slate-900">Recent Memories</h3>
          <Link
            to="/photos"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Open Photo Album
          </Link>
        </div>

        {photoSummary.recentPhotos.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
            No memories yet. Upload your first trip photo.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photoSummary.recentPhotos.map((photo) => (
              <article
                key={photo.id}
                className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <img
                  src={photo.publicUrl}
                  alt={photo.caption || photo.destination || 'Trip memory'}
                  className="h-32 w-full object-cover transition duration-300 group-hover:scale-105 sm:h-36"
                />
                <div className="p-2.5">
                  <p className="truncate text-xs font-semibold text-slate-800">
                    {photo.destination || 'Trip'}
                  </p>
                  <p className="truncate text-xs text-slate-500">{photo.caption || 'Shared memory'}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

export default Dashboard
