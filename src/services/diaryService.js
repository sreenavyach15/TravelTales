import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
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

function normalizeTitle(value) {
  const text = String(value || '')
    .trim()
    .slice(0, 120)
  return text || 'Untitled Entry'
}

function normalizeContentHtml(value) {
  return String(value || '').trim()
}

function normalizeEntryDate(value) {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    return ''
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return ''
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return ''
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function getPlainTextLength(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length
}

function validatePayload(payload) {
  if (!payload.userId) {
    throw new Error('You must be logged in to save diary entries.')
  }

  if (!payload.contentHtml || getPlainTextLength(payload.contentHtml) === 0) {
    throw new Error('Diary entry cannot be empty.')
  }
}

export async function listDiaryEntries(userId) {
  if (!userId) {
    return []
  }

  const database = getDbInstance()
  const entriesQuery = query(collection(database, 'travelDiaryEntries'), where('userId', '==', userId))
  const snapshot = await getDocs(entriesQuery)

  return snapshot.docs
    .map((entryDoc) => ({
      id: entryDoc.id,
      ...entryDoc.data(),
    }))
    .sort((firstEntry, secondEntry) => {
      const firstTime = firstEntry.updatedAt?.toMillis?.() ?? firstEntry.createdAt?.toMillis?.() ?? 0
      const secondTime = secondEntry.updatedAt?.toMillis?.() ?? secondEntry.createdAt?.toMillis?.() ?? 0
      return secondTime - firstTime
    })
}

export async function createDiaryEntry(userId, entryInput) {
  const database = getDbInstance()
  const payload = {
    userId,
    title: normalizeTitle(entryInput?.title),
    entryDate: normalizeEntryDate(entryInput?.entryDate),
    contentHtml: normalizeContentHtml(entryInput?.contentHtml),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  validatePayload(payload)

  const docRef = await addDoc(collection(database, 'travelDiaryEntries'), payload)
  return {
    id: docRef.id,
    ...payload,
  }
}

export async function updateDiaryEntry({ entryId, userId, title, entryDate, contentHtml }) {
  if (!entryId) {
    throw new Error('Diary entry id is required.')
  }

  const payload = {
    userId,
    title: normalizeTitle(title),
    entryDate: normalizeEntryDate(entryDate),
    contentHtml: normalizeContentHtml(contentHtml),
  }

  validatePayload(payload)

  const database = getDbInstance()
  const entryRef = doc(database, 'travelDiaryEntries', entryId)
  const snapshot = await getDoc(entryRef)
  if (!snapshot.exists()) {
    throw new Error('Diary entry not found.')
  }

  const existingEntry = snapshot.data()
  if (String(existingEntry.userId || '') !== String(userId || '')) {
    throw new Error('You are not allowed to edit this diary entry.')
  }

  await updateDoc(entryRef, {
    title: payload.title,
    entryDate: payload.entryDate,
    contentHtml: payload.contentHtml,
    updatedAt: serverTimestamp(),
  })

  return payload
}

export async function deleteDiaryEntry({ entryId, userId }) {
  if (!entryId) {
    throw new Error('Diary entry id is required.')
  }
  if (!userId) {
    throw new Error('You must be logged in to delete diary entries.')
  }

  const database = getDbInstance()
  const entryRef = doc(database, 'travelDiaryEntries', entryId)
  const snapshot = await getDoc(entryRef)

  if (!snapshot.exists()) {
    throw new Error('Diary entry not found.')
  }

  const existingEntry = snapshot.data()
  if (String(existingEntry.userId || '') !== String(userId || '')) {
    throw new Error('You are not allowed to delete this diary entry.')
  }

  await deleteDoc(entryRef)
}
