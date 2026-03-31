import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'

function getDbInstance() {
  if (!db) {
    throw new Error('Firebase Firestore is not configured. Add VITE_FIREBASE_* values first.')
  }

  return db
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function getDisplayNameFromEmail(email) {
  const normalizedEmail = normalizeEmail(email)
  const localPart = normalizedEmail.split('@')[0] || ''

  const label = localPart
    .replace(/[._-]+/g, ' ')
    .trim()
    .slice(0, 40)

  if (!label) {
    return 'Traveler'
  }

  return label
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function resolveDisplayName({ displayName, email }) {
  const normalizedDisplayName = String(displayName || '').trim()
  if (normalizedDisplayName) {
    return normalizedDisplayName
  }
  return getDisplayNameFromEmail(email)
}

function normalizeFoodPreference(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (['veg', 'non-veg', 'vegan'].includes(normalized)) {
    return normalized
  }

  return 'veg'
}

function normalizeDate(value) {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return ''
  }

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  return parsed.toISOString().split('T')[0]
}

export async function ensureUserProfile(authUser) {
  if (!authUser?.uid || !authUser?.email) {
    return
  }

  const database = getDbInstance()
  const userRef = doc(database, 'users', authUser.uid)
  const snapshot = await getDoc(userRef)
  const existingData = snapshot.exists() ? snapshot.data() : null
  const resolvedDisplayName = resolveDisplayName({
    displayName: existingData?.displayName || authUser.displayName,
    email: authUser.email,
  })

  const basePayload = {
    uid: authUser.uid,
    email: authUser.email,
    emailLower: normalizeEmail(authUser.email),
    displayName: resolvedDisplayName,
    dateOfBirth: normalizeDate(existingData?.dateOfBirth),
    foodPreference: normalizeFoodPreference(existingData?.foodPreference),
    lastSeenAt: serverTimestamp(),
  }

  if (snapshot.exists()) {
    await setDoc(userRef, basePayload, { merge: true })
    return
  }

  await setDoc(userRef, {
    ...basePayload,
    createdAt: serverTimestamp(),
  })
}

export async function getUserProfileByEmail(email) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) {
    return null
  }

  const database = getDbInstance()
  const usersQuery = query(collection(database, 'users'), where('emailLower', '==', normalizedEmail))
  const snapshot = await getDocs(usersQuery)

  if (snapshot.empty) {
    return null
  }

  const firstDoc = snapshot.docs[0]
  return {
    id: firstDoc.id,
    ...firstDoc.data(),
  }
}

export async function getUserProfileByUid(uid) {
  if (!uid) {
    return null
  }

  const database = getDbInstance()
  const userRef = doc(database, 'users', uid)
  const snapshot = await getDoc(userRef)

  if (!snapshot.exists()) {
    return null
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  }
}

export async function updateUserProfile(uid, updates) {
  if (!uid) {
    throw new Error('User id is required.')
  }

  const database = getDbInstance()
  const userRef = doc(database, 'users', uid)

  const payload = {
    displayName: resolveDisplayName({
      displayName: updates?.displayName,
      email: updates?.email || '',
    }),
    dateOfBirth: normalizeDate(updates?.dateOfBirth),
    foodPreference: normalizeFoodPreference(updates?.foodPreference),
    updatedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  }

  await setDoc(userRef, payload, { merge: true })
  return payload
}
