import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageContainer from '../components/PageContainer'
import { useAuth } from '../hooks/useAuth'
import {
  acceptChatInvite,
  createChatRoomForTrip,
  getChatRoomByTripId,
  inviteMembersToChatRoom,
  listPendingChatInvitesForUser,
  listUserChatRooms,
  markChatRoomAsRead,
  hideChatRoomForUser,
  leaveChatRoom,
  removeChatRoomMember,
  CHAT_FILE_SIZE_LIMIT_MB,
  sendMessageToChatRoom,
  subscribeToChatRoomMessages,
  subscribeToUserChatRooms,
} from '../services/chatService'
import { getTripById } from '../services/tripService'
import { getUserProfileByUid, normalizeEmail, resolveDisplayName } from '../services/userService'

function getInviteMessage(prefix, result) {
  const parts = [`${prefix}: ${result.invitedUsers.length} invite(s) sent.`]

  if (result.notFoundEmails.length > 0) {
    parts.push(`No account found for: ${result.notFoundEmails.join(', ')}.`)
  }
  if (result.invalidEmails.length > 0) {
    parts.push(`Invalid email format: ${result.invalidEmails.join(', ')}.`)
  }

  return parts.join(' ')
}

const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi

function normalizeHyperlink(urlCandidate) {
  const url = String(urlCandidate || '').trim()
  if (!url) return ''
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

function renderTextWithLinks(text, isSelf) {
  const rawText = String(text || '')
  if (!rawText) {
    return null
  }

  const chunks = []
  let lastIndex = 0

  for (const match of rawText.matchAll(URL_PATTERN)) {
    const matchText = match[0]
    const matchIndex = match.index ?? 0

    if (matchIndex > lastIndex) {
      chunks.push(rawText.slice(lastIndex, matchIndex))
    }

    const href = normalizeHyperlink(matchText)
    chunks.push(
      <a
        key={`${matchIndex}_${matchText}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`underline underline-offset-2 ${isSelf ? 'text-cyan-100' : 'text-sky-700'}`}
      >
        {matchText}
      </a>,
    )
    lastIndex = matchIndex + matchText.length
  }

  if (lastIndex < rawText.length) {
    chunks.push(rawText.slice(lastIndex))
  }

  return chunks
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0)
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${size} B`
}

function formatMessageTime(value) {
  const date = value?.toDate?.() || null
  if (!date) {
    return ''
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ChatRoom() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const tripId = searchParams.get('tripId')

  const [trip, setTrip] = useState(null)
  const [tripRoom, setTripRoom] = useState(null)
  const [rooms, setRooms] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [activeRoomId, setActiveRoomId] = useState('')
  const [messages, setMessages] = useState([])
  const [showMembers, setShowMembers] = useState(false)
  const [showInvitePanel, setShowInvitePanel] = useState(false)
  const [roomMembers, setRoomMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)

  const [groupName, setGroupName] = useState('')
  const [initialInviteEmails, setInitialInviteEmails] = useState('')
  const [memberInviteEmails, setMemberInviteEmails] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [senderDisplayName, setSenderDisplayName] = useState('')

  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [isInvitingMembers, setIsInvitingMembers] = useState(false)
  const [joiningInviteId, setJoiningInviteId] = useState('')
  const [removingMemberUid, setRemovingMemberUid] = useState('')
  const [isLeavingRoom, setIsLeavingRoom] = useState(false)
  const [isHidingRoom, setIsHidingRoom] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)

  const activeRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) || null,
    [rooms, activeRoomId],
  )

  const isTripOwner = trip?.userId === user?.uid
  const isActiveRoomAdmin = activeRoom?.adminUid === user?.uid
  const isActiveRoomMember = Boolean(activeRoom?.memberUids?.includes(user?.uid))
  const wasRemovedFromActiveRoom = Boolean(activeRoom?.removedMemberUids?.includes(user?.uid))
  const leftActiveRoom = Boolean(activeRoom?.leftMemberUids?.includes(user?.uid))
  const canUseActiveRoom = Boolean(activeRoom && isActiveRoomMember)
  const pendingInviteForTrip = pendingInvites.find((invite) => invite.roomId === tripRoom?.id) || null

  async function loadChatData(preferredRoomId = '') {
    if (!user?.uid) {
      setRooms([])
      setPendingInvites([])
      setTrip(null)
      setTripRoom(null)
      setActiveRoomId('')
      setMessages([])
      setLoading(false)
      return
    }

    setError('')
    const [joinedRooms, invites] = await Promise.all([
      listUserChatRooms(user.uid),
      listPendingChatInvitesForUser(user.uid),
    ])

    let fetchedTrip = null
    let fetchedTripRoom = null

    if (tripId) {
      fetchedTrip = await getTripById(tripId)
      if (!fetchedTrip) {
        throw new Error('Trip not found.')
      }
      fetchedTripRoom = await getChatRoomByTripId(tripId, user.uid)
    }

    setRooms(joinedRooms)
    setPendingInvites(invites)
    setTrip(fetchedTrip)
    setTripRoom(fetchedTripRoom)

    if (fetchedTrip?.destination) {
      setGroupName((current) => current || `${fetchedTrip.destination} Travellers`)
    }

    const roomIds = new Set(joinedRooms.map((room) => room.id))
    const candidateRoomId =
      [preferredRoomId, activeRoomId, fetchedTripRoom?.id, joinedRooms[0]?.id].find(
        (roomId) => roomId && roomIds.has(roomId),
      ) || ''

    setActiveRoomId(candidateRoomId)
  }

  useEffect(() => {
    let isMounted = true

    async function initialize() {
      setLoading(true)
      try {
        await loadChatData()
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    initialize()
    return () => {
      isMounted = false
    }
  }, [tripId, user?.uid])

  useEffect(() => {
    if (!user?.uid) {
      return undefined
    }

    return subscribeToUserChatRooms({
      userId: user.uid,
      onRooms: (syncedRooms) => {
        setRooms(syncedRooms)
        setActiveRoomId((currentRoomId) => {
          if (syncedRooms.some((room) => room.id === currentRoomId)) {
            return currentRoomId
          }
          return syncedRooms[0]?.id || ''
        })
      },
      onError: (snapshotError) => {
        setError(snapshotError.message)
      },
    })
  }, [user?.uid])

  useEffect(() => {
    if (!activeRoomId || !canUseActiveRoom) {
      setMessages([])
      return undefined
    }

    return subscribeToChatRoomMessages({
      roomId: activeRoomId,
      onMessages: setMessages,
      onError: (snapshotError) => {
        setError(snapshotError.message)
      },
    })
  }, [activeRoomId, canUseActiveRoom])

  useEffect(() => {
    if (!activeRoomId || !user?.uid || !canUseActiveRoom) {
      return
    }

    markChatRoomAsRead({ roomId: activeRoomId, userId: user.uid }).catch(() => {
      // Non-blocking best effort; unread indicator can self-heal on next open.
    })
  }, [activeRoomId, canUseActiveRoom, messages.length, user?.uid])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, activeRoomId])

  useEffect(() => {
    let isMounted = true
    const fallbackName = resolveDisplayName({
      displayName: user?.displayName,
      email: user?.email,
    })

    if (!user?.uid) {
      setSenderDisplayName('')
      return () => {
        isMounted = false
      }
    }

    setSenderDisplayName(fallbackName)

    getUserProfileByUid(user.uid)
      .then((profile) => {
        if (!isMounted) {
          return
        }
        setSenderDisplayName(
          resolveDisplayName({
            displayName: profile?.displayName || user?.displayName,
            email: user?.email,
          }),
        )
      })
      .catch(() => {
        if (isMounted) {
          setSenderDisplayName(fallbackName)
        }
      })

    return () => {
      isMounted = false
    }
  }, [user?.uid, user?.displayName, user?.email])

  useEffect(() => {
    setShowInvitePanel(false)
    setMemberInviteEmails('')
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [activeRoomId])

  useEffect(() => {
    let isMounted = true

    async function loadRoomMembers() {
      if (!showMembers || !activeRoom) {
        if (isMounted) {
          setRoomMembers([])
          setMembersLoading(false)
        }
        return
      }

      const memberUids = [...new Set(activeRoom.memberUids || [])]
      const memberEmails = Array.isArray(activeRoom.memberEmails) ? activeRoom.memberEmails : []
      const adminUid = String(activeRoom.adminUid || '').trim()
      const adminEmail = normalizeEmail(activeRoom.adminEmail)

      setMembersLoading(true)
      try {
        const profiles = await Promise.all(memberUids.map((uid) => getUserProfileByUid(uid)))
        if (!isMounted) {
          return
        }

        const profileByUid = Object.fromEntries(
          profiles
            .filter((profile) => profile?.uid)
            .map((profile) => [profile.uid, profile]),
        )

        const members = memberUids.map((uid, index) => {
          const profile = profileByUid[uid]
          const email = profile?.email || memberEmails[index] || ''
          return {
            uid,
            email,
            name: resolveDisplayName({
              displayName: profile?.displayName,
              email,
            }),
            isAdmin: (uid && uid === adminUid) || (!!email && normalizeEmail(email) === adminEmail),
          }
        })

        const coveredEmails = new Set(members.map((member) => normalizeEmail(member.email)))
        memberEmails
          .map((email) => normalizeEmail(email))
          .filter(Boolean)
          .forEach((email) => {
            if (!coveredEmails.has(email)) {
              members.push({
                uid: '',
                email,
                name: resolveDisplayName({ displayName: '', email }),
                isAdmin: normalizeEmail(email) === adminEmail,
              })
            }
          })

        setRoomMembers(members)
      } catch (loadMembersError) {
        if (isMounted) {
          setError(loadMembersError.message)
        }
      } finally {
        if (isMounted) {
          setMembersLoading(false)
        }
      }
    }

    loadRoomMembers()
    return () => {
      isMounted = false
    }
  }, [activeRoom, showMembers])

  const handleCreateRoom = async (event) => {
    event.preventDefault()
    if (!trip || !user) {
      return
    }

    setStatus('')
    setError('')
    setIsCreatingRoom(true)

    try {
      const result = await createChatRoomForTrip({
        trip,
        adminUser: user,
        groupName,
        inviteEmails: initialInviteEmails,
      })

      await loadChatData(result.room.id)
      setInitialInviteEmails('')
      setStatus(getInviteMessage('Chat room created', result))
    } catch (createError) {
      setError(createError.message)
    } finally {
      setIsCreatingRoom(false)
    }
  }

  const handleInviteMembers = async (event) => {
    event.preventDefault()
    if (!activeRoom || !isActiveRoomAdmin || !user) {
      return
    }

    setStatus('')
    setError('')
    setIsInvitingMembers(true)

    try {
      const result = await inviteMembersToChatRoom({
        room: activeRoom,
        adminUser: user,
        inviteEmails: memberInviteEmails,
      })
      setMemberInviteEmails('')
      setStatus(getInviteMessage('Invites processed', result))
    } catch (inviteError) {
      setError(inviteError.message)
    } finally {
      setIsInvitingMembers(false)
    }
  }

  const handleRemoveMember = async (member) => {
    if (!activeRoom || !user?.uid) {
      return
    }

    const confirmed = window.confirm(`Remove ${member.name || 'this member'} from this group?`)
    if (!confirmed) {
      return
    }

    setStatus('')
    setError('')
    setRemovingMemberUid(member.uid)
    try {
      await removeChatRoomMember({
        roomId: activeRoom.id,
        adminUser: user,
        member,
      })
      await loadChatData(activeRoom.id)
      setShowMembers(true)
      setStatus(`${member.name || 'Member'} removed from the group.`)
    } catch (removeError) {
      setError(removeError.message)
    } finally {
      setRemovingMemberUid('')
    }
  }

  const handleLeaveRoom = async () => {
    if (!activeRoom || !user?.uid) {
      return
    }

    const confirmed = window.confirm(`Leave "${activeRoom.roomName || 'this group'}"?`)
    if (!confirmed) {
      return
    }

    setStatus('')
    setError('')
    setIsLeavingRoom(true)
    try {
      await leaveChatRoom({ roomId: activeRoom.id, user })
      await loadChatData(activeRoom.id)
      setStatus('You left the group. You can remove it from your chat list now.')
    } catch (leaveError) {
      setError(leaveError.message)
    } finally {
      setIsLeavingRoom(false)
    }
  }

  const handleHideRoom = async () => {
    if (!activeRoom || !user?.uid) {
      return
    }

    setStatus('')
    setError('')
    setIsHidingRoom(true)
    try {
      await hideChatRoomForUser({ roomId: activeRoom.id, userId: user.uid })
      setRooms((previous) => previous.filter((room) => room.id !== activeRoom.id))
      setActiveRoomId('')
      setMessages([])
      setStatus('Chat removed from your list.')
    } catch (hideError) {
      setError(hideError.message)
    } finally {
      setIsHidingRoom(false)
    }
  }

  const handleJoinInvite = async (invite) => {
    if (!user?.uid) {
      return
    }

    setStatus('')
    setError('')
    setJoiningInviteId(invite.id)
    try {
      const roomId = await acceptChatInvite({ inviteId: invite.id, user })
      await loadChatData(roomId)
      setStatus(`Joined room "${invite.roomName || 'Trip Group'}".`)
    } catch (joinError) {
      setError(joinError.message)
    } finally {
      setJoiningInviteId('')
    }
  }

  const handleSendMessage = async (event) => {
    event.preventDefault()
    if (!activeRoomId || !user?.uid || !canUseActiveRoom) {
      return
    }

    setStatus('')
    setError('')
    setIsSending(true)
    try {
      await sendMessageToChatRoom({
        roomId: activeRoomId,
        user,
        text: newMessage,
        file: selectedFile,
        authorName: senderDisplayName,
      })
      setNewMessage('')
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (sendError) {
      setError(sendError.message)
    } finally {
      setIsSending(false)
    }
  }

  const handleAttachmentPick = (event) => {
    const file = event.target.files?.[0] || null
    if (!file) {
      setSelectedFile(null)
      return
    }
    if (file.size > CHAT_FILE_SIZE_LIMIT_MB * 1024 * 1024) {
      setError(`File exceeds ${CHAT_FILE_SIZE_LIMIT_MB} MB limit.`)
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }
    setError('')
    setSelectedFile(file)
  }

  const clearAttachment = () => {
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <PageContainer title="Chat Room" description="Create group rooms, invite travelers, and chat together.">
      <div className="space-y-6">
        {status && <p className="text-sm text-emerald-700">{status}</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {loading && <p className="text-sm text-slate-600">Loading chat data...</p>}

        {!loading && pendingInvites.length > 0 && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h3 className="text-base font-semibold text-amber-900">Pending Invitations</h3>
            <p className="mt-1 text-sm text-amber-800">You have room invites waiting for approval.</p>
            <div className="mt-3 space-y-2">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-white p-3"
                >
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold">{invite.roomName || 'Trip Group'}</span> invite from{' '}
                    {invite.inviterEmail || 'trip admin'}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleJoinInvite(invite)}
                    disabled={joiningInviteId === invite.id}
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {joiningInviteId === invite.id ? 'Joining...' : 'Join'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {!loading && trip && isTripOwner && !tripRoom && (
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-base font-semibold text-slate-900">Create Room For {trip.destination}</h3>
            <p className="mt-1 text-sm text-slate-600">
              Set a group name and invite co-travelers using their registered email IDs.
            </p>
            <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handleCreateRoom}>
              <label className="text-sm font-medium text-slate-700">
                Group Name
                <input
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  required
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                Add Member Emails
                <textarea
                  value={initialInviteEmails}
                  onChange={(event) => setInitialInviteEmails(event.target.value)}
                  rows={3}
                  placeholder="one@email.com, two@email.com"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={isCreatingRoom}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isCreatingRoom ? 'Creating...' : 'Create Chat Room'}
                </button>
              </div>
            </form>
          </section>
        )}

        {!loading && trip && tripRoom && !activeRoom && pendingInviteForTrip && (
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-700">
              A chat room already exists for this trip. Accept the invite above to join it.
            </p>
          </section>
        )}

        {!loading && (
          <div className="grid gap-4 lg:grid-cols-4">
            <aside className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 lg:col-span-1">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your Rooms</h3>
              {rooms.length === 0 ? (
                <p className="text-sm text-slate-600">No joined rooms yet.</p>
              ) : (
                rooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => setActiveRoomId(room.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                      activeRoomId === room.id
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <p className="font-semibold">{room.roomName || 'Trip Group'}</p>
                    <p className="mt-1 text-xs opacity-80">{room.tripDestination || 'Destination not set'}</p>
                    {room.removedMemberUids?.includes(user?.uid) && (
                      <p className="mt-1 text-xs text-rose-600">Removed from group</p>
                    )}
                    {room.leftMemberUids?.includes(user?.uid) && (
                      <p className="mt-1 text-xs text-amber-600">You left this group</p>
                    )}
                  </button>
                ))
              )}
            </aside>

            <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 lg:col-span-3">
              {activeRoom ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{activeRoom.roomName}</h3>
                      <p className="text-sm text-slate-600">
                        Trip: {activeRoom.tripDestination || 'Not set'} | Members:{' '}
                        {activeRoom.memberUids?.length || 1}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowMembers((current) => !current)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {showMembers ? 'Hide Members' : 'View Members'}
                      </button>
                      {isActiveRoomAdmin && (
                        <button
                          type="button"
                          onClick={() => setShowInvitePanel((current) => !current)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                          title="Invite Members"
                          aria-label="Invite Members"
                        >
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                            <path d="M4 20a6 6 0 0 1 12 0" />
                            <path d="M19 8v6" />
                            <path d="M16 11h6" />
                          </svg>
                        </button>
                      )}
                      {isActiveRoomMember && (
                        <button
                          type="button"
                          onClick={handleLeaveRoom}
                          disabled={isLeavingRoom}
                          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {isLeavingRoom ? 'Leaving...' : 'Leave Group'}
                        </button>
                      )}
                      {(wasRemovedFromActiveRoom || leftActiveRoom) && (
                        <button
                          type="button"
                          onClick={handleHideRoom}
                          disabled={isHidingRoom}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {isHidingRoom ? 'Removing...' : 'Remove From My List'}
                        </button>
                      )}
                    </div>
                  </div>

                  {wasRemovedFromActiveRoom && (
                    <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                      You have been removed from this group by admin.
                    </div>
                  )}

                  {leftActiveRoom && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      You left this group. You can remove it from your chat list.
                    </div>
                  )}

                  {isActiveRoomAdmin && showInvitePanel && (
                    <form
                      className="rounded-md border border-slate-200 bg-slate-50 p-3"
                      onSubmit={handleInviteMembers}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold text-slate-800">Invite Members</h4>
                        <button
                          type="button"
                          onClick={() => setShowInvitePanel(false)}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                        >
                          Close
                        </button>
                      </div>
                      <label className="mt-2 block text-sm font-medium text-slate-700">
                        Email IDs
                        <textarea
                          value={memberInviteEmails}
                          onChange={(event) => setMemberInviteEmails(event.target.value)}
                          rows={2}
                          placeholder="friend1@email.com, friend2@email.com"
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={isInvitingMembers}
                        className="mt-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-200"
                      >
                        {isInvitingMembers ? 'Sending Invites...' : 'Send Invites'}
                      </button>
                    </form>
                  )}

                  {showMembers && (
                    <section className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <h4 className="text-sm font-semibold text-slate-800">Room Members</h4>
                      {membersLoading ? (
                        <p className="mt-2 text-sm text-slate-600">Loading members...</p>
                      ) : roomMembers.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-600">No members found.</p>
                      ) : (
                        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                          {roomMembers.map((member) => (
                            <li
                              key={member.uid || member.email}
                              className={`rounded-md border px-3 py-2 ${
                                member.isAdmin
                                  ? 'border-emerald-300 bg-emerald-50'
                                  : 'border-slate-200 bg-white'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-slate-800">{member.name}</p>
                                {member.isAdmin && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                    Admin
                                  </span>
                                )}
                              </div>
                              {isActiveRoomAdmin && member.uid && member.uid !== user?.uid && !member.isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMember(member)}
                                  disabled={removingMemberUid === member.uid}
                                  className="mt-2 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                  {removingMemberUid === member.uid ? 'Removing...' : 'Remove Member'}
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  )}

                  {canUseActiveRoom && (
                    <div className="max-h-[460px] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      {messages.length === 0 ? (
                      <p className="px-2 py-6 text-center text-sm text-slate-600">
                        No messages yet. Start the conversation.
                      </p>
                      ) : (
                      <div className="space-y-2.5">
                        {messages.map((message) => {
                          const isSystemMessage = String(message.messageType || '').toLowerCase() === 'system'
                          const isSelf = normalizeEmail(message.authorEmail) === normalizeEmail(user?.email)
                          const authorName = resolveDisplayName({
                            displayName: message.authorName,
                            email: message.authorEmail,
                          })
                          const fileUrl = String(message.fileUrl || message.attachment?.url || '').trim()
                          const fileName = String(message.fileName || message.attachment?.name || 'Shared File').trim()
                          const fileSize = Number(message.fileSize || message.attachment?.size || 0)

                          if (isSystemMessage) {
                            const systemMessageTime = formatMessageTime(message.createdAt || message.timestamp)
                            return (
                              <div key={message.id} className="flex justify-center">
                                <div className="max-w-[86%] rounded-full bg-slate-200 px-3 py-1.5 text-xs text-slate-700">
                                  {message.text}
                                  {systemMessageTime && (
                                    <span className="ml-2 text-[11px] text-slate-500">{systemMessageTime}</span>
                                  )}
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div
                              key={message.id}
                              className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}
                            >
                              <div className="max-w-[82%]">
                                <p
                                  className={`mb-1 px-1 text-[11px] font-semibold tracking-wide ${
                                    isSelf
                                      ? 'text-right text-slate-500'
                                      : 'text-left text-slate-600'
                                  }`}
                                >
                                  {authorName}
                                </p>
                                <div
                                  className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                                    isSelf
                                      ? 'rounded-br-md bg-slate-900 text-white'
                                      : 'rounded-bl-md bg-white text-slate-800'
                                  }`}
                                >
                                  {message.text && (
                                    <p className="whitespace-pre-wrap break-words">
                                      {renderTextWithLinks(message.text, isSelf)}
                                    </p>
                                  )}
                                  {fileUrl && (
                                    <a
                                      href={fileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      download={fileName || true}
                                      className={`mt-2 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${
                                        isSelf
                                          ? 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700'
                                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                      }`}
                                    >
                                      <span className="truncate">
                                        {fileName || 'Shared File'} ({formatFileSize(fileSize)})
                                      </span>
                                      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide">
                                        Open
                                      </span>
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        <div ref={messagesEndRef} />
                      </div>
                      )}
                    </div>
                  )}

                  {canUseActiveRoom && (
                    <form className="space-y-2" onSubmit={handleSendMessage}>
                    <div className="flex gap-2">
                      <input
                        value={newMessage}
                        onChange={(event) => setNewMessage(event.target.value)}
                        placeholder="Type your message or paste a link"
                        className="flex-1 rounded-md border border-slate-300 px-3 py-2"
                      />
                      <button
                        type="submit"
                        disabled={isSending || (!newMessage.trim() && !selectedFile)}
                        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                      >
                        {isSending ? 'Sending...' : 'Send'}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
                        <span>Attach File</span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          onChange={handleAttachmentPick}
                        />
                      </label>
                      <p className="text-xs text-slate-500">Max file size: {CHAT_FILE_SIZE_LIMIT_MB} MB</p>
                      {selectedFile && (
                        <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                          <span className="max-w-[220px] truncate">{selectedFile.name}</span>
                          <span>({formatFileSize(selectedFile.size)})</span>
                          <button
                            type="button"
                            onClick={clearAttachment}
                            className="rounded px-1 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                            aria-label="Remove attachment"
                            title="Remove attachment"
                          >
                            x
                          </button>
                        </div>
                      )}
                    </div>
                    </form>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-600">
                  Select a joined room to chat, or create a room from Trip Details.
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </PageContainer>
  )
}

export default ChatRoom
