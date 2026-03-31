import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { getChatRoomByTripId, listUserChatRooms } from './chatService'
import { getOngoingTrips, getTripById } from './tripService'
import { uploadPhoto } from './uploadPhoto'
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

  const room = await getChatRoomByTripId(tripId)
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
  if (!user?.uid || !user?.email) {
    throw new Error('You must be logged in to upload photos.')
  }
  if (!file) {
    throw new Error('Please choose a photo to upload.')
  }

  const { trip } = await getTripAlbumAccess({ tripId, userId: user.uid })
  const database = getDbInstance()

  const uploadedFile = await uploadPhoto(file, {
    fileNamePrefix: `trip-${tripId}`,
  })

  const profile = await getUserProfileByUid(user.uid)
  const uploadedByName = resolveDisplayName({
    displayName: profile?.displayName,
    email: user.email,
  })

  const payload = {
    tripId,
    destination: String(trip.destination || ''),
    publicUrl: uploadedFile.publicUrl,
    storagePath: uploadedFile.storagePath,
    uploadedByUid: user.uid,
    uploadedByEmail: normalizeEmail(user.email),
    uploadedByName: uploadedByName || getDisplayNameFromEmail(user.email),
    caption: String(caption || '')
      .trim()
      .slice(0, 300),
    createdAt: serverTimestamp(),
  }

  const docRef = await addDoc(collection(database, 'tripPhotos'), payload)
  return {
    id: docRef.id,
    ...payload,
  }
}
