import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'

function getDbInstance() {
  if (!db) {
    throw new Error('Firebase Firestore is not configured. Add VITE_FIREBASE_* values first.')
  }

  return db
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeUid(value) {
  return normalizeText(value)
}

function normalizeUidList(value) {
  const items = Array.isArray(value) ? value : []
  return [...new Set(items.map((item) => normalizeUid(item)).filter(Boolean))]
}

function sortByCreatedAtDesc(items) {
  return [...items].sort((first, second) => {
    const firstTime = first.createdAt?.toMillis?.() ?? 0
    const secondTime = second.createdAt?.toMillis?.() ?? 0
    return secondTime - firstTime
  })
}

export async function createTripNotifications({
  tripId,
  message,
  recipientUids,
  triggeredByUid,
  type = 'trip_update',
  metadata = {},
}) {
  const normalizedMessage = normalizeText(message)
  const normalizedTripId = normalizeText(tripId)
  const normalizedTriggeredByUid = normalizeUid(triggeredByUid)
  const recipients = normalizeUidList(recipientUids)

  if (!normalizedMessage || !normalizedTriggeredByUid || recipients.length === 0) {
    return []
  }

  const database = getDbInstance()
  const now = serverTimestamp()

  const writeResults = await Promise.all(
    recipients.map(async (userId) => {
      const payload = {
        userId,
        tripId: normalizedTripId,
        type: normalizeText(type) || 'trip_update',
        message: normalizedMessage,
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
        isRead: false,
        triggeredByUid: normalizedTriggeredByUid,
        createdAt: now,
        updatedAt: now,
      }
      const docRef = await addDoc(collection(database, 'tripNotifications'), payload)
      return { id: docRef.id, ...payload }
    }),
  )

  return writeResults
}

export async function listTripNotificationsForUser(userId) {
  const normalizedUserId = normalizeUid(userId)
  if (!normalizedUserId) {
    return []
  }

  const database = getDbInstance()
  const notificationsQuery = query(
    collection(database, 'tripNotifications'),
    where('userId', '==', normalizedUserId),
  )

  const snapshot = await getDocs(notificationsQuery)
  const notifications = snapshot.docs.map((notificationDoc) => ({
    id: notificationDoc.id,
    ...notificationDoc.data(),
  }))

  return sortByCreatedAtDesc(notifications)
}

export async function markTripNotificationAsRead(notificationId, userId) {
  const normalizedId = normalizeText(notificationId)
  const normalizedUserId = normalizeUid(userId)
  if (!normalizedId || !normalizedUserId) {
    return
  }

  const database = getDbInstance()
  await updateDoc(doc(database, 'tripNotifications', normalizedId), {
    isRead: true,
    updatedAt: serverTimestamp(),
  })
}

export async function markAllTripNotificationsAsRead(userId) {
  const notifications = await listTripNotificationsForUser(userId)
  const unread = notifications.filter((item) => item.isRead !== true)

  await Promise.all(
    unread.map((item) => markTripNotificationAsRead(item.id, userId)),
  )
}

export function subscribeToTripNotifications({ userId, onNotifications, onError }) {
  const normalizedUserId = normalizeUid(userId)
  if (!normalizedUserId) {
    return () => {}
  }

  const database = getDbInstance()
  const notificationsQuery = query(
    collection(database, 'tripNotifications'),
    where('userId', '==', normalizedUserId),
  )

  return onSnapshot(
    notificationsQuery,
    (snapshot) => {
      const notifications = snapshot.docs.map((notificationDoc) => ({
        id: notificationDoc.id,
        ...notificationDoc.data(),
      }))
      onNotifications(sortByCreatedAtDesc(notifications))
    },
    (error) => {
      if (onError) {
        onError(error)
      }
    },
  )
}
