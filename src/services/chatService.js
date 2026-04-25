import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { validateEmail } from './authValidation'
import { ensureSupabaseSession, supabase } from './supabaseClient'
import {
  getDisplayNameFromEmail,
  getUserProfileByEmail,
  normalizeEmail,
} from './userService'

function getDbInstance() {
  if (!db) {
    throw new Error('Firebase Firestore is not configured. Add VITE_FIREBASE_* values first.')
  }

  return db
}

export const CHAT_FILE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024
export const CHAT_FILE_SIZE_LIMIT_MB = CHAT_FILE_SIZE_LIMIT_BYTES / (1024 * 1024)
const CHAT_FILES_BUCKET = 'chat-files'

function sanitizeFileName(fileName) {
  return String(fileName || 'file')
    .replace(/[^\w.\-() ]+/g, '_')
    .slice(0, 120)
}

async function uploadChatAttachment({ roomId, userId, file }) {
  if (!file) {
    return null
  }
  if (file.size > CHAT_FILE_SIZE_LIMIT_BYTES) {
    throw new Error(`File exceeds ${CHAT_FILE_SIZE_LIMIT_MB} MB limit.`)
  }
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }

  await ensureSupabaseSession()
  const safeName = sanitizeFileName(file.name)
  const objectPath = `chatRooms/${roomId}/${Date.now()}-${safeName}`

  let uploadError = null
  try {
    const uploadResult = await supabase.storage.from(CHAT_FILES_BUCKET).upload(objectPath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    })
    uploadError = uploadResult.error
  } catch (error) {
    if (error instanceof TypeError && String(error.message || '').toLowerCase().includes('fetch')) {
      throw new Error(
        'Failed to reach Supabase Storage. Check internet connection, VITE_SUPABASE_URL, and bucket policies.',
      )
    }
    throw error
  }

  if (uploadError) {
    const message = String(uploadError.message || '')
    if (message.toLowerCase().includes('row-level security policy')) {
      throw new Error(
        'Supabase blocked upload by RLS policy. Allow authenticated inserts for bucket "chat-files".',
      )
    }
    throw new Error(uploadError.message)
  }

  const { data } = supabase.storage.from(CHAT_FILES_BUCKET).getPublicUrl(objectPath)
  const fileUrl = data?.publicUrl || ''
  if (!fileUrl) {
    throw new Error('Unable to resolve public URL for uploaded chat file.')
  }

  return {
    fileUrl,
    fileName: safeName,
    fileSize: Number(file.size || 0),
    fileType: String(file.type || '').trim(),
    storagePath: objectPath,
    uploaderUid: userId,
  }
}

function parseInviteEmails(inviteEmails) {
  const values = Array.isArray(inviteEmails)
    ? inviteEmails
    : String(inviteEmails || '')
        .split(/[\n,;]+/g)
        .map((value) => value.trim())
        .filter(Boolean)

  return [...new Set(values.map((value) => normalizeEmail(value)).filter(Boolean))]
}

function sortByCreatedAtDesc(items) {
  return [...items].sort((first, second) => {
    const firstTime = first.createdAt?.toMillis?.() ?? 0
    const secondTime = second.createdAt?.toMillis?.() ?? 0
    return secondTime - firstTime
  })
}

function getTimestampMillis(value) {
  return value?.toMillis?.() ?? 0
}

async function resolveInviteTargets({ inviteEmails, currentUser, existingMemberEmails = [] }) {
  const normalizedInviteEmails = parseInviteEmails(inviteEmails)
  const existingMembers = new Set(existingMemberEmails.map((email) => normalizeEmail(email)))
  const currentUserEmail = normalizeEmail(currentUser?.email)

  const invalidEmails = []
  const notFoundEmails = []
  const skippedEmails = []
  const usersToInvite = []

  for (const email of normalizedInviteEmails) {
    if (validateEmail(email)) {
      invalidEmails.push(email)
      continue
    }
    if (!email || email === currentUserEmail || existingMembers.has(email)) {
      skippedEmails.push(email)
      continue
    }

    const userProfile = await getUserProfileByEmail(email)
    if (!userProfile?.uid) {
      notFoundEmails.push(email)
      continue
    }

    usersToInvite.push({
      uid: userProfile.uid,
      email: userProfile.email,
      emailLower: userProfile.emailLower || email,
    })
  }

  return {
    usersToInvite,
    invalidEmails,
    notFoundEmails,
    skippedEmails,
  }
}

export async function getChatRoomByTripId(tripId, userId) {
  if (!tripId || !userId) {
    return null
  }

  const database = getDbInstance()
  const roomsQuery = query(
    collection(database, 'chatRooms'),
    where('tripId', '==', tripId),
    where('memberUids', 'array-contains', userId),
    limit(1),
  )
  const snapshot = await getDocs(roomsQuery)

  if (snapshot.empty) {
    return null
  }

  const firstDoc = snapshot.docs[0]
  return {
    id: firstDoc.id,
    ...firstDoc.data(),
  }
}

async function upsertInvite({
  roomId,
  tripId,
  roomName,
  inviterUid,
  inviterEmail,
  inviteeUid,
  inviteeEmail,
}) {
  const database = getDbInstance()
  const inviteRef = doc(database, 'chatInvites', `${roomId}_${inviteeUid}`)

  const payload = {
    roomId,
    tripId,
    roomName,
    inviterUid,
    inviterEmail: normalizeEmail(inviterEmail),
    inviteeUid,
    inviteeEmail: normalizeEmail(inviteeEmail),
    status: 'pending',
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }

  await setDoc(inviteRef, payload, { merge: true })
}

export async function createChatRoomForTrip({ trip, adminUser, groupName, inviteEmails }) {
  if (!trip?.id) {
    throw new Error('Trip is required to create a chat room.')
  }
  if (!adminUser?.uid || !adminUser?.email) {
    throw new Error('You must be logged in to create a chat room.')
  }
  if (trip.userId !== adminUser.uid) {
    throw new Error('Only the trip owner can create a chat room.')
  }

  const roomName = String(groupName || '').trim()
  if (!roomName) {
    throw new Error('Group name is required.')
  }

  const existingRoom = await getChatRoomByTripId(trip.id, adminUser.uid)
  if (existingRoom) {
    throw new Error('Chat room already exists for this trip.')
  }

  const database = getDbInstance()
  const adminEmail = normalizeEmail(adminUser.email)

  const { usersToInvite, invalidEmails, notFoundEmails, skippedEmails } = await resolveInviteTargets({
    inviteEmails,
    currentUser: adminUser,
    existingMemberEmails: [adminEmail],
  })

  const roomPayload = {
    tripId: trip.id,
    tripDestination: String(trip.destination || '').trim(),
    roomName,
    adminUid: adminUser.uid,
    adminEmail,
    memberUids: [adminUser.uid],
    memberEmails: [adminEmail],
    lastReadBy: {
      [adminUser.uid]: serverTimestamp(),
    },
    lastMessageAt: null,
    lastMessageAuthorUid: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const roomDocRef = await addDoc(collection(database, 'chatRooms'), roomPayload)

  for (const invitee of usersToInvite) {
    await upsertInvite({
      roomId: roomDocRef.id,
      tripId: trip.id,
      roomName,
      inviterUid: adminUser.uid,
      inviterEmail: adminEmail,
      inviteeUid: invitee.uid,
      inviteeEmail: invitee.emailLower,
    })
  }

  return {
    room: {
      id: roomDocRef.id,
      ...roomPayload,
      createdAt: null,
      updatedAt: null,
    },
    invitedUsers: usersToInvite,
    invalidEmails,
    notFoundEmails,
    skippedEmails,
  }
}

export async function inviteMembersToChatRoom({ room, adminUser, inviteEmails }) {
  if (!room?.id) {
    throw new Error('Room is required.')
  }
  if (!adminUser?.uid || !adminUser?.email) {
    throw new Error('You must be logged in.')
  }
  if (room.adminUid !== adminUser.uid) {
    throw new Error('Only the room admin can invite members.')
  }

  const existingMemberEmails = Array.isArray(room.memberEmails) ? room.memberEmails : []
  const { usersToInvite, invalidEmails, notFoundEmails, skippedEmails } = await resolveInviteTargets({
    inviteEmails,
    currentUser: adminUser,
    existingMemberEmails,
  })

  for (const invitee of usersToInvite) {
    await upsertInvite({
      roomId: room.id,
      tripId: room.tripId || '',
      roomName: room.roomName || 'Trip Group',
      inviterUid: adminUser.uid,
      inviterEmail: adminUser.email,
      inviteeUid: invitee.uid,
      inviteeEmail: invitee.emailLower,
    })
  }

  return {
    invitedUsers: usersToInvite,
    invalidEmails,
    notFoundEmails,
    skippedEmails,
  }
}

export async function listUserChatRooms(userId) {
  if (!userId) {
    return []
  }

  const database = getDbInstance()
  const roomsQuery = query(collection(database, 'chatRooms'), where('memberUids', 'array-contains', userId))
  const snapshot = await getDocs(roomsQuery)
  const rooms = snapshot.docs.map((roomDoc) => ({
    id: roomDoc.id,
    ...roomDoc.data(),
  }))

  return sortByCreatedAtDesc(rooms)
}

export async function listPendingChatInvitesForUser(userId) {
  if (!userId) {
    return []
  }

  const database = getDbInstance()
  const invitesQuery = query(collection(database, 'chatInvites'), where('inviteeUid', '==', userId))
  const snapshot = await getDocs(invitesQuery)

  const invites = snapshot.docs
    .map((inviteDoc) => ({
      id: inviteDoc.id,
      ...inviteDoc.data(),
    }))
    .filter((invite) => invite.status === 'pending')

  return sortByCreatedAtDesc(invites)
}

export async function acceptChatInvite({ inviteId, user }) {
  if (!inviteId) {
    throw new Error('Invite not found.')
  }
  if (!user?.uid || !user?.email) {
    throw new Error('You must be logged in.')
  }

  const database = getDbInstance()
  const inviteRef = doc(database, 'chatInvites', inviteId)
  const inviteSnapshot = await getDoc(inviteRef)

  if (!inviteSnapshot.exists()) {
    throw new Error('Invite does not exist.')
  }

  const invite = inviteSnapshot.data()
  if (invite.inviteeUid !== user.uid) {
    throw new Error('This invite is not for your account.')
  }
  if (invite.status !== 'pending') {
    return invite.roomId
  }

  const roomRef = doc(database, 'chatRooms', invite.roomId)
  await updateDoc(roomRef, {
    memberUids: arrayUnion(user.uid),
    memberEmails: arrayUnion(normalizeEmail(user.email)),
    [`lastReadBy.${user.uid}`]: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await updateDoc(inviteRef, {
    status: 'accepted',
    respondedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return invite.roomId
}

export async function sendMessageToChatRoom({ roomId, user, text, file = null, authorName = '' }) {
  if (!roomId) {
    throw new Error('Room is required.')
  }
  if (!user?.uid || !user?.email) {
    throw new Error('You must be logged in to send messages.')
  }

  const trimmedText = String(text || '').trim()
  if (!trimmedText && !file) {
    return
  }

  const resolvedAuthorName =
    String(authorName || '').trim() ||
    String(user.displayName || '').trim() ||
    getDisplayNameFromEmail(user.email)

  const database = getDbInstance()
  const attachment = await uploadChatAttachment({
    roomId,
    userId: user.uid,
    file,
  })

  const payload = {
    authorUid: user.uid,
    authorEmail: normalizeEmail(user.email),
    authorName: resolvedAuthorName,
    text: trimmedText,
    fileUrl: '',
    fileName: '',
    fileSize: 0,
    fileType: '',
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
  }

  if (attachment) {
    payload.fileUrl = attachment.fileUrl
    payload.fileName = attachment.fileName
    payload.fileSize = attachment.fileSize
    payload.fileType = attachment.fileType
    payload.storagePath = attachment.storagePath
  }

  await Promise.all([
    addDoc(collection(database, 'chatRooms', roomId, 'messages'), {
      ...payload,
    }),
    updateDoc(doc(database, 'chatRooms', roomId), {
      lastMessageAt: serverTimestamp(),
      lastMessageAuthorUid: user.uid,
      updatedAt: serverTimestamp(),
    }),
  ])
}

export async function sendSystemMessageToChatRoom({ roomId, user, text, metadata = {} }) {
  if (!roomId) {
    throw new Error('Room is required.')
  }
  if (!user?.uid || !user?.email) {
    throw new Error('You must be logged in to post system message.')
  }

  const trimmedText = String(text || '').trim()
  if (!trimmedText) {
    return
  }

  const database = getDbInstance()
  const payload = {
    authorUid: user.uid,
    authorEmail: normalizeEmail(user.email),
    authorName: 'System',
    text: trimmedText,
    fileUrl: '',
    fileName: '',
    fileSize: 0,
    fileType: '',
    messageType: 'system',
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
  }

  await Promise.all([
    addDoc(collection(database, 'chatRooms', roomId, 'messages'), payload),
    updateDoc(doc(database, 'chatRooms', roomId), {
      lastMessageAt: serverTimestamp(),
      lastMessageAuthorUid: user.uid,
      updatedAt: serverTimestamp(),
    }),
  ])
}

export async function markChatRoomAsRead({ roomId, userId }) {
  if (!roomId || !userId) {
    return
  }

  const database = getDbInstance()
  await updateDoc(doc(database, 'chatRooms', roomId), {
    [`lastReadBy.${userId}`]: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export function hasUnreadRoomMessages(room, userId) {
  if (!room || !userId) {
    return false
  }

  const lastMessageAtMs = getTimestampMillis(room.lastMessageAt)
  if (!lastMessageAtMs) {
    return false
  }

  if (room.lastMessageAuthorUid === userId) {
    return false
  }

  const lastReadValue = room?.lastReadBy?.[userId]
  const lastReadMs = getTimestampMillis(lastReadValue)
  return lastMessageAtMs > lastReadMs
}

export function countUnreadRooms(rooms, userId) {
  return (rooms || []).filter((room) => hasUnreadRoomMessages(room, userId)).length
}

export function subscribeToPendingChatInvites({ userId, onInvites, onError }) {
  if (!userId) {
    return () => {}
  }

  const database = getDbInstance()
  const invitesQuery = query(collection(database, 'chatInvites'), where('inviteeUid', '==', userId))

  return onSnapshot(
    invitesQuery,
    (snapshot) => {
      const invites = snapshot.docs
        .map((inviteDoc) => ({
          id: inviteDoc.id,
          ...inviteDoc.data(),
        }))
        .filter((invite) => invite.status === 'pending')

      onInvites(sortByCreatedAtDesc(invites))
    },
    (error) => {
      if (onError) {
        onError(error)
      }
    },
  )
}

export function subscribeToUserChatRooms({ userId, onRooms, onError }) {
  if (!userId) {
    return () => {}
  }

  const database = getDbInstance()
  const roomsQuery = query(collection(database, 'chatRooms'), where('memberUids', 'array-contains', userId))

  return onSnapshot(
    roomsQuery,
    (snapshot) => {
      const rooms = snapshot.docs.map((roomDoc) => ({
        id: roomDoc.id,
        ...roomDoc.data(),
      }))
      onRooms(sortByCreatedAtDesc(rooms))
    },
    (error) => {
      if (onError) {
        onError(error)
      }
    },
  )
}

export function subscribeToChatRoomMessages({ roomId, onMessages, onError }) {
  if (!roomId) {
    return () => {}
  }

  const database = getDbInstance()
  const messagesQuery = query(
    collection(database, 'chatRooms', roomId, 'messages'),
    orderBy('createdAt', 'asc'),
  )

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      const messages = snapshot.docs.map((messageDoc) => ({
        id: messageDoc.id,
        ...messageDoc.data(),
      }))
      onMessages(messages)
    },
    (error) => {
      if (onError) {
        onError(error)
      }
    },
  )
}
