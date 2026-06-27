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
import { getTripsByUser } from './tripService'

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

function getDateOnly(value) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function getTripStartDateTime(trip) {
  if (!trip?.startDate) {
    return null
  }

  const time = String(trip.arrivalTime || '00:00').trim() || '00:00'
  const parsed = new Date(`${trip.startDate}T${time}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getReminderMessage(trip, daysUntilStart, hoursUntilStart) {
  const destination = String(trip?.destination || 'Your trip').trim()
  if (daysUntilStart === 7) return `Your ${destination} trip starts in 7 days.`
  if (daysUntilStart === 3) return `Your ${destination} trip starts in 3 days.`
  if (daysUntilStart === 1) return `Your ${destination} trip starts tomorrow.`
  if (daysUntilStart === 0 && hoursUntilStart > 0 && hoursUntilStart <= 3) {
    return `Your ${destination} trip starts in ${hoursUntilStart} hour${hoursUntilStart === 1 ? '' : 's'}.`
  }
  return `Your ${destination} trip starts today.`
}

export async function ensureUpcomingTripReminderNotifications(userId) {
  const normalizedUserId = normalizeUid(userId)
  if (!normalizedUserId) {
    return []
  }

  const [trips, notifications] = await Promise.all([
    getTripsByUser(normalizedUserId),
    listTripNotificationsForUser(normalizedUserId),
  ])

  const existingReminderKeys = new Set(
    notifications
      .map((notification) => notification?.metadata?.reminderKey)
      .filter(Boolean),
  )

  const today = getDateOnly(new Date())
  const now = new Date()
  const remindersToCreate = []

  trips.forEach((trip) => {
    const tripStart = getTripStartDateTime(trip)
    if (!tripStart) {
      return
    }

    const startDay = getDateOnly(tripStart)
    const daysUntilStart = Math.round((startDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    const hoursUntilStart = Math.ceil((tripStart.getTime() - now.getTime()) / (1000 * 60 * 60))
    const shouldNotify =
      [7, 3, 1].includes(daysUntilStart) ||
      (daysUntilStart === 0 && hoursUntilStart >= 0)

    if (!shouldNotify) {
      return
    }

    const reminderKey =
      daysUntilStart === 0 && hoursUntilStart > 0 && hoursUntilStart <= 3
        ? `${trip.id}_starts_soon`
        : `${trip.id}_starts_${daysUntilStart}_days`

    if (existingReminderKeys.has(reminderKey)) {
      return
    }

    remindersToCreate.push({
      trip,
      reminderKey,
      daysUntilStart,
      hoursUntilStart,
    })
  })

  const created = []
  for (const reminder of remindersToCreate) {
    const result = await createTripNotifications({
      tripId: reminder.trip.id,
      message: getReminderMessage(reminder.trip, reminder.daysUntilStart, reminder.hoursUntilStart),
      recipientUids: [normalizedUserId],
      triggeredByUid: normalizedUserId,
      type: 'trip_reminder',
      metadata: {
        reminderKey: reminder.reminderKey,
        startDate: reminder.trip.startDate || '',
        arrivalTime: reminder.trip.arrivalTime || '',
      },
    })
    created.push(...result)
  }

  return created
}
