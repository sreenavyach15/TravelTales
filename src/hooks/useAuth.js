import { onAuthStateChanged } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { auth } from '../firebase/config'
import { ensureUserProfile } from '../services/userService'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return undefined
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        ensureUserProfile(currentUser).catch(() => {
          // Non-blocking profile sync for existing sessions.
        })
      }
      setUser(currentUser)
      setLoading(false)
    })

    return unsubscribe
  }, [])

  return {
    user,
    loading,
    isAuthenticated: Boolean(user),
  }
}
