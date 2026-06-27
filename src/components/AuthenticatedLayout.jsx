import { useEffect, useMemo, useState, useRef } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { changePassword, logoutUser } from '../services/authService'
import {
  countUnreadRooms,
  subscribeToPendingChatInvites,
  subscribeToUserChatRooms,
} from '../services/chatService'
import {
  ensureUpcomingTripReminderNotifications,
  markAllTripNotificationsAsRead,
  subscribeToTripNotifications,
} from '../services/tripNotificationService'
import { validatePassword } from '../services/authValidation'
import {
  getDisplayNameFromEmail,
  getUserProfileByUid,
  updateUserProfile,
} from '../services/userService'

const sidebarLinks = [
  { label: 'Home', path: '/dashboard' },
  { label: 'Create Trip', path: '/create-trip' },
  { label: 'Trip Details', path: '/trip' },
  { label: 'Trip Tracker', path: '/trip-tracker' },
  { label: 'Expense Tracker', path: '/expenses' },
  { label: 'Chat Room', path: '/chat' },
  { label: 'Travel Diary', path: '/diary' },
  { label: 'Photo Album', path: '/photos' },
  { label: 'Recommendations', path: '/recommendations' },
]

const defaultNotifications = [
  'Your trip checklist is ready.',
  'Your latest photo upload was successful.',
]

function getInitials(name) {
  const safeName = String(name || '').trim()
  if (!safeName) {
    return 'U'
  }

  return safeName.slice(0, 1).toUpperCase()
}

function calculateAge(dateOfBirth) {
  const dateValue = String(dateOfBirth || '').trim()
  if (!dateValue) {
    return ''
  }

  const birthDate = new Date(dateValue)
  if (Number.isNaN(birthDate.getTime())) {
    return ''
  }

  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDelta = today.getMonth() - birthDate.getMonth()
  const isBirthdayPending = monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())
  if (isBirthdayPending) {
    age -= 1
  }

  return age >= 0 ? age : ''
}

function AuthenticatedLayout({ userEmail, userUid }) {
  const navigate = useNavigate()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfilePanel, setShowProfilePanel] = useState(false)

  const profilePanelRef = useRef(null)
  const profileButtonRef = useRef(null)
  const notificationPanelRef = useRef(null)
  const notificationButtonRef = useRef(null)

  const [layoutStatus, setLayoutStatus] = useState('')
  const [layoutError, setLayoutError] = useState('')
  const [pendingInvites, setPendingInvites] = useState([])
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const [tripNotifications, setTripNotifications] = useState([])

  const [profileForm, setProfileForm] = useState({
    displayName: '',
    dateOfBirth: '',
    foodPreference: 'veg',
  })
  const [profileStatus, setProfileStatus] = useState('')
  const [profileError, setProfileError] = useState('')
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [profileSnapshot, setProfileSnapshot] = useState(null)

  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
  })
  const [passwordStatus, setPasswordStatus] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [showPasswordFields, setShowPasswordFields] = useState(false)

  const age = useMemo(() => calculateAge(profileForm.dateOfBirth), [profileForm.dateOfBirth])
  const unreadTripNotificationCount = tripNotifications.filter((item) => item.isRead !== true).length
  const notificationDotVisible =
    pendingInvites.length > 0 || unreadChatCount > 0 || unreadTripNotificationCount > 0
  const profileLabel = profileForm.displayName || getDisplayNameFromEmail(userEmail)

  useEffect(() => {
    setProfileForm((previous) => ({
      ...previous,
      displayName: previous.displayName || getDisplayNameFromEmail(userEmail),
    }))
  }, [userEmail])

  useEffect(() => {
    let isMounted = true

    async function loadProfile() {
      if (!userUid) {
        if (isMounted) {
          setProfileForm({
            displayName: getDisplayNameFromEmail(userEmail),
            dateOfBirth: '',
            foodPreference: 'veg',
          })
        }
        return
      }

      try {
        const profile = await getUserProfileByUid(userUid)
        if (!isMounted) {
          return
        }

        setProfileForm({
          displayName: profile?.displayName || getDisplayNameFromEmail(userEmail),
          dateOfBirth: profile?.dateOfBirth || '',
          foodPreference: profile?.foodPreference || 'veg',
        })
      } catch {
        if (isMounted) {
          setProfileForm((previous) => ({
            ...previous,
            displayName: previous.displayName || getDisplayNameFromEmail(userEmail),
          }))
        }
      }
    }

    loadProfile()
    return () => {
      isMounted = false
    }
  }, [userUid, userEmail])

  useEffect(() => {
    if (!userUid) {
      setPendingInvites([])
      setUnreadChatCount(0)
      return undefined
    }

    const unsubscribeInvites = subscribeToPendingChatInvites({
      userId: userUid,
      onInvites: (invites) => {
        setPendingInvites(invites)
      },
      onError: () => {
        setPendingInvites([])
      },
    })

    const unsubscribeRooms = subscribeToUserChatRooms({
      userId: userUid,
      onRooms: (rooms) => {
        setUnreadChatCount(countUnreadRooms(rooms, userUid))
      },
      onError: () => {
        setUnreadChatCount(0)
      },
    })

    const unsubscribeTripNotifications = subscribeToTripNotifications({
      userId: userUid,
      onNotifications: (notifications) => {
        setTripNotifications(notifications.slice(0, 10))
      },
      onError: () => {
        setTripNotifications([])
      },
    })

    ensureUpcomingTripReminderNotifications(userUid).catch(() => {
      // Reminder creation should never block the main layout.
    })

    return () => {
      unsubscribeInvites()
      unsubscribeRooms()
      unsubscribeTripNotifications()
    }
  }, [userUid])

  useEffect(() => {
    if (!showProfilePanel) return undefined

    function handleDocumentMouseDown(e) {
      if (!profilePanelRef.current || !profileButtonRef.current) return
      const target = e.target
      if (
        profilePanelRef.current.contains(target) ||
        profileButtonRef.current.contains(target)
      ) {
        return
      }
      setShowProfilePanel(false)
    }

    function handleEscapeKey(e) {
      if (e.key === 'Escape') {
        setShowProfilePanel(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)
    document.addEventListener('keydown', handleEscapeKey)
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown)
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [showProfilePanel])

  useEffect(() => {
    if (!showNotifications) return undefined

    function handleDocumentMouseDown(e) {
      if (!notificationPanelRef.current || !notificationButtonRef.current) return
      const target = e.target
      if (
        notificationPanelRef.current.contains(target) ||
        notificationButtonRef.current.contains(target)
      ) {
        return
      }
      setShowNotifications(false)
    }

    function handleEscapeKey(e) {
      if (e.key === 'Escape') {
        setShowNotifications(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)
    document.addEventListener('keydown', handleEscapeKey)
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown)
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [showNotifications])

  const handleLogout = async () => {
    setLayoutStatus('')
    setLayoutError('')
    try {
      await logoutUser()
      navigate('/', { replace: true })
    } catch (error) {
      setLayoutError(error.message)
    }
  }

  const handleSaveProfile = async (event) => {
    event.preventDefault()
    if (!userUid) {
      return
    }

    setProfileStatus('')
    setProfileError('')
    setIsSavingProfile(true)
    try {
      await updateUserProfile(userUid, {
        displayName: profileForm.displayName,
        dateOfBirth: profileForm.dateOfBirth,
        foodPreference: profileForm.foodPreference,
        email: userEmail,
      })
      setProfileStatus('Profile updated successfully.')
      setIsEditingProfile(false)
      setProfileSnapshot(null)
    } catch (error) {
      setProfileError(error.message)
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleStartEditProfile = () => {
    setProfileSnapshot(profileForm)
    setIsEditingProfile(true)
    setProfileStatus('')
    setProfileError('')
  }

  const handleCancelEditProfile = () => {
    if (profileSnapshot) {
      setProfileForm(profileSnapshot)
    }
    setIsEditingProfile(false)
    setProfileSnapshot(null)
    setProfileStatus('')
    setProfileError('')
  }

  const handleChangePassword = async (event) => {
    event.preventDefault()
    setPasswordStatus('')
    setPasswordError('')

    const newPassword = String(passwordForm.newPassword || '')
    const confirmPassword = String(passwordForm.confirmPassword || '')
    const validationError = validatePassword(newPassword)
    if (validationError) {
      setPasswordError(validationError)
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Password and confirm password must match.')
      return
    }

    setIsChangingPassword(true)
    try {
      await changePassword(newPassword)
      setPasswordStatus('Password changed successfully.')
      setPasswordForm({ newPassword: '', confirmPassword: '' })
      setShowPasswordFields(false)
    } catch (error) {
      setPasswordError(error.message)
    } finally {
      setIsChangingPassword(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="w-64 border-r border-slate-200 bg-white p-5">
        <h1 className="text-xl font-bold text-slate-900">Travel Tales</h1>
        <p className="mt-1 text-xs text-slate-500">Plan together. Travel better.</p>

        <nav className="mt-6 space-y-1">
          {sidebarLinks.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <span>{link.label}</span>
              {link.path === '/chat' && unreadChatCount > 0 && (
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              )}
            </NavLink>
          ))}
        </nav>

        {userEmail && <p className="mt-8 text-xs text-slate-500">Signed in as {userEmail}</p>}
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-6 py-4">
          <div className="relative flex items-center justify-end gap-3">
            <button
              type="button"
              ref={notificationButtonRef}
              onClick={async () => {
                setShowNotifications((previous) => !previous)
                setShowProfilePanel(false)
                if (!showNotifications && userUid) {
                  try {
                    await markAllTripNotificationsAsRead(userUid)
                  } catch {
                    // Keep panel interaction non-blocking.
                  }
                }
              }}
              className="relative inline-flex shrink-0 items-center justify-center bg-white p-0 text-2xl leading-none hover:bg-slate-100"
              style={{ width: 48, height: 48, borderRadius: '50%' }}
              aria-label="Notifications"
            >
              <span aria-hidden="true">🔔</span>
              {notificationDotVisible && (
                <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-rose-500" />
              )}
            </button>

            <button
              type="button"
              ref={profileButtonRef}
              onClick={() => {
                setShowProfilePanel((previous) => !previous)
                setShowNotifications(false)
              }}
              className="inline-flex shrink-0 items-center justify-center overflow-hidden bg-slate-900 p-0 text-base font-semibold leading-none text-white hover:bg-slate-800"
              style={{ width: 48, height: 48, borderRadius: '50%' }}
              aria-label="Profile"
            >
              {getInitials(profileLabel)}
            </button>

            {showNotifications && (
              <div ref={notificationPanelRef} className="absolute right-0 top-11 z-20 w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Notifications
                </p>
                <ul className="mt-2 space-y-2">
                  {tripNotifications.map((notification) => (
                    <li
                      key={notification.id}
                      className={`rounded-md p-2 text-sm text-slate-700 ${
                        notification.isRead ? 'bg-slate-50' : 'bg-blue-50'
                      }`}
                    >
                      <p>{notification.message}</p>
                      {notification.tripId && (
                        <Link
                          to={`/trip-tracker?tripId=${notification.tripId}`}
                          className="mt-1 inline-block text-xs font-semibold text-slate-900 hover:underline"
                        >
                          Open Trip Tracker
                        </Link>
                      )}
                    </li>
                  ))}

                  {unreadChatCount > 0 && (
                    <li className="rounded-md bg-rose-50 p-2 text-sm text-slate-700">
                      <p>You have unread messages in {unreadChatCount} chat room(s).</p>
                      <Link
                        to="/chat"
                        className="mt-1 inline-block text-xs font-semibold text-slate-900 hover:underline"
                      >
                        Open Chat Room
                      </Link>
                    </li>
                  )}

                  {pendingInvites.map((invite) => (
                    <li key={invite.id} className="rounded-md bg-amber-50 p-2 text-sm text-slate-700">
                      <p>
                        Invite to <span className="font-semibold">{invite.roomName || 'Trip Group'}</span>
                      </p>
                      <Link
                        to="/chat"
                        className="mt-1 inline-block text-xs font-semibold text-slate-900 hover:underline"
                      >
                        Open Chat Room
                      </Link>
                    </li>
                  ))}

                  {pendingInvites.length === 0 &&
                  unreadChatCount === 0 &&
                  tripNotifications.length === 0
                    ? defaultNotifications.map((note) => (
                        <li key={note} className="rounded-md bg-slate-50 p-2 text-sm text-slate-700">
                          {note}
                        </li>
                      ))
                    : null}
                </ul>
              </div>
            )}

            {showProfilePanel && (
              <div ref={profilePanelRef} className="absolute right-0 top-11 z-20 w-[28rem] rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
                <h3 className="text-base font-semibold text-slate-900">Profile</h3>
                <p className="mt-1 text-xs text-slate-500">Manage your account details and security.</p>

                <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={handleSaveProfile}>
                  <div className="sm:col-span-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900">Profile Details</h4>
                    {!isEditingProfile && (
                      <button
                        type="button"
                        onClick={handleStartEditProfile}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Edit Profile
                      </button>
                    )}
                  </div>

                  <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                    Name
                    <input
                      value={profileForm.displayName}
                      onChange={(event) =>
                        setProfileForm((previous) => ({
                          ...previous,
                          displayName: event.target.value,
                        }))
                      }
                      readOnly={!isEditingProfile}
                      className={`mt-1 w-full rounded-md border px-3 py-2 ${
                        isEditingProfile
                          ? 'border-slate-300 bg-white'
                          : 'border-slate-200 bg-slate-100 text-slate-700'
                      }`}
                    />
                  </label>

                  <label className="text-sm font-medium text-slate-700">
                    Date of Birth
                    <input
                      type="date"
                      value={profileForm.dateOfBirth}
                      onChange={(event) =>
                        setProfileForm((previous) => ({
                          ...previous,
                          dateOfBirth: event.target.value,
                        }))
                      }
                      disabled={!isEditingProfile}
                      className={`mt-1 w-full rounded-md border px-3 py-2 ${
                        isEditingProfile
                          ? 'border-slate-300 bg-white'
                          : 'border-slate-200 bg-slate-100 text-slate-700'
                      }`}
                    />
                  </label>

                  <label className="text-sm font-medium text-slate-700">
                    Age
                    <input
                      value={age}
                      readOnly
                      className="mt-1 w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2"
                    />
                  </label>

                  <div className="sm:col-span-2">
                    {isEditingProfile && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="submit"
                          disabled={isSavingProfile}
                          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                        >
                          {isSavingProfile ? 'Saving...' : 'Save Profile'}
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEditProfile}
                          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    {profileStatus && <p className="mt-2 text-sm text-emerald-700">{profileStatus}</p>}
                    {profileError && <p className="mt-2 text-sm text-rose-600">{profileError}</p>}
                  </div>
                </form>

                <form className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2" onSubmit={handleChangePassword}>
                  <div className="sm:col-span-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900">Change Password</h4>
                    {!showPasswordFields ? (
                      <button
                        type="button"
                        onClick={() => {
                          setShowPasswordFields(true)
                          setPasswordStatus('')
                          setPasswordError('')
                        }}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Change Password
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setShowPasswordFields(false)
                          setPasswordForm({ newPassword: '', confirmPassword: '' })
                          setPasswordStatus('')
                          setPasswordError('')
                        }}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  {showPasswordFields && (
                    <>
                      <label className="text-sm font-medium text-slate-700">
                        New Password
                        <input
                          type="password"
                          value={passwordForm.newPassword}
                          onChange={(event) =>
                            setPasswordForm((previous) => ({
                              ...previous,
                              newPassword: event.target.value,
                            }))
                          }
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                        />
                      </label>
                      <label className="text-sm font-medium text-slate-700">
                        Confirm Password
                        <input
                          type="password"
                          value={passwordForm.confirmPassword}
                          onChange={(event) =>
                            setPasswordForm((previous) => ({
                              ...previous,
                              confirmPassword: event.target.value,
                            }))
                          }
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                        />
                      </label>
                    </>
                  )}
                  <div className="sm:col-span-2">
                    {showPasswordFields && (
                      <button
                        type="submit"
                        disabled={isChangingPassword}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                      >
                        {isChangingPassword ? 'Updating...' : 'Update Password'}
                      </button>
                    )}
                    {passwordStatus && <p className="mt-2 text-sm text-emerald-700">{passwordStatus}</p>}
                    {passwordError && <p className="mt-2 text-sm text-rose-600">{passwordError}</p>}
                  </div>
                </form>

                <div className="mt-4 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-md bg-rose-100 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-200"
                  >
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>

          {layoutStatus && <p className="mt-2 text-right text-sm text-emerald-700">{layoutStatus}</p>}
          {layoutError && <p className="mt-2 text-right text-sm text-rose-600">{layoutError}</p>}
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AuthenticatedLayout
