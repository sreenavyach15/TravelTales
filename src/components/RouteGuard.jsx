import { Navigate, Outlet, useLocation } from 'react-router-dom'

export function ProtectedRoute({ isAuthenticated }) {
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

export function PublicOnlyRoute({ isAuthenticated }) {
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
