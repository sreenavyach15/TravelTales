import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { getChatRoomByTripId, listUserChatRooms } from './chatService'
import { getOngoingTrips, getTripById } from './tripService'
import { deletePhotoByPath, uploadPhoto } from './uploadPhoto'
import { getDisplayNameFromEmail, getUserProfileByUid, normalizeEmail, resolveDisplayName } from './userService'

function getDbInstance() {
  if (!db) {
    throw new Error('Firebase Firestore is not configured. Add VITE_FIREBASE_* values first.')
  }

  return db
}

function getTimestampMillis(value) {
  return value?.toMillis?.() ?? 0
}

function sortByCreatedAtDesc(items) {
  return [...items].sort((first, second) => {
    return getTimestampMillis(second.createdAt) - getTimestampMillis(first.createdAt)
  })
}

async function getTripAlbumAccess({ tripId, userId }) {
  if (!tripId) {
    throw new Error('Trip is required.')
  }
  if (!userId) {
    throw new Error('You must be logged in to access trip album.')
  }

  const trip = await getTripById(tripId)
  if (!trip) {
    throw new Error('Trip not found.')
  }

  if (trip.userId === userId) {
    return { trip, room: null, accessRole: 'owner' }
  }

  const room = await getChatRoomByTripId(tripId, userId)
  const memberUids = Array.isArray(room?.memberUids) ? room.memberUids : []
  if (memberUids.includes(userId)) {
    return { trip, room, accessRole: 'traveler' }
  }

  throw new Error('You can access this album only if you are part of this trip.')
}

export async function listAccessibleTripAlbums(userId) {
  if (!userId) {
    return []
  }

  const [ownerTrips, joinedRooms] = await Promise.all([getOngoingTrips(userId), listUserChatRooms(userId)])
  const albumByTripId = {}

  for (const trip of ownerTrips) {
    albumByTripId[trip.id] = {
      tripId: trip.id,
      destination: String(trip.destination || 'Untitled Trip'),
      startDate: trip.startDate || '',
      endDate: trip.endDate || '',
      role: 'owner',
      createdAt: trip.createdAt || null,
    }
  }

  const roomTripIds = [...new Set(joinedRooms.map((room) => room.tripId).filter(Boolean))]
  const roomTripData = await Promise.all(
    roomTripIds.map(async (tripId) => {
      const trip = await getTripById(tripId)
      const room = joinedRooms.find((item) => item.tripId === tripId)
      return { tripId, trip, room }
    }),
  )

  for (const item of roomTripData) {
    if (albumByTripId[item.tripId]) {
      continue
    }
    if (!item.trip) {
      continue
    }

    albumByTripId[item.tripId] = {
      tripId: item.trip.id,
      destination: String(item.trip.destination || item.room?.tripDestination || 'Untitled Trip'),
      startDate: item.trip.startDate || '',
      endDate: item.trip.endDate || '',
      role: 'traveler',
      createdAt: item.trip.createdAt || item.room?.createdAt || null,
    }
  }

  return sortByCreatedAtDesc(Object.values(albumByTripId))
}

export async function listTripAlbumPhotos({ tripId, userId }) {
  await getTripAlbumAccess({ tripId, userId })

  const database = getDbInstance()
  const photosQuery = query(collection(database, 'tripPhotos'), where('tripId', '==', tripId))
  const snapshot = await getDocs(photosQuery)
  const photos = snapshot.docs.map((photoDoc) => ({
    id: photoDoc.id,
    ...photoDoc.data(),
  }))

  return sortByCreatedAtDesc(photos)
}

export async function uploadTripAlbumPhoto({ tripId, user, file, caption }) {
  const uploaded = await uploadTripAlbumPhotos({
    tripId,
    user,
    files: [file],
    caption,
  })

  return uploaded[0]
}

export async function uploadTripAlbumPhotos({ tripId, user, files, caption }) {
  if (!user?.uid || !user?.email) {
    throw new Error('You must be logged in to upload photos.')
  }
  const normalizedFiles = Array.isArray(files)
    ? files
    : Array.from(files || []).filter(Boolean)

  if (normalizedFiles.length === 0) {
    throw new Error('Please choose at least one photo to upload.')
  }

  const { trip } = await getTripAlbumAccess({ tripId, userId: user.uid })
  const database = getDbInstance()
  const trimmedCaption = String(caption || '')
    .trim()
    .slice(0, 300)

  const profile = await getUserProfileByUid(user.uid)
  const uploadedByName = resolveDisplayName({
    displayName: profile?.displayName,
    email: user.email,
  })

  const uploadedEntries = []
  for (const file of normalizedFiles) {
    const uploadedFile = await uploadPhoto(file, {
      pathPrefix: `trip-${tripId}`,
      fileNamePrefix: `trip-${tripId}`,
    })

    const payload = {
      tripId,
      destination: String(trip.destination || ''),
      publicUrl: uploadedFile.publicUrl,
      storagePath: uploadedFile.storagePath,
      uploadedByUid: user.uid,
      uploadedByEmail: normalizeEmail(user.email),
      uploadedByName: uploadedByName || getDisplayNameFromEmail(user.email),
      caption: trimmedCaption,
      createdAt: serverTimestamp(),
    }

    const docRef = await addDoc(collection(database, 'tripPhotos'), payload)
    uploadedEntries.push({
      id: docRef.id,
      ...payload,
    })
  }

  return uploadedEntries
}

export async function deleteTripAlbumPhoto({ tripId, photoId, userId }) {
  if (!userId) {
    throw new Error('You must be logged in to delete photos.')
  }
  if (!tripId || !photoId) {
    throw new Error('Trip and photo are required.')
  }

  const { accessRole } = await getTripAlbumAccess({ tripId, userId })
  const database = getDbInstance()
  const photoRef = doc(database, 'tripPhotos', photoId)
  const snapshot = await getDoc(photoRef)

  if (!snapshot.exists()) {
    throw new Error('Photo not found.')
  }

  const photo = snapshot.data() || {}
  if (photo.tripId !== tripId) {
    throw new Error('Photo does not belong to the selected trip.')
  }

  const isTripOwner = accessRole === 'owner'
  const isUploader = String(photo.uploadedByUid || '') === String(userId || '')
  if (!isTripOwner && !isUploader) {
    throw new Error('Only the trip owner or uploader can delete this photo.')
  }

  await deletePhotoByPath(photo.storagePath)
  await deleteDoc(photoRef)
}
