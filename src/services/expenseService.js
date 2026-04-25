import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase/config'

const CATEGORY_OPTIONS = ['food', 'travel', 'stay / rent', 'tickets', 'shopping', 'bills', 'other']
const TIME_SLOT_OPTIONS = ['morning', 'afternoon', 'evening']
const SPLIT_TYPES = ['equal', 'unequal', 'percentage']
const SETTLEMENT_STATUS = ['pending', 'completed']

function getDbInstance() {
  if (!db) {
    throw new Error('Firebase Firestore is not configured. Add VITE_FIREBASE_* values first.')
  }

  return db
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeName(value, fallback = 'Unknown') {
  const text = normalizeText(value)
  return text || fallback
}

function normalizeUid(value) {
  return normalizeText(value)
}

function normalizeUidList(value) {
  const items = Array.isArray(value) ? value : []
  return [...new Set(items.map((item) => normalizeUid(item)).filter(Boolean))]
}

function normalizeAmount(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0
  }

  return Number(amount.toFixed(2))
}

function normalizeDate(value) {
  const text = normalizeText(value)
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

function normalizeTimeSlot(value) {
  const normalized = normalizeText(value).toLowerCase()
  return TIME_SLOT_OPTIONS.includes(normalized) ? normalized : 'morning'
}

function normalizeCategory(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'stay' || normalized === 'rent') {
    return 'stay / rent'
  }
  if (normalized === 'entry fee' || normalized === 'entry fees') {
    return 'tickets'
  }
  return CATEGORY_OPTIONS.includes(normalized) ? normalized : 'other'
}

function normalizeSplitType(value) {
  const normalized = normalizeText(value).toLowerCase()
  return SPLIT_TYPES.includes(normalized) ? normalized : 'equal'
}

function normalizeSettlementStatus(value) {
  const normalized = normalizeText(value).toLowerCase()
  return SETTLEMENT_STATUS.includes(normalized) ? normalized : 'pending'
}

function normalizeParticipants(value, fallback) {
  const participants = Array.isArray(value)
    ? value
    : String(value || '')
        .split(/[\n,;]+/g)
        .map((entry) => entry.trim())
        .filter(Boolean)

  const unique = [...new Set(participants.map((entry) => normalizeName(entry)).filter(Boolean))]
  if (unique.length > 0) {
    return unique
  }

  return [normalizeName(fallback)]
}

function normalizeSplitBreakdown(value, participants, totalAmount) {
  const result = {}

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const participant of participants) {
      const amount = normalizeAmount(value[participant])
      if (amount > 0) {
        result[participant] = amount
      }
    }
  }

  if (Object.keys(result).length === participants.length) {
    return result
  }

  const count = Math.max(1, participants.length)
  const base = Number((totalAmount / count).toFixed(2))
  let allocated = 0
  participants.forEach((participant, index) => {
    const amount = index === count - 1 ? Number((totalAmount - allocated).toFixed(2)) : base
    result[participant] = amount
    allocated += amount
  })

  return result
}

function normalizeSplitBreakdownByUid(value, participantUids, totalAmount) {
  const result = {}

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const uid of participantUids) {
      const amount = normalizeAmount(value[uid])
      if (amount > 0) {
        result[uid] = amount
      }
    }
  }

  if (Object.keys(result).length === participantUids.length && participantUids.length > 0) {
    return result
  }

  const count = Math.max(1, participantUids.length)
  const base = Number((totalAmount / count).toFixed(2))
  let allocated = 0
  participantUids.forEach((uid, index) => {
    const amount = index === count - 1 ? Number((totalAmount - allocated).toFixed(2)) : base
    result[uid] = amount
    allocated += amount
  })

  return result
}

function normalizePurpose(value, fallbackCategory) {
  const text = normalizeText(value)
  return text || `Expense - ${normalizeCategory(fallbackCategory)}`
}

function normalizeEntry(entry) {
  const amount = normalizeAmount(entry?.amount)
  const payer = normalizeName(entry?.payer || entry?.paidBy || '')
  const participants = normalizeParticipants(entry?.participants, payer)
  const participantUids = normalizeUidList(entry?.participantUids)
  const tripMemberUids = normalizeUidList(entry?.tripMemberUids)
  const splitBreakdown = normalizeSplitBreakdown(entry?.splitBreakdown, participants, amount)
  const splitBreakdownByUid = normalizeSplitBreakdownByUid(
    entry?.splitBreakdownByUid,
    participantUids,
    amount,
  )

  return {
    userId: normalizeUid(entry?.userId),
    tripId: normalizeText(entry?.tripId),
    tripMemberUids,
    payerUid: normalizeUid(entry?.payerUid || entry?.userId),
    amount,
    purpose: normalizePurpose(entry?.purpose, entry?.category || entry?.domain),
    date: normalizeDate(entry?.date),
    timeSlot: normalizeTimeSlot(entry?.timeSlot),
    category: normalizeCategory(entry?.category || entry?.domain),
    payer,
    participants,
    participantUids,
    splitType: normalizeSplitType(entry?.splitType),
    splitBreakdown,
    splitBreakdownByUid,
    settled: entry?.settled === true,
    settledAt: entry?.settledAt || null,
    settlementId: normalizeText(entry?.settlementId),
    notes: normalizeText(entry?.notes),
    createdAt: entry?.createdAt || null,
    updatedAt: entry?.updatedAt || null,
  }
}

function validateEntry(entry) {
  if (!entry.amount) {
    throw new Error('Amount must be greater than 0.')
  }
  if (!entry.date) {
    throw new Error('Date is required.')
  }
  if (!entry.payer) {
    throw new Error('Payer is required.')
  }
  if (!entry.participants.length) {
    throw new Error('Select at least one participant.')
  }

  const splitTotalByName = Object.values(entry.splitBreakdown || {}).reduce(
    (sum, value) => sum + Number(value || 0),
    0,
  )
  const splitTotalByUid = Object.values(entry.splitBreakdownByUid || {}).reduce(
    (sum, value) => sum + Number(value || 0),
    0,
  )
  const splitTotal = splitTotalByUid > 0 ? splitTotalByUid : splitTotalByName
  if (Math.abs(splitTotal - entry.amount) > 0.01) {
    throw new Error('Split breakdown must match total amount.')
  }
}

export async function addExpenseEntry(userId, entryInput) {
  const database = getDbInstance()

  const normalized = normalizeEntry({ ...entryInput, userId })
  const payload = {
    ...normalized,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  validateEntry(payload)

  const docRef = await addDoc(collection(database, 'expenses'), payload)
  return {
    id: docRef.id,
    ...payload,
  }
}

export async function addTripExpenseEntry({
  userId,
  tripId,
  tripMemberUids,
  payerUid,
  payer,
  amount,
  purpose,
  notes,
  participants,
  participantUids,
  splitBreakdown,
  splitBreakdownByUid,
}) {
  return addExpenseEntry(userId, {
    tripId,
    tripMemberUids,
    payerUid,
    payer,
    amount,
    purpose,
    notes,
    participants,
    participantUids,
    splitType: 'equal',
    splitBreakdown,
    splitBreakdownByUid,
    date: new Date().toISOString().slice(0, 10),
    timeSlot: 'morning',
    category: 'other',
    settled: false,
  })
}

export async function addTripExpenseEntryDetailed({
  userId,
  tripId,
  tripMemberUids,
  payerUid,
  payer,
  amount,
  purpose,
  notes,
  date,
  category,
  participants,
  participantUids,
  splitType,
  splitBreakdown,
  splitBreakdownByUid,
}) {
  return addExpenseEntry(userId, {
    tripId,
    tripMemberUids,
    payerUid,
    payer,
    amount,
    purpose,
    notes,
    participants,
    participantUids,
    splitType: splitType || 'equal',
    splitBreakdown,
    splitBreakdownByUid,
    date: normalizeDate(date) || new Date().toISOString().slice(0, 10),
    timeSlot: 'morning',
    category: normalizeCategory(category),
    settled: false,
  })
}

export async function listExpenseEntries(userId) {
  const database = getDbInstance()
  const expensesQuery = query(collection(database, 'expenses'), where('userId', '==', userId))
  const snapshot = await getDocs(expensesQuery)

  return snapshot.docs
    .map((expenseDoc) => ({
      id: expenseDoc.id,
      ...normalizeEntry(expenseDoc.data()),
    }))
    .sort((firstEntry, secondEntry) => {
      const firstTime = firstEntry.createdAt?.toMillis?.() ?? 0
      const secondTime = secondEntry.createdAt?.toMillis?.() ?? 0
      return secondTime - firstTime
    })
}

export async function listTripExpenseEntries(tripId) {
  const normalizedTripId = normalizeText(tripId)
  if (!normalizedTripId) {
    return []
  }

  const database = getDbInstance()
  const expensesQuery = query(collection(database, 'expenses'), where('tripId', '==', normalizedTripId))
  const snapshot = await getDocs(expensesQuery)

  return snapshot.docs
    .map((expenseDoc) => ({
      id: expenseDoc.id,
      ...normalizeEntry(expenseDoc.data()),
    }))
    .sort((firstEntry, secondEntry) => {
      const firstTime = firstEntry.createdAt?.toMillis?.() ?? 0
      const secondTime = secondEntry.createdAt?.toMillis?.() ?? 0
      return secondTime - firstTime
    })
}

export async function listTripExpenseSettlements(tripId) {
  const normalizedTripId = normalizeText(tripId)
  if (!normalizedTripId) {
    return []
  }

  const database = getDbInstance()
  const settlementsQuery = query(
    collection(database, 'expenseSettlements'),
    where('tripId', '==', normalizedTripId),
  )
  const snapshot = await getDocs(settlementsQuery)

  return snapshot.docs
    .map((settlementDoc) => ({
      id: settlementDoc.id,
      ...settlementDoc.data(),
    }))
    .sort((firstEntry, secondEntry) => {
      const firstTime = firstEntry.createdAt?.toMillis?.() ?? 0
      const secondTime = secondEntry.createdAt?.toMillis?.() ?? 0
      return secondTime - firstTime
    })
}

export async function recordTripSettlementPayment({
  userId,
  tripId,
  tripMemberUids,
  fromUid,
  toUid,
  amount,
  note,
  status = 'completed',
  source = 'manual',
}) {
  if (!userId) {
    throw new Error('User id is required.')
  }

  const normalizedAmount = normalizeAmount(amount)
  if (!normalizedAmount) {
    throw new Error('Settlement amount must be greater than 0.')
  }

  const normalizedFromUid = normalizeUid(fromUid)
  const normalizedToUid = normalizeUid(toUid)
  if (!normalizedFromUid || !normalizedToUid || normalizedFromUid === normalizedToUid) {
    throw new Error('Choose valid payer and receiver for settlement.')
  }

  const normalizedStatus = normalizeSettlementStatus(status)
  const database = getDbInstance()
  const now = serverTimestamp()

  const payload = {
    userId: normalizeUid(userId),
    tripId: normalizeText(tripId),
    tripMemberUids: normalizeUidList(tripMemberUids),
    type: 'payment',
    fromUid: normalizedFromUid,
    toUid: normalizedToUid,
    amount: normalizedAmount,
    note: normalizeText(note),
    source: normalizeText(source) || 'manual',
    status: normalizedStatus,
    createdAt: now,
    updatedAt: now,
    completedAt: normalizedStatus === 'completed' ? now : null,
  }

  const docRef = await addDoc(collection(database, 'expenseSettlements'), payload)
  return {
    id: docRef.id,
    ...payload,
  }
}

export async function markSettlementPaymentCompleted({ settlementId }) {
  const normalizedId = normalizeText(settlementId)
  if (!normalizedId) {
    throw new Error('Settlement id is required.')
  }

  const database = getDbInstance()
  const settlementRef = doc(database, 'expenseSettlements', normalizedId)
  const now = serverTimestamp()
  await updateDoc(settlementRef, {
    status: 'completed',
    completedAt: now,
    updatedAt: now,
  })
}

export async function settleExpenseEntries({ userId, entryIds, transactions, tripId, tripMemberUids }) {
  if (!userId) {
    throw new Error('User id is required.')
  }

  const normalizedEntryIds = [...new Set((entryIds || []).map((entryId) => normalizeText(entryId)).filter(Boolean))]
  if (normalizedEntryIds.length === 0) {
    throw new Error('No unsettled expenses selected.')
  }

  const database = getDbInstance()
  const settlementRef = doc(collection(database, 'expenseSettlements'))
  const settledAt = serverTimestamp()
  const batch = writeBatch(database)

  batch.set(settlementRef, {
    userId,
    tripId: normalizeText(tripId),
    tripMemberUids: normalizeUidList(tripMemberUids),
    entryIds: normalizedEntryIds,
    transactions: Array.isArray(transactions)
      ? transactions.map((transaction) => ({
          from: normalizeName(transaction?.from),
          to: normalizeName(transaction?.to),
          amount: normalizeAmount(transaction?.amount),
        }))
      : [],
    settledAt,
    createdAt: settledAt,
  })

  normalizedEntryIds.forEach((entryId) => {
    const entryRef = doc(database, 'expenses', entryId)
    batch.update(entryRef, {
      settled: true,
      settledAt,
      settlementId: settlementRef.id,
      updatedAt: settledAt,
    })
  })

  await batch.commit()
  return settlementRef.id
}

export async function markExpenseEntryUnsettled(entryId) {
  const normalizedEntryId = normalizeText(entryId)
  if (!normalizedEntryId) {
    throw new Error('Entry id is required.')
  }

  const database = getDbInstance()
  const entryRef = doc(database, 'expenses', normalizedEntryId)
  await updateDoc(entryRef, {
    settled: false,
    settledAt: null,
    settlementId: '',
    updatedAt: serverTimestamp(),
  })
}

export { CATEGORY_OPTIONS, SPLIT_TYPES, SETTLEMENT_STATUS, TIME_SLOT_OPTIONS }
