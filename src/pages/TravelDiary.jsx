import { useEffect, useMemo, useRef, useState } from 'react'
import PageContainer from '../components/PageContainer'
import { useAuth } from '../hooks/useAuth'
import {
  createDiaryEntry,
  deleteDiaryEntry,
  listDiaryEntries,
  updateDiaryEntry,
} from '../services/diaryService'

const ALLOWED_TAGS = new Set([
  'P',
  'BR',
  'DIV',
  'STRONG',
  'B',
  'EM',
  'I',
  'U',
  'UL',
  'OL',
  'LI',
  'H2',
  'H3',
  'BLOCKQUOTE',
  'A',
])

function sanitizeHtml(html) {
  const parser = new DOMParser()
  const documentNode = parser.parseFromString(String(html || ''), 'text/html')

  const cleanNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.parentNode?.removeChild(node)
      return
    }

    const element = node
    const tagName = element.tagName.toUpperCase()
    if (!ALLOWED_TAGS.has(tagName)) {
      const parent = element.parentNode
      while (element.firstChild) {
        parent?.insertBefore(element.firstChild, element)
      }
      parent?.removeChild(element)
      return
    }

    const attributes = [...element.attributes]
    for (const attribute of attributes) {
      const name = attribute.name.toLowerCase()
      if (tagName !== 'A') {
        element.removeAttribute(attribute.name)
        continue
      }

      if (name !== 'href') {
        element.removeAttribute(attribute.name)
        continue
      }

      const hrefValue = String(attribute.value || '').trim()
      if (!/^https?:\/\//i.test(hrefValue) && !/^mailto:/i.test(hrefValue)) {
        element.removeAttribute('href')
      } else {
        element.setAttribute('target', '_blank')
        element.setAttribute('rel', 'noopener noreferrer')
      }
    }

    const children = [...element.childNodes]
    children.forEach(cleanNode)
  }

  const bodyChildren = [...documentNode.body.childNodes]
  bodyChildren.forEach(cleanNode)
  return documentNode.body.innerHTML.trim()
}

function getPlainTextLength(html) {
  const parser = new DOMParser()
  const documentNode = parser.parseFromString(String(html || ''), 'text/html')
  return String(documentNode.body.textContent || '')
    .replace(/\s+/g, ' ')
    .trim().length
}

function getTodayDateValue() {
  const now = new Date()
  const timezoneOffset = now.getTimezoneOffset() * 60 * 1000
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10)
}

function formatTimestamp(timestamp) {
  const date = timestamp?.toDate?.()
  if (!date) {
    return 'Just now'
  }
  return date.toLocaleString()
}

function formatDateValue(dateValue) {
  const text = String(dateValue || '').trim()
  if (!text) {
    return ''
  }

  const date = new Date(`${text}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return text
  }

  return date.toLocaleDateString()
}

function TravelDiary() {
  const { user } = useAuth()
  const editorRef = useRef(null)

  const [entries, setEntries] = useState([])
  const [selectedEntryId, setSelectedEntryId] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [showEditor, setShowEditor] = useState(false)
  const [editingEntryId, setEditingEntryId] = useState('')
  const [editorTitle, setEditorTitle] = useState('')
  const [editorDate, setEditorDate] = useState(getTodayDateValue())
  const [editorHtml, setEditorHtml] = useState('')

  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const isEditing = Boolean(editingEntryId)
  const toolbarDisabled = !showEditor || saving

  const sortedEntries = useMemo(() => {
    return [...entries].sort((firstEntry, secondEntry) => {
      const firstDate = String(firstEntry.entryDate || '')
      const secondDate = String(secondEntry.entryDate || '')
      if (firstDate && secondDate && firstDate !== secondDate) {
        return secondDate.localeCompare(firstDate)
      }

      const firstTime = firstEntry.updatedAt?.toMillis?.() ?? firstEntry.createdAt?.toMillis?.() ?? 0
      const secondTime = secondEntry.updatedAt?.toMillis?.() ?? secondEntry.createdAt?.toMillis?.() ?? 0
      return secondTime - firstTime
    })
  }, [entries])

  const selectedEntry = useMemo(
    () => sortedEntries.find((entry) => entry.id === selectedEntryId) || null,
    [sortedEntries, selectedEntryId],
  )

  const loadEntries = async (userId, preferredEntryId = '') => {
    setLoading(true)
    setError('')

    try {
      const diaryEntries = await listDiaryEntries(userId)
      setEntries(diaryEntries)

      if (diaryEntries.length === 0) {
        setSelectedEntryId('')
        return
      }

      const preferredExists = preferredEntryId && diaryEntries.some((entry) => entry.id === preferredEntryId)
      if (preferredExists) {
        setSelectedEntryId(preferredEntryId)
        return
      }

      const currentExists = selectedEntryId && diaryEntries.some((entry) => entry.id === selectedEntryId)
      if (!currentExists) {
        setSelectedEntryId('')
      }
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let isMounted = true

    async function init() {
      if (!user?.uid) {
        if (isMounted) {
          setEntries([])
          setSelectedEntryId('')
          setLoading(false)
        }
        return
      }

      setLoading(true)
      setError('')
      try {
        const diaryEntries = await listDiaryEntries(user.uid)
        if (!isMounted) {
          return
        }

        setEntries(diaryEntries)
        setSelectedEntryId('')
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

    init()
    return () => {
      isMounted = false
    }
  }, [user?.uid])

  useEffect(() => {
    if (!showEditor || !editorRef.current) {
      return
    }

    const sanitized = sanitizeHtml(editorHtml || '<p><br></p>')
    editorRef.current.innerHTML = sanitized || '<p><br></p>'
    editorRef.current.focus()
  }, [showEditor, editingEntryId])

  const openAddEditor = () => {
    setEditingEntryId('')
    setEditorTitle('')
    setEditorDate(getTodayDateValue())
    setEditorHtml('<p><br></p>')
    setStatus('')
    setError('')
    setShowEditor(true)
  }

  const openEditEditor = (entry) => {
    const fallbackDate = entry?.createdAt?.toDate?.()
    const fallbackDateText = fallbackDate
      ? `${fallbackDate.getFullYear()}-${String(fallbackDate.getMonth() + 1).padStart(2, '0')}-${String(fallbackDate.getDate()).padStart(2, '0')}`
      : getTodayDateValue()

    setEditingEntryId(entry.id)
    setEditorTitle(entry.title || '')
    setEditorDate(entry.entryDate || fallbackDateText)
    setEditorHtml(entry.contentHtml || '<p><br></p>')
    setSelectedEntryId('')
    setStatus('')
    setError('')
    setShowEditor(true)
  }

  const closeEditor = () => {
    setShowEditor(false)
  }

  const applyCommand = (command, value = null) => {
    if (!editorRef.current || toolbarDisabled) {
      return
    }

    editorRef.current.focus()
    document.execCommand(command, false, value)
    const nextHtml = sanitizeHtml(editorRef.current.innerHTML)
    setEditorHtml(nextHtml || '<p><br></p>')
  }

  const applyBlockFormat = (tagName) => {
    if (!editorRef.current || toolbarDisabled) {
      return
    }

    const normalizedTag = String(tagName || '')
      .trim()
      .toLowerCase()
    if (!normalizedTag) {
      return
    }

    editorRef.current.focus()
    document.execCommand('formatBlock', false, `<${normalizedTag}>`)
    document.execCommand('formatBlock', false, normalizedTag)
    document.execCommand('formatBlock', false, normalizedTag.toUpperCase())

    const nextHtml = sanitizeHtml(editorRef.current.innerHTML)
    setEditorHtml(nextHtml || '<p><br></p>')
  }

  const isSelectionInsideTag = (tagName) => {
    if (!editorRef.current) {
      return false
    }

    const normalizedTag = String(tagName || '')
      .trim()
      .toUpperCase()
    if (!normalizedTag) {
      return false
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      return false
    }

    const editorNode = editorRef.current
    const range = selection.getRangeAt(0)
    const boundaryNodes = [range.startContainer, range.endContainer]

    const hasAncestorTag = (node) => {
      let current = node
      if (current?.nodeType === Node.TEXT_NODE) {
        current = current.parentElement
      }

      while (current && current !== editorNode) {
        if (current.nodeType === Node.ELEMENT_NODE && current.tagName === normalizedTag) {
          return true
        }
        current = current.parentNode
      }

      return false
    }

    return boundaryNodes.some(hasAncestorTag)
  }

  const toggleQuote = () => {
    if (isSelectionInsideTag('blockquote')) {
      applyBlockFormat('p')
      return
    }

    applyBlockFormat('blockquote')
  }

  const handleAddLink = () => {
    if (toolbarDisabled) {
      return
    }

    const url = window.prompt('Enter link URL (https://...)')
    if (!url) {
      return
    }

    applyCommand('createLink', url)
  }

  const handleEditorInput = () => {
    if (!editorRef.current) {
      return
    }

    const nextHtml = sanitizeHtml(editorRef.current.innerHTML)
    setEditorHtml(nextHtml || '<p><br></p>')
  }

  const handleSaveEntry = async () => {
    if (!user?.uid) {
      setError('You must be logged in to save diary entries.')
      return
    }

    const normalizedHtml = sanitizeHtml(editorRef.current?.innerHTML || editorHtml)
    if (getPlainTextLength(normalizedHtml) === 0) {
      setError('Diary entry cannot be empty.')
      return
    }

    setSaving(true)
    setStatus('')
    setError('')

    try {
      if (isEditing) {
        await updateDiaryEntry({
          entryId: editingEntryId,
          userId: user.uid,
          title: editorTitle,
          entryDate: editorDate,
          contentHtml: normalizedHtml,
        })
        setStatus('Diary entry updated.')
        await loadEntries(user.uid, editingEntryId)
      } else {
        await createDiaryEntry(user.uid, {
          title: editorTitle,
          entryDate: editorDate,
          contentHtml: normalizedHtml,
        })
        setStatus('Diary entry saved.')
        await loadEntries(user.uid)
      }

      setShowEditor(false)
      setEditingEntryId('')
      setEditorTitle('')
      setEditorDate(getTodayDateValue())
      setEditorHtml('<p><br></p>')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSelectedEntry = async () => {
    if (!selectedEntry?.id || !user?.uid || deleting) {
      return
    }

    const confirmed = window.confirm('Delete this diary entry? This cannot be undone.')
    if (!confirmed) {
      return
    }

    setDeleting(true)
    setStatus('')
    setError('')

    try {
      const deletedEntryId = selectedEntry.id
      await deleteDiaryEntry({ entryId: deletedEntryId, userId: user.uid })
      setStatus('Diary entry deleted.')
      await loadEntries(user.uid)
      setSelectedEntryId('')
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <PageContainer title="TravelDiary" description="Capture daily highlights and reflections.">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-600">Select a card to read the full entry.</p>
          <button
            type="button"
            onClick={openAddEditor}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Add Entry
          </button>
        </div>

        {status && <p className="text-sm text-emerald-700">{status}</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {loading && <p className="text-sm text-slate-600">Loading diary entries...</p>}

        {!loading && sortedEntries.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
            No diary entries yet. Click "Add Entry" to create your first entry.
          </p>
        )}

        {!loading && sortedEntries.length > 0 && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sortedEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedEntryId(entry.id)}
                  className={`rounded-lg border p-3 text-left transition ${
                    selectedEntryId === entry.id
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <p className={`text-xs ${selectedEntryId === entry.id ? 'text-slate-200' : 'text-slate-500'}`}>
                    {formatDateValue(entry.entryDate) || formatTimestamp(entry.createdAt)}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold">{entry.title || 'Untitled Entry'}</p>
                </button>
              ))}
            </div>

            {!selectedEntry && (
              <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                Click a diary card to view the entry.
              </p>
            )}
          </div>
        )}
      </div>

      {selectedEntry && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-4"
          onClick={() => setSelectedEntryId('')}
        >
          <section
            className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg border border-slate-200 bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs text-slate-500">
                  {formatDateValue(selectedEntry.entryDate) || formatTimestamp(selectedEntry.createdAt)}
                </p>
                <h3 className="mt-1 text-xl font-semibold text-slate-900">
                  {selectedEntry.title || 'Untitled Entry'}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openEditEditor(selectedEntry)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelectedEntry}
                  disabled={deleting}
                  className="rounded-md bg-rose-100 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEntryId('')}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Close
                </button>
              </div>
            </div>

            <div
              className="mt-4 text-sm text-slate-700 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_h2]:my-2 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:text-xl [&_h3]:font-semibold [&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-slate-600"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedEntry.contentHtml) }}
            />
          </section>
        </div>
      )}

      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {isEditing ? 'Edit Diary Entry' : 'New Diary Entry'}
              </h3>
              <button
                type="button"
                onClick={closeEditor}
                disabled={saving}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Close
              </button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
                Title
                <input
                  value={editorTitle}
                  onChange={(event) => setEditorTitle(event.target.value)}
                  maxLength={120}
                  placeholder="Entry title"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  disabled={saving}
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Entry Date
                <input
                  type="date"
                  value={editorDate}
                  onChange={(event) => setEditorDate(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  disabled={saving}
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 rounded-md border border-slate-200 bg-slate-50 p-2">
              <button type="button" onClick={() => applyCommand('bold')} disabled={toolbarDisabled} className="rounded border border-slate-300 bg-white px-2.5 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60">B</button>
              <button type="button" onClick={() => applyCommand('italic')} disabled={toolbarDisabled} className="rounded border border-slate-300 bg-white px-2.5 py-1 text-sm italic text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60">I</button>
              <button type="button" onClick={() => applyCommand('underline')} disabled={toolbarDisabled} className="rounded border border-slate-300 bg-white px-2.5 py-1 text-sm underline text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60">U</button>
              <button type="button" onClick={() => applyBlockFormat('h2')} disabled={toolbarDisabled} className="rounded border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60">H2</button>
              <button type="button" onClick={() => applyBlockFormat('h3')} disabled={toolbarDisabled} className="rounded border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60">H3</button>
              <button type="button" onClick={() => applyCommand('insertUnorderedList')} disabled={toolbarDisabled} className="rounded border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60">- List</button>
              <button type="button" onClick={() => applyCommand('insertOrderedList')} disabled={toolbarDisabled} className="rounded border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60">1. List</button>
              <button type="button" onClick={toggleQuote} disabled={toolbarDisabled} className="rounded border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60">Quote</button>
              <button type="button" onClick={handleAddLink} disabled={toolbarDisabled} className="rounded border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60">Link</button>
              <button type="button" onClick={() => applyCommand('removeFormat')} disabled={toolbarDisabled} className="rounded border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60">Clear</button>
            </div>

            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              className="mt-3 min-h-[16rem] rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_h2]:my-2 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:text-xl [&_h3]:font-semibold [&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-slate-600"
            />

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeEditor}
                disabled={saving}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEntry}
                disabled={saving}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {saving ? 'Saving...' : 'Save Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

export default TravelDiary
