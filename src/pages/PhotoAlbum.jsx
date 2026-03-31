import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageContainer from '../components/PageContainer'
import { useAuth } from '../hooks/useAuth'
import {
  listAccessibleTripAlbums,
  listTripAlbumPhotos,
  uploadTripAlbumPhoto,
} from '../services/photoAlbumService'

function PhotoAlbum() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tripIdFromQuery = searchParams.get('tripId') || ''

  const [albums, setAlbums] = useState([])
  const [selectedTripId, setSelectedTripId] = useState('')
  const [photos, setPhotos] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [caption, setCaption] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [loadingAlbums, setLoadingAlbums] = useState(true)
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fileInputKey, setFileInputKey] = useState(0)

  const selectedAlbum = useMemo(
    () => albums.find((album) => album.tripId === selectedTripId) || null,
    [albums, selectedTripId],
  )

  useEffect(() => {
    let isMounted = true

    async function loadAlbums() {
      if (!user?.uid) {
        if (isMounted) {
          setAlbums([])
          setSelectedTripId('')
          setLoadingAlbums(false)
        }
        return
      }

      setLoadingAlbums(true)
      setError('')
      try {
        const availableAlbums = await listAccessibleTripAlbums(user.uid)
        if (!isMounted) {
          return
        }

        setAlbums(availableAlbums)
        const hasQueryMatch = availableAlbums.some((album) => album.tripId === tripIdFromQuery)
        if (hasQueryMatch) {
          setSelectedTripId(tripIdFromQuery)
          return
        }

        setSelectedTripId(availableAlbums[0]?.tripId || '')
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message)
          setAlbums([])
          setSelectedTripId('')
        }
      } finally {
        if (isMounted) {
          setLoadingAlbums(false)
        }
      }
    }

    loadAlbums()
    return () => {
      isMounted = false
    }
  }, [tripIdFromQuery, user?.uid])

  useEffect(() => {
    if (!selectedTripId && tripIdFromQuery) {
      setSearchParams({}, { replace: true })
      return
    }
    if (selectedTripId && selectedTripId !== tripIdFromQuery) {
      setSearchParams({ tripId: selectedTripId }, { replace: true })
    }
  }, [selectedTripId, setSearchParams, tripIdFromQuery])

  useEffect(() => {
    let isMounted = true

    async function loadPhotos() {
      if (!user?.uid || !selectedTripId) {
        if (isMounted) {
          setPhotos([])
          setLoadingPhotos(false)
        }
        return
      }

      setLoadingPhotos(true)
      setError('')
      try {
        const tripPhotos = await listTripAlbumPhotos({
          tripId: selectedTripId,
          userId: user.uid,
        })
        if (isMounted) {
          setPhotos(tripPhotos)
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message)
          setPhotos([])
        }
      } finally {
        if (isMounted) {
          setLoadingPhotos(false)
        }
      }
    }

    loadPhotos()
    return () => {
      isMounted = false
    }
  }, [selectedTripId, user?.uid])

  const handleUploadPhoto = async (event) => {
    event.preventDefault()
    if (!selectedTripId || !selectedFile || !user) {
      return
    }

    setUploading(true)
    setStatus('')
    setError('')

    try {
      await uploadTripAlbumPhoto({
        tripId: selectedTripId,
        user,
        file: selectedFile,
        caption,
      })

      const latestPhotos = await listTripAlbumPhotos({
        tripId: selectedTripId,
        userId: user.uid,
      })

      setPhotos(latestPhotos)
      setStatus('Photo added to shared trip album.')
      setSelectedFile(null)
      setCaption('')
      setFileInputKey((previous) => previous + 1)
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setUploading(false)
    }
  }

  const formatPhotoTime = (timestamp) => {
    const date = timestamp?.toDate?.()
    if (!date) {
      return 'Just now'
    }

    return date.toLocaleString()
  }

  return (
    <PageContainer
      title="PhotoAlbum"
      description="One shared album per trip. All trip travelers can upload and view memories together."
    >
      <div className="space-y-4">
        {loadingAlbums && <p className="text-sm text-slate-600">Loading trip albums...</p>}
        {status && <p className="text-sm text-emerald-700">{status}</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}

        {!loadingAlbums && albums.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Select Trip Album</p>
            <div className="flex flex-wrap gap-2">
              {albums.map((album) => (
                <button
                  key={album.tripId}
                  type="button"
                  onClick={() => setSelectedTripId(album.tripId)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    selectedTripId === album.tripId
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {album.destination}
                </button>
              ))}
            </div>
            {selectedAlbum && (
              <p className="text-xs text-slate-500">
                {selectedAlbum.startDate || 'Date not set'} - {selectedAlbum.endDate || 'Date not set'} |{' '}
                {selectedAlbum.role === 'owner' ? 'Trip owner access' : 'Traveler access'}
              </p>
            )}
          </div>
        )}

        {!loadingAlbums && albums.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500">
            No shared trip albums available yet. Create a trip or join a trip chat room to access album photos.
          </p>
        )}

        {selectedTripId && (
          <form
            onSubmit={handleUploadPhoto}
            className="rounded-lg border border-slate-200 bg-slate-50 p-4"
          >
            <h3 className="text-base font-semibold text-slate-900">Upload To Shared Album</h3>
            <p className="mt-1 text-sm text-slate-600">Everyone in this trip can view these photos.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Photo
                <input
                  key={fileInputKey}
                  type="file"
                  accept="image/*"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                  disabled={uploading}
                  required
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Caption (optional)
                <input
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  maxLength={300}
                  placeholder="Sunset at the beach"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  disabled={uploading}
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {uploading ? 'Uploading...' : 'Upload Photo'}
            </button>
          </form>
        )}

        {selectedTripId && (
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-slate-900">Shared Memories</h3>
            {loadingPhotos && <p className="text-sm text-slate-600">Loading photos...</p>}

            {!loadingPhotos && photos.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                No photos yet for this trip. Upload the first memory.
              </p>
            )}

            {!loadingPhotos && photos.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {photos.map((photo) => (
                  <article key={photo.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <img
                      src={photo.publicUrl}
                      alt={photo.caption || 'Trip memory'}
                      className="h-48 w-full object-cover"
                    />
                    <div className="space-y-1 p-3">
                      <p className="text-sm font-semibold text-slate-800">{photo.uploadedByName || 'Traveler'}</p>
                      {photo.caption && <p className="text-sm text-slate-700">{photo.caption}</p>}
                      <p className="text-xs text-slate-500">{formatPhotoTime(photo.createdAt)}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  )
}

export default PhotoAlbum
