const EXACT_NON_LOCATION_LABELS = new Set([
  'breakfast',
  'lunch',
  'dinner',
  'brunch',
  'snack',
  'snacks',
  'meal',
  'rest',
  'relax',
  'relaxation',
  'free time',
  'leisure',
  'leisure time',
  'hotel check-in',
  'hotel check in',
  'check-in',
  'check in',
  'hotel check-out',
  'hotel check out',
  'check-out',
  'check out',
  'hotel stay',
  'stay at hotel',
])

const LOCATION_HINT_KEYWORDS = [
  'beach',
  'temple',
  'museum',
  'fort',
  'palace',
  'landmark',
  'airport',
  'station',
  'city',
  'town',
  'village',
  'lake',
  'falls',
  'waterfall',
  'park',
  'garden',
  'sanctuary',
  'zoo',
  'island',
  'market',
  'bazaar',
  'mall',
  'street',
  'cafe',
  'restaurant',
  'monument',
  'point',
  'bridge',
  'harbor',
  'harbour',
  'church',
  'mosque',
  'gurdwara',
  'stupa',
  'ashram',
]

const SHOPPING_TERMS = ['shopping', 'shop around', 'souvenir']
const MEAL_TERMS = ['breakfast', 'lunch', 'dinner', 'brunch', 'snack', 'meal']

function normalizeLabel(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasAnyKeyword(value, keywords) {
  return keywords.some((keyword) => value.includes(keyword))
}

export function isNavigableLocation(place) {
  const rawLabel =
    typeof place === 'string'
      ? String(place || '').trim()
      : String(place?.name || '').trim()

  if (!rawLabel) {
    return false
  }

  const label = normalizeLabel(rawLabel)
  if (!label) {
    return false
  }

  if (EXACT_NON_LOCATION_LABELS.has(label)) {
    return false
  }

  const hasLocationHint = hasAnyKeyword(label, LOCATION_HINT_KEYWORDS)
  const hasMealTerm = hasAnyKeyword(label, MEAL_TERMS)
  const hasShoppingTerm = hasAnyKeyword(label, SHOPPING_TERMS)

  if (/\b(check[\s-]*in|check[\s-]*out)\b/.test(label)) {
    return false
  }

  if (/\b(rest|relax|relaxation|free time|leisure)\b/.test(label)) {
    return false
  }

  if (/\b(hotel|stay|accommodation)\b/.test(label) && !hasLocationHint) {
    return false
  }

  if (hasMealTerm && !hasLocationHint) {
    return false
  }

  if (hasShoppingTerm && !hasLocationHint) {
    return false
  }

  return true
}

export function openInGoogleMaps(place) {
  const query =
    typeof place === 'string'
      ? String(place || '').trim()
      : String(place?.name || '').trim()

  if (!query) {
    return
  }

  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}
