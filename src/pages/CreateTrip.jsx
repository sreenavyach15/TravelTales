import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageContainer from '../components/PageContainer'
import { useAuth } from '../hooks/useAuth'
import { createTrip } from '../services/tripService'

const INTEREST_OPTIONS = [
  { label: 'Beach', value: 'beach' },
  { label: 'Food', value: 'food' },
  { label: 'History', value: 'history' },
  { label: 'Party', value: 'party' },
  { label: 'Nature', value: 'nature' },
  { label: 'Spiritual', value: 'spiritual' },
]

const TRAVEL_STYLE_OPTIONS = [
  { label: 'Budget', value: 'budget' },
  { label: 'Balanced', value: 'balanced' },
  { label: 'Luxury', value: 'luxury' },
]

const TRANSPORT_OWNERSHIP_OPTIONS = [
  { label: 'Own Transport', value: 'own' },
  { label: 'Public Transport', value: 'public' },
]

const PACE_OPTIONS = [
  { label: 'Chill', value: 'chill' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Packed', value: 'packed' },
]

const FOOD_PREFERENCE_OPTIONS = [
  { label: 'Veg', value: 'veg' },
  { label: 'Non-veg', value: 'non-veg' },
  { label: 'Vegan', value: 'vegan' },
]

const CROWD_TOLERANCE_OPTIONS = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
]

const MAX_PLACES_OPTIONS = ['2', '3', '4', '5', '6', '7', '8']

function ChoiceChips({ options, selectedValue, onSelect }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = selectedValue === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              isSelected
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function CreateTrip() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [trip, setTrip] = useState({
    destination: '',
    startDate: '',
    endDate: '',
    arrivalTime: '',
    departureTime: '',
    passengerCount: '1',
    budgetPerHead: '',
    preferences: {
      travelStyle: 'balanced',
      transportOwnership: 'public',
      pace: 'moderate',
      interests: [],
      mustVisitPlaces: '',
      foodPreference: 'veg',
      crowdTolerance: 'medium',
      advancedOptions: {
        hotelBudgetPerNight: '',
        foodBudgetPerDay: '',
        activityBudgetPerDay: '',
      },
    },
    constraints: {
      maxTravelTimePerDay: '6',
      maxPlacesPerDay: '4',
      restTimeRequired: false,
      weatherSensitive: false,
    },
  })
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  const [showConstraints, setShowConstraints] = useState(false)
  const passengerCount = Math.max(1, Number(trip.passengerCount || 1))
  const budgetPerHead = Math.max(0, Number(trip.budgetPerHead || 0))
  const totalBudget = Math.round(passengerCount * budgetPerHead)

  const handleChange = (event) => {
    const { name, value } = event.target
    setTrip((previous) => ({ ...previous, [name]: value }))
  }

  const updatePreferences = (name, value) => {
    setTrip((previous) => ({
      ...previous,
      preferences: {
        ...previous.preferences,
        [name]: value,
      },
    }))
  }

  const updateAdvancedOptions = (name, value) => {
    setTrip((previous) => ({
      ...previous,
      preferences: {
        ...previous.preferences,
        advancedOptions: {
          ...previous.preferences.advancedOptions,
          [name]: value,
        },
      },
    }))
  }

  const updateConstraints = (name, value) => {
    setTrip((previous) => ({
      ...previous,
      constraints: {
        ...previous.constraints,
        [name]: value,
      },
    }))
  }

  const toggleInterest = (interestValue) => {
    setTrip((previous) => {
      const currentInterests = previous.preferences.interests
      const isSelected = currentInterests.includes(interestValue)
      return {
        ...previous,
        preferences: {
          ...previous.preferences,
          interests: isSelected
            ? currentInterests.filter((value) => value !== interestValue)
            : [...currentInterests, interestValue],
        },
      }
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage('')

    if (!user?.uid) {
      setMessage('Please log in to create a trip.')
      return
    }

    if (trip.startDate && trip.endDate && new Date(trip.endDate) < new Date(trip.startDate)) {
      setMessage('End date cannot be before start date.')
      return
    }
    if (
      trip.startDate &&
      trip.endDate &&
      trip.startDate === trip.endDate &&
      trip.arrivalTime &&
      trip.departureTime &&
      trip.departureTime <= trip.arrivalTime
    ) {
      setMessage('For a same-day trip, departure time should be after arrival time.')
      return
    }

    setIsSubmitting(true)
    try {
      await createTrip(user.uid, trip)
      setMessage(`Trip to ${trip.destination || 'your destination'} created.`)
      navigate('/trip')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PageContainer title="CreateTrip" description="Capture your travel plan details in one place.">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
        <label className="text-sm font-medium text-slate-700">
          Destination
          <input
            name="destination"
            value={trip.destination}
            onChange={handleChange}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Budget (Per Head)
          <input
            name="budgetPerHead"
            type="number"
            min="0"
            value={trip.budgetPerHead}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Start Date
          <input
            name="startDate"
            type="date"
            value={trip.startDate}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          End Date
          <input
            name="endDate"
            type="date"
            value={trip.endDate}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Arrival Time
          <input
            name="arrivalTime"
            type="time"
            value={trip.arrivalTime}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Departure Time
          <input
            name="departureTime"
            type="time"
            value={trip.departureTime}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Number of Passengers
          <input
            name="passengerCount"
            type="number"
            min="1"
            max="100"
            value={trip.passengerCount}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <p className="sm:col-span-2 -mt-2 text-xs text-slate-500">
          Planning budget considered: {Math.round(budgetPerHead)} per head x {passengerCount} passengers
          = {totalBudget} total.
        </p>
        <section className="sm:col-span-2 rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-slate-900">Travel Preferences</h3>
          <p className="mt-1 text-xs text-slate-500">
            Fine-tune style, pace, and interests so planning matches your expectations.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-slate-700">Travel Style</p>
              <ChoiceChips
                options={TRAVEL_STYLE_OPTIONS}
                selectedValue={trip.preferences.travelStyle}
                onSelect={(value) => updatePreferences('travelStyle', value)}
              />
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700">Transport Access</p>
              <ChoiceChips
                options={TRANSPORT_OWNERSHIP_OPTIONS}
                selectedValue={trip.preferences.transportOwnership}
                onSelect={(value) => updatePreferences('transportOwnership', value)}
              />
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700">Pace</p>
              <ChoiceChips
                options={PACE_OPTIONS}
                selectedValue={trip.preferences.pace}
                onSelect={(value) => updatePreferences('pace', value)}
              />
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700">Crowd Tolerance</p>
              <ChoiceChips
                options={CROWD_TOLERANCE_OPTIONS}
                selectedValue={trip.preferences.crowdTolerance}
                onSelect={(value) => updatePreferences('crowdTolerance', value)}
              />
            </div>
          </div>

          <div className="mt-4">
            <p className="text-sm font-medium text-slate-700">Interests</p>
            <p className="mt-1 text-xs text-slate-500">Select multiple interests.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((option) => {
                const isSelected = trip.preferences.interests.includes(option.value)
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleInterest(option.value)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                      isSelected
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-sm font-medium text-slate-700">Food Preference</p>
            <ChoiceChips
              options={FOOD_PREFERENCE_OPTIONS}
              selectedValue={trip.preferences.foodPreference}
              onSelect={(value) => updatePreferences('foodPreference', value)}
            />
          </div>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Must-Visit Places
            <textarea
              value={trip.preferences.mustVisitPlaces}
              onChange={(event) => updatePreferences('mustVisitPlaces', event.target.value)}
              rows={3}
              placeholder="Type places you definitely want to visit (comma or new line separated)."
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
        </section>

        <section className="sm:col-span-2 rounded-lg border border-slate-200 bg-white p-4">
          <button
            type="button"
            onClick={() => setShowAdvancedOptions((previous) => !previous)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-base font-semibold text-slate-900">Advanced Options</span>
            <span className="text-xs font-medium text-slate-600">
              {showAdvancedOptions ? 'Hide' : 'Show'}
            </span>
          </button>

          {showAdvancedOptions && (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="text-sm font-medium text-slate-700">
                Hotel Budget / Night
                <input
                  type="number"
                  min="0"
                  value={trip.preferences.advancedOptions.hotelBudgetPerNight}
                  onChange={(event) =>
                    updateAdvancedOptions('hotelBudgetPerNight', event.target.value)
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Food Budget / Day
                <input
                  type="number"
                  min="0"
                  value={trip.preferences.advancedOptions.foodBudgetPerDay}
                  onChange={(event) => updateAdvancedOptions('foodBudgetPerDay', event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Activity Budget / Day
                <input
                  type="number"
                  min="0"
                  value={trip.preferences.advancedOptions.activityBudgetPerDay}
                  onChange={(event) =>
                    updateAdvancedOptions('activityBudgetPerDay', event.target.value)
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
          )}
        </section>

        <section className="sm:col-span-2 rounded-lg border border-slate-200 bg-white p-4">
          <button
            type="button"
            onClick={() => setShowConstraints((previous) => !previous)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-base font-semibold text-slate-900">Trip Constraints</span>
            <span className="text-xs font-medium text-slate-600">
              {showConstraints ? 'Hide' : 'Show'}
            </span>
          </button>

          {showConstraints && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Max Travel Time / Day ({trip.constraints.maxTravelTimePerDay} hrs)
                <input
                  type="range"
                  min="2"
                  max="12"
                  step="1"
                  value={trip.constraints.maxTravelTimePerDay}
                  onChange={(event) =>
                    updateConstraints('maxTravelTimePerDay', event.target.value)
                  }
                  className="mt-2 w-full accent-slate-900"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Max Places / Day
                <select
                  value={trip.constraints.maxPlacesPerDay}
                  onChange={(event) => updateConstraints('maxPlacesPerDay', event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                >
                  {MAX_PLACES_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-700">Rest Time Required</p>
                  <p className="text-xs text-slate-500">Reserve downtime in daily planning.</p>
                </div>
                <button
                  type="button"
                  aria-pressed={trip.constraints.restTimeRequired}
                  onClick={() =>
                    updateConstraints('restTimeRequired', !trip.constraints.restTimeRequired)
                  }
                  className={`rounded-full px-4 py-1 text-xs font-semibold transition ${
                    trip.constraints.restTimeRequired
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {trip.constraints.restTimeRequired ? 'On' : 'Off'}
                </button>
              </div>

              <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-700">Weather Sensitive</p>
                  <p className="text-xs text-slate-500">Prefer indoor alternatives in bad weather.</p>
                </div>
                <button
                  type="button"
                  aria-pressed={trip.constraints.weatherSensitive}
                  onClick={() =>
                    updateConstraints('weatherSensitive', !trip.constraints.weatherSensitive)
                  }
                  className={`rounded-full px-4 py-1 text-xs font-semibold transition ${
                    trip.constraints.weatherSensitive
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {trip.constraints.weatherSensitive ? 'On' : 'Off'}
                </button>
              </div>
            </div>
          )}
        </section>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSubmitting ? 'Saving...' : 'Save Trip'}
          </button>
          {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}
        </div>
      </form>
    </PageContainer>
  )
}

export default CreateTrip
