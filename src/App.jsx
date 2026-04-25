import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AuthenticatedLayout from './components/AuthenticatedLayout'
import { ProtectedRoute, PublicOnlyRoute } from './components/RouteGuard'
import { useAuth } from './hooks/useAuth'
import AuthLanding from './pages/AuthLanding'
import ChatRoom from './pages/ChatRoom'
import CreateTrip from './pages/CreateTrip'
import Dashboard from './pages/Dashboard'
import ExpenseTracker from './pages/ExpenseTracker'
import Login from './pages/Login'
import PhotoAlbum from './pages/PhotoAlbum'
import Recommendations from './pages/Recommendations'
import Signup from './pages/Signup'
import TravelDiary from './pages/TravelDiary'
import TripTracker from './pages/TripTracker'
import TripDetails from './pages/TripDetails'

function App() {
  const { user, loading, isAuthenticated } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm font-medium text-slate-600">Checking authentication...</p>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <AuthLanding />}
        />
        <Route element={<PublicOnlyRoute isAuthenticated={isAuthenticated} />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
        </Route>
        <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} />}>
          <Route element={<AuthenticatedLayout userEmail={user?.email} userUid={user?.uid} />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/create-trip" element={<CreateTrip />} />
            <Route path="/trip" element={<TripDetails />} />
            <Route path="/trip-tracker" element={<TripTracker />} />
            <Route path="/expenses" element={<ExpenseTracker />} />
            <Route path="/chat" element={<ChatRoom />} />
            <Route path="/diary" element={<TravelDiary />} />
            <Route path="/photos" element={<PhotoAlbum />} />
            <Route path="/recommendations" element={<Recommendations />} />
          </Route>
        </Route>
        <Route
          path="*"
          element={<Navigate to={isAuthenticated ? '/dashboard' : '/'} replace />}
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
