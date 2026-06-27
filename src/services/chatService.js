import {
  addDoc,
  arrayRemove,
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
import { createTripNotifications } from './tripNotificationService'
import {
  getDisplayNameFromEmail,
  getUserProfileByEmail,
  getUserProfileByUid,
  normalizeEmail,
  resolveDisplayName,
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

function getAuthUserDisplayName(user) {
  return resolveDisplayName({
    displayName: user?.displayName,
    email: user?.email,
  })
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

  await createTripNotifications({
    tripId,
    message: `You were invited to ${roomName || 'Trip Group'}.`,
    recipientUids: [inviteeUid],
    triggeredByUid: inviterUid,
    type: 'chat_invite',
    metadata: {
      roomId,
      inviteeEmail: normalizeEmail(inviteeEmail),
    },
  })
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
    removedMemberUids: [],
    removedMemberEmails: [],
    leftMemberUids: [],
    leftMemberEmails: [],
    hiddenForUids: [],
    memberEvents: [],
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
  const roomCollections = await Promise.all([
    getDocs(query(collection(database, 'chatRooms'), where('memberUids', 'array-contains', userId))),
    getDocs(query(collection(database, 'chatRooms'), where('removedMemberUids', 'array-contains', userId))),
    getDocs(query(collection(database, 'chatRooms'), where('leftMemberUids', 'array-contains', userId))),
  ])

  const roomsById = {}
  roomCollections.forEach((snapshot) => {
    snapshot.docs.forEach((roomDoc) => {
      roomsById[roomDoc.id] = {
        id: roomDoc.id,
        ...roomDoc.data(),
      }
    })
  })

  return sortByCreatedAtDesc(
    Object.values(roomsById).filter((room) => !(room.hiddenForUids || []).includes(userId)),
  )
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
    removedMemberUids: arrayRemove(user.uid),
    removedMemberEmails: arrayRemove(normalizeEmail(user.email)),
    leftMemberUids: arrayRemove(user.uid),
    leftMemberEmails: arrayRemove(normalizeEmail(user.email)),
    hiddenForUids: arrayRemove(user.uid),
    [`lastReadBy.${user.uid}`]: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await updateDoc(inviteRef, {
    status: 'accepted',
    respondedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  await createTripNotifications({
    tripId: invite.tripId || '',
    message: `You were added to ${invite.roomName || 'Trip Group'}.`,
    recipientUids: [user.uid],
    triggeredByUid: user.uid,
    type: 'trip_group_added',
    metadata: {
      roomId: invite.roomId,
    },
  })

  await sendSystemMessageToChatRoom({
    roomId: invite.roomId,
    user,
    text: `${getAuthUserDisplayName(user)} was added to the group.`,
    metadata: {
      type: 'member_added',
      userId: user.uid,
      userEmail: normalizeEmail(user.email),
      at: Date.now(),
    },
  })

  return invite.roomId
}

async function getRoomById(roomId) {
  const database = getDbInstance()
  const roomSnapshot = await getDoc(doc(database, 'chatRooms', roomId))
  if (!roomSnapshot.exists()) {
    throw new Error('Chat room not found.')
  }
  return {
    id: roomSnapshot.id,
    ...roomSnapshot.data(),
  }
}

export async function removeChatRoomMember({ roomId, adminUser, member }) {
  if (!roomId || !adminUser?.uid) {
    throw new Error('Room and admin are required.')
  }

  const memberUid = String(member?.uid || '').trim()
  const memberEmail = normalizeEmail(member?.email)
  if (!memberUid) {
    throw new Error('Member account is required.')
  }

  const room = await getRoomById(roomId)
  if (room.adminUid !== adminUser.uid) {
    throw new Error('Only the room admin can remove members.')
  }
  if (memberUid === room.adminUid) {
    throw new Error('The room admin cannot be removed. Assigning another admin is not supported yet.')
  }
  if (!(room.memberUids || []).includes(memberUid)) {
    throw new Error('This user is not an active member.')
  }

  const database = getDbInstance()
  const roomRef = doc(database, 'chatRooms', roomId)
  const event = {
    type: 'removed',
    userId: memberUid,
    userEmail: memberEmail,
    byUid: adminUser.uid,
    byEmail: normalizeEmail(adminUser.email),
    at: Date.now(),
  }

  await updateDoc(roomRef, {
    memberUids: arrayRemove(memberUid),
    memberEmails: memberEmail ? arrayRemove(memberEmail) : arrayRemove(''),
    removedMemberUids: arrayUnion(memberUid),
    removedMemberEmails: memberEmail ? arrayUnion(memberEmail) : arrayUnion(''),
    leftMemberUids: arrayRemove(memberUid),
    leftMemberEmails: memberEmail ? arrayRemove(memberEmail) : arrayRemove(''),
    hiddenForUids: arrayRemove(memberUid),
    memberEvents: arrayUnion(event),
    updatedAt: serverTimestamp(),
  })

  await sendSystemMessageToChatRoom({
    roomId,
    user: adminUser,
    text: `${member.name || memberEmail || 'A member'} was removed from this group by admin.`,
    metadata: event,
  })

  await createTripNotifications({
    tripId: room.tripId || '',
    message: `You have been removed from ${room.roomName || 'this group'} by admin.`,
    recipientUids: [memberUid],
    triggeredByUid: adminUser.uid,
    type: 'chat_member_removed',
    metadata: {
      roomId,
      removedByUid: adminUser.uid,
    },
  })
}

export async function leaveChatRoom({ roomId, user }) {
  if (!roomId || !user?.uid || !user?.email) {
    throw new Error('Room and user are required.')
  }

  const room = await getRoomById(roomId)
  if (!(room.memberUids || []).includes(user.uid)) {
    throw new Error('You are not an active member of this room.')
  }

  const userEmail = normalizeEmail(user.email)
  const memberUids = Array.isArray(room.memberUids) ? room.memberUids : []
  const memberEmails = Array.isArray(room.memberEmails) ? room.memberEmails : []
  const isLeavingAdmin = room.adminUid === user.uid
  const remainingMemberUids = memberUids.filter((uid) => uid !== user.uid)
  const nextAdminUid = isLeavingAdmin ? remainingMemberUids[0] || '' : String(room.adminUid || '')
  const nextAdminIndex = nextAdminUid ? memberUids.indexOf(nextAdminUid) : -1
  const nextAdminEmail = nextAdminUid
    ? normalizeEmail(memberEmails[nextAdminIndex] || '')
    : ''
  let nextAdminName = nextAdminEmail ? getDisplayNameFromEmail(nextAdminEmail) : 'Another member'

  if (nextAdminUid) {
    try {
      const nextAdminProfile = await getUserProfileByUid(nextAdminUid)
      nextAdminName = resolveDisplayName({
        displayName: nextAdminProfile?.displayName,
        email: nextAdminProfile?.email || nextAdminEmail,
      })
    } catch {
      nextAdminName = nextAdminEmail ? getDisplayNameFromEmail(nextAdminEmail) : 'Another member'
    }
  }

  const database = getDbInstance()
  const roomRef = doc(database, 'chatRooms', roomId)
  const event = {
    type: 'left',
    userId: user.uid,
    userEmail,
    byUid: user.uid,
    byEmail: userEmail,
    at: Date.now(),
  }

  await sendSystemMessageToChatRoom({
    roomId,
    user,
    text: `${getAuthUserDisplayName(user)} left the group.`,
    metadata: event,
  })

  if (isLeavingAdmin && nextAdminUid) {
    await sendSystemMessageToChatRoom({
      roomId,
      user,
      text: `${nextAdminName} is now the group admin.`,
      metadata: {
        type: 'admin_promoted',
        userId: nextAdminUid,
        userEmail: nextAdminEmail,
        previousAdminUid: user.uid,
        at: Date.now(),
      },
    })
  }

  const updates = {
    memberUids: arrayRemove(user.uid),
    memberEmails: arrayRemove(userEmail),
    leftMemberUids: arrayUnion(user.uid),
    leftMemberEmails: arrayUnion(userEmail),
    memberEvents: arrayUnion(event),
    updatedAt: serverTimestamp(),
  }

  if (isLeavingAdmin) {
    updates.adminUid = nextAdminUid
    updates.adminEmail = nextAdminEmail
  }

  if (remainingMemberUids.length === 0) {
    updates.hiddenForUids = arrayUnion(user.uid)
  }

  await updateDoc(roomRef, updates)
}

export async function hideChatRoomForUser({ roomId, userId }) {
  if (!roomId || !userId) {
    return
  }

  const database = getDbInstance()
  await updateDoc(doc(database, 'chatRooms', roomId), {
    hiddenForUids: arrayUnion(userId),
    updatedAt: serverTimestamp(),
  })
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
  const room = await getRoomById(roomId)
  if (!(room.memberUids || []).includes(user.uid)) {
    throw new Error('You are no longer a member of this chat room.')
  }

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
  const roomSources = [
    {
      key: 'active',
      queryRef: query(collection(database, 'chatRooms'), where('memberUids', 'array-contains', userId)),
    },
    {
      key: 'removed',
      queryRef: query(collection(database, 'chatRooms'), where('removedMemberUids', 'array-contains', userId)),
    },
    {
      key: 'left',
      queryRef: query(collection(database, 'chatRooms'), where('leftMemberUids', 'array-contains', userId)),
    },
  ]
  const roomsBySource = Object.fromEntries(roomSources.map((source) => [source.key, {}]))

  function emitMergedRooms() {
    const roomsById = {}
    Object.values(roomsBySource).forEach((sourceRooms) => {
      Object.entries(sourceRooms).forEach(([roomId, room]) => {
        roomsById[roomId] = room
      })
    })

    onRooms(
      sortByCreatedAtDesc(
        Object.values(roomsById).filter((room) => !(room.hiddenForUids || []).includes(userId)),
      ),
    )
  }

  const unsubscribers = roomSources.map((source) =>
    onSnapshot(
      source.queryRef,
      (snapshot) => {
        roomsBySource[source.key] = Object.fromEntries(
          snapshot.docs.map((roomDoc) => [
            roomDoc.id,
            {
              id: roomDoc.id,
              ...roomDoc.data(),
            },
          ]),
        )
        emitMergedRooms()
      },
      (error) => {
        if (onError) {
          onError(error)
        }
      },
    ),
  )

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe())
  }
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
