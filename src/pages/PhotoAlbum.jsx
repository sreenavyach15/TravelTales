import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageContainer from '../components/PageContainer'
import { useAuth } from '../hooks/useAuth'
import {
  deleteTripAlbumPhoto,
  listAccessibleTripAlbums,
  listTripAlbumPhotos,
  uploadTripAlbumPhotos,
} from '../services/photoAlbumService'

function PhotoAlbum() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tripIdFromQuery = searchParams.get('tripId') || ''

  const [albums, setAlbums] = useState([])
  const [albumPreviewByTripId, setAlbumPreviewByTripId] = useState({})

  const [selectedTripId, setSelectedTripId] = useState('')
  const [photos, setPhotos] = useState([])

  const [loadingAlbums, setLoadingAlbums] = useState(true)
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deletingPhotoId, setDeletingPhotoId] = useState('')

  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [uploadTripId, setUploadTripId] = useState('')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [caption, setCaption] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)

  const [activePhoto, setActivePhoto] = useState(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const selectedAlbum = useMemo(
    () => albums.find((album) => album.tripId === selectedTripId) || null,
    [albums, selectedTripId],
  )

  const uploadTargetAlbum = useMemo(
    () => albums.find((album) => album.tripId === uploadTripId) || null,
    [albums, uploadTripId],
  )

  const loadPreviewForTrip = async ({ tripId, userId }) => {
    try {
      const tripPhotos = await listTripAlbumPhotos({ tripId, userId })
      setAlbumPreviewByTripId((previous) => ({
        ...previous,
        [tripId]: {
          photoCount: tripPhotos.length,
          coverUrl: tripPhotos[0]?.publicUrl || '',
          latestUploadedAt: tripPhotos[0]?.createdAt || null,
        },
      }))
    } catch {
      setAlbumPreviewByTripId((previous) => ({
        ...previous,
        [tripId]: {
          photoCount: 0,
          coverUrl: '',
          latestUploadedAt: null,
        },
      }))
    }
  }

  useEffect(() => {
    let isMounted = true

    async function loadAlbums() {
      if (!user?.uid) {
        if (isMounted) {
          setAlbums([])
          setAlbumPreviewByTripId({})
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
        setSelectedTripId(hasQueryMatch ? tripIdFromQuery : '')

        const previewEntries = await Promise.all(
          availableAlbums.map(async (album) => {
            try {
              const tripPhotos = await listTripAlbumPhotos({
                tripId: album.tripId,
                userId: user.uid,
              })
              return [
                album.tripId,
                {
                  photoCount: tripPhotos.length,
                  coverUrl: tripPhotos[0]?.publicUrl || '',
                  latestUploadedAt: tripPhotos[0]?.createdAt || null,
                },
              ]
            } catch {
              return [
                album.tripId,
                {
                  photoCount: 0,
                  coverUrl: '',
                  latestUploadedAt: null,
                },
              ]
            }
          }),
        )

        if (isMounted) {
          setAlbumPreviewByTripId(Object.fromEntries(previewEntries))
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message)
          setAlbums([])
          setAlbumPreviewByTripId({})
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

  useEffect(() => {
    if (!activePhoto) {
      return
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setActivePhoto(null)
        return
      }

      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return
      }

      if (!Array.isArray(photos) || photos.length === 0) {
        return
      }

      const currentIndex = photos.findIndex((photo) => photo.id === activePhoto.id)
      if (currentIndex < 0) {
        return
      }

      event.preventDefault()
      const direction = event.key === 'ArrowRight' ? 1 : -1
      const nextIndex = (currentIndex + direction + photos.length) % photos.length
      setActivePhoto(photos[nextIndex])
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activePhoto, photos])

  useEffect(() => {
    if (!activePhoto || photos.length === 0) {
      return
    }

    const existsInList = photos.some((photo) => photo.id === activePhoto.id)
    if (!existsInList) {
      setActivePhoto(null)
    }
  }, [activePhoto, photos])

  const canDeletePhoto = (photo) => {
    if (!user?.uid || !photo) {
      return false
    }

    if (selectedAlbum?.role === 'owner') {
      return true
    }

    return String(photo.uploadedByUid || '') === String(user.uid)
  }

  const formatPhotoTime = (timestamp) => {
    const date = timestamp?.toDate?.()
    if (!date) {
      return 'Just now'
    }
    return date.toLocaleString()
  }

  const formatDateRange = (album) => {
    const start = String(album?.startDate || '').trim()
    const end = String(album?.endDate || '').trim()
    if (start && end) {
      return `${start} - ${end}`
    }
    if (start) {
      return start
    }
    if (end) {
      return end
    }
    return 'Dates not set'
  }

  const openUploadDialog = (tripId) => {
    setUploadTripId(tripId)
    setSelectedFiles([])
    setCaption('')
    setFileInputKey((previous) => previous + 1)
    setShowUploadDialog(true)
    setStatus('')
    setError('')
  }

  const closeUploadDialog = (force = false) => {
    if (uploading && !force) {
      return
    }
    setShowUploadDialog(false)
    setUploadTripId('')
    setSelectedFiles([])
    setCaption('')
  }

  const handleUploadPhotos = async (event) => {
    event.preventDefault()
    if (!uploadTripId || !user || selectedFiles.length === 0) {
      return
    }

    setUploading(true)
    setStatus('')
    setError('')

    try {
      await uploadTripAlbumPhotos({
        tripId: uploadTripId,
        user,
        files: selectedFiles,
        caption,
      })

      if (selectedTripId === uploadTripId) {
        const latestPhotos = await listTripAlbumPhotos({
          tripId: selectedTripId,
          userId: user.uid,
        })
        setPhotos(latestPhotos)
      }

      await loadPreviewForTrip({ tripId: uploadTripId, userId: user.uid })
      setStatus(`${selectedFiles.length} photo(s) added to shared album.`)
      closeUploadDialog(true)
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setUploading(false)
    }
  }

  const handleDeletePhoto = async (photo) => {
    if (!photo?.id || !user?.uid) {
      return
    }

    const photoTripId = String(photo.tripId || selectedTripId || '').trim()
    if (!photoTripId) {
      return
    }

    if (!canDeletePhoto(photo)) {
      setError('Only the trip owner or uploader can delete this photo.')
      return
    }

    const confirmed = window.confirm('Delete this photo from the shared album?')
    if (!confirmed) {
      return
    }

    setDeletingPhotoId(photo.id)
    setStatus('')
    setError('')

    try {
      await deleteTripAlbumPhoto({
        tripId: photoTripId,
        photoId: photo.id,
        userId: user.uid,
      })

      if (selectedTripId === photoTripId) {
        setPhotos((previous) => previous.filter((item) => item.id !== photo.id))
      }
      if (activePhoto?.id === photo.id) {
        setActivePhoto(null)
      }

      await loadPreviewForTrip({ tripId: photoTripId, userId: user.uid })
      setStatus('Photo deleted from shared album.')
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setDeletingPhotoId('')
    }
  }

  return (
    <PageContainer
      title="PhotoAlbum"
      description="Shared memories organized by trip. Open a trip album or upload directly from each card."
    >
      <div className="space-y-4">
        {loadingAlbums && <p className="text-sm text-slate-600">Loading trip albums...</p>}
        {status && <p className="text-sm text-emerald-700">{status}</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}

        {!loadingAlbums && albums.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500">
            No shared trip albums available yet. Create a trip or join a trip chat room to access album photos.
          </p>
        )}

        {!loadingAlbums && albums.length > 0 && !selectedTripId && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {albums.map((album) => {
              const preview = albumPreviewByTripId[album.tripId] || {}
              return (
                <article
                  key={album.tripId}
                  className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedTripId(album.tripId)}
                    className="block w-full text-left"
                  >
                    {preview.coverUrl ? (
                      <img
                        src={preview.coverUrl}
                        alt={`${album.destination} cover`}
                        className="h-44 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-44 w-full items-center justify-center bg-slate-100 text-sm text-slate-500">
                        No cover image
                      </div>
                    )}

                    <div className="space-y-1 p-4">
                      <h3 className="text-lg font-semibold text-slate-900">{album.destination}</h3>
                      <p className="text-sm text-slate-600">{formatDateRange(album)}</p>
                      <p className="text-xs text-slate-500">{preview.photoCount || 0} photo(s)</p>
                    </div>
                  </button>
                </article>
              )
            })}
          </div>
        )}

        {!loadingAlbums && selectedTripId && selectedAlbum && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedTripId('')}
                  className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  ← Back To Albums
                </button>
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-slate-900">{selectedAlbum.destination}</h3>
                  <p className="truncate text-sm text-slate-600">{formatDateRange(selectedAlbum)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openUploadDialog(selectedTripId)}
                className="shrink-0 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Upload Photos
              </button>
            </div>

            {loadingPhotos && <p className="text-sm text-slate-600">Loading photos...</p>}

            {!loadingPhotos && photos.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                No photos yet for this trip. Upload the first memory.
              </p>
            )}

            {!loadingPhotos && photos.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {photos.map((photo) => (
                  <article key={photo.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <button
                      type="button"
                      onClick={() => setActivePhoto(photo)}
                      className="block w-full"
                    >
                      <img
                        src={photo.publicUrl}
                        alt={photo.caption || 'Trip memory'}
                        className="h-48 w-full object-cover"
                      />
                    </button>
                    <div className="space-y-1 p-3">
                      <p className="text-sm font-semibold text-slate-800">{photo.uploadedByName || 'Traveler'}</p>
                      {photo.caption && <p className="text-sm text-slate-700">{photo.caption}</p>}
                      <p className="text-xs text-slate-500">{formatPhotoTime(photo.createdAt)}</p>
                      {canDeletePhoto(photo) && (
                        <button
                          type="button"
                          onClick={() => handleDeletePhoto(photo)}
                          disabled={deletingPhotoId === photo.id}
                          className="mt-2 rounded-md bg-rose-100 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingPhotoId === photo.id ? 'Deleting...' : 'Delete Photo'}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showUploadDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
          onClick={closeUploadDialog}
        >
          <form
            onSubmit={handleUploadPhotos}
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Upload To Trip Album</h3>
                <p className="text-sm text-slate-600">
                  {uploadTargetAlbum?.destination || 'Selected Trip'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeUploadDialog}
                disabled={uploading}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Close
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Photos
                <input
                  key={fileInputKey}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                  disabled={uploading}
                  required
                />
              </label>

              <p className="text-xs text-slate-500">
                {selectedFiles.length > 0
                  ? `${selectedFiles.length} file(s) selected`
                  : 'Select one or more photos.'}
              </p>

              <label className="block text-sm font-medium text-slate-700">
                Caption (optional, applies to selected files)
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

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeUploadDialog}
                disabled={uploading}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading || selectedFiles.length === 0}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </form>
        </div>
      )}

      {activePhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
          onClick={() => setActivePhoto(null)}
        >
          <div
            className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-xl bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {activePhoto.uploadedByName || 'Traveler'}
                </p>
                <p className="text-xs text-slate-500">{formatPhotoTime(activePhoto.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                {canDeletePhoto(activePhoto) && (
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(activePhoto)}
                    disabled={deletingPhotoId === activePhoto.id}
                    className="rounded-md bg-rose-100 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingPhotoId === activePhoto.id ? 'Deleting...' : 'Delete'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActivePhoto(null)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="bg-slate-100 p-3">
              <img
                src={activePhoto.publicUrl}
                alt={activePhoto.caption || 'Trip memory'}
                className="max-h-[72vh] w-full rounded-md object-contain"
              />
            </div>
            {activePhoto.caption && (
              <p className="px-4 pb-4 text-sm text-slate-700">{activePhoto.caption}</p>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  )
}

export default PhotoAlbum
