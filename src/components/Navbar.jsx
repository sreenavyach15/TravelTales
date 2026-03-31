import { NavLink } from 'react-router-dom'
import { logoutUser } from '../services/authService'

const protectedLinks = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Create Trip', path: '/create-trip' },
  { label: 'Trip Details', path: '/trip' },
  { label: 'Expenses', path: '/expenses' },
  { label: 'Chat Room', path: '/chat' },
  { label: 'Travel Diary', path: '/diary' },
  { label: 'Photo Album', path: '/photos' },
  { label: 'Recommendations', path: '/recommendations' },
]

const publicLinks = [
  { label: 'Login', path: '/login' },
  { label: 'Signup', path: '/signup' },
]

function Navbar({ isAuthenticated, userEmail }) {
  const links = isAuthenticated ? protectedLinks : publicLinks

  const handleLogout = async () => {
    try {
      await logoutUser()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Travel Tales</h1>
          <div className="flex items-center gap-3">
            <p className="text-sm text-slate-500">Plan, share, and track every journey</p>
            {isAuthenticated && userEmail && (
              <span className="hidden rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 sm:inline">
                {userEmail}
              </span>
            )}
          </div>
        </div>
        <nav className="flex flex-wrap gap-2">
          {links.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          {isAuthenticated && (
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md bg-rose-100 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-200"
            >
              Logout
            </button>
          )}
        </nav>
      </div>
    </header>
  )
}

export default Navbar
