import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore'
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

function normalizeAmount(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0
  }

  return Math.round(amount)
}

function normalizeTimeSlot(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (['morning', 'afternoon', 'evening'].includes(normalized)) {
    return normalized
  }
  return 'morning'
}

function normalizeDomain(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (
    ['food', 'travel', 'entry fee', 'stay', 'shopping', 'activity', 'other'].includes(normalized)
  ) {
    return normalized
  }
  return 'other'
}

function normalizeEntryType(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'borrowed') {
    return 'borrowed'
  }
  return 'expense'
}

export async function addExpenseEntry(userId, entryInput) {
  const database = getDbInstance()

  const entryType = normalizeEntryType(entryInput.entryType)
  const payload = {
    userId,
    amount: normalizeAmount(entryInput.amount),
    purpose: normalizeText(entryInput.purpose),
    date: normalizeText(entryInput.date),
    timeSlot: normalizeTimeSlot(entryInput.timeSlot),
    domain: normalizeDomain(entryInput.domain),
    entryType,
    borrowedFrom: entryType === 'borrowed' ? normalizeText(entryInput.borrowedFrom) : '',
    createdAt: serverTimestamp(),
  }

  if (!payload.amount) {
    throw new Error('Amount must be greater than 0.')
  }
  if (!payload.purpose) {
    throw new Error('Purpose is required.')
  }
  if (!payload.date) {
    throw new Error('Date is required.')
  }
  if (payload.entryType === 'borrowed' && !payload.borrowedFrom) {
    throw new Error('Please provide the fellow traveler name.')
  }

  const docRef = await addDoc(collection(database, 'expenses'), payload)
  return {
    id: docRef.id,
    ...payload,
  }
}

export async function listExpenseEntries(userId) {
  const database = getDbInstance()
  const expensesQuery = query(collection(database, 'expenses'), where('userId', '==', userId))
  const snapshot = await getDocs(expensesQuery)

  return snapshot.docs
    .map((expenseDoc) => ({
      id: expenseDoc.id,
      ...expenseDoc.data(),
    }))
    .sort((firstEntry, secondEntry) => {
      const firstTime = firstEntry.createdAt?.toMillis?.() ?? 0
      const secondTime = secondEntry.createdAt?.toMillis?.() ?? 0
      return secondTime - firstTime
    })
}
