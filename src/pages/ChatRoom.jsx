import { useEffect, useMemo, useState } from 'react'
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
  sendMessageToChatRoom,
  subscribeToChatRoomMessages,
} from '../services/chatService'
import { getTripById } from '../services/tripService'
import { normalizeEmail, resolveDisplayName } from '../services/userService'

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

  const [groupName, setGroupName] = useState('')
  const [initialInviteEmails, setInitialInviteEmails] = useState('')
  const [memberInviteEmails, setMemberInviteEmails] = useState('')
  const [newMessage, setNewMessage] = useState('')

  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [isInvitingMembers, setIsInvitingMembers] = useState(false)
  const [joiningInviteId, setJoiningInviteId] = useState('')
  const [isSending, setIsSending] = useState(false)

  const activeRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) || null,
    [rooms, activeRoomId],
  )

  const isTripOwner = trip?.userId === user?.uid
  const isActiveRoomAdmin = activeRoom?.adminUid === user?.uid
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
      fetchedTripRoom = await getChatRoomByTripId(tripId)
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
    if (!activeRoomId) {
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
  }, [activeRoomId])

  useEffect(() => {
    if (!activeRoomId || !user?.uid) {
      return
    }

    markChatRoomAsRead({ roomId: activeRoomId, userId: user.uid }).catch(() => {
      // Non-blocking best effort; unread indicator can self-heal on next open.
    })
  }, [activeRoomId, messages.length, user?.uid])

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
    if (!activeRoomId || !user?.uid) {
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
      })
      setNewMessage('')
    } catch (sendError) {
      setError(sendError.message)
    } finally {
      setIsSending(false)
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
                    {isActiveRoomAdmin && (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                        Room Admin
                      </span>
                    )}
                  </div>

                  {isActiveRoomAdmin && (
                    <form
                      className="rounded-md border border-slate-200 bg-slate-50 p-3"
                      onSubmit={handleInviteMembers}
                    >
                      <label className="text-sm font-medium text-slate-700">
                        Invite More Members (Email IDs)
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

                  <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4">
                    {messages.length === 0 ? (
                      <p className="text-sm text-slate-600">No messages yet. Start the conversation.</p>
                    ) : (
                      messages.map((message) => {
                        const isSelf = normalizeEmail(message.authorEmail) === normalizeEmail(user?.email)
                        const authorName = resolveDisplayName({
                          displayName: message.authorName,
                          email: message.authorEmail,
                        })
                        return (
                          <div
                            key={message.id}
                            className={`rounded-md p-3 shadow-sm ${
                              isSelf ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'
                            }`}
                          >
                            <p className={`text-xs font-semibold uppercase tracking-wide ${isSelf ? 'text-slate-200' : 'text-slate-500'}`}>
                              {authorName}
                            </p>
                            <p className="mt-1 text-sm">{message.text}</p>
                          </div>
                        )
                      })
                    )}
                  </div>

                  <form className="flex gap-2" onSubmit={handleSendMessage}>
                    <input
                      value={newMessage}
                      onChange={(event) => setNewMessage(event.target.value)}
                      placeholder="Type your message"
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2"
                    />
                    <button
                      type="submit"
                      disabled={isSending}
                      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {isSending ? 'Sending...' : 'Send'}
                    </button>
                  </form>
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
