import { ensureSupabaseSession, supabase } from './supabaseClient'

const photosBucket = import.meta.env.VITE_SUPABASE_PHOTOS_BUCKET ?? 'travel-photos'

export const uploadPhoto = async (file, options = {}) => {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_* values in .env.')
  }

  await ensureSupabaseSession()

  const pathPrefix = String(options.pathPrefix || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
  const fileNamePrefix = String(options.fileNamePrefix || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const safeName = file.name.replace(/\s+/g, '-')
  const fileNameCore = `${Date.now()}-${safeName}`
  const fileName = fileNamePrefix ? `${fileNamePrefix}-${fileNameCore}` : fileNameCore
  const filePath = pathPrefix ? `${pathPrefix}/${fileName}` : fileName

  let uploadError = null
  try {
    const uploadResult = await supabase.storage.from(photosBucket).upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    })
    uploadError = uploadResult.error
  } catch (error) {
    if (error instanceof TypeError && String(error.message || '').toLowerCase().includes('fetch')) {
      throw new Error(
        'Failed to reach Supabase Storage. Check internet connection, VITE_SUPABASE_URL, and bucket CORS/policies.',
      )
    }

    throw error
  }

  if (uploadError) {
    const message = String(uploadError.message || '')
    if (message.toLowerCase().includes('row-level security policy')) {
      throw new Error(
        'Supabase blocked upload by RLS policy. Enable Supabase Anonymous auth and allow authenticated inserts for this storage bucket.',
      )
    }

    throw new Error(uploadError.message)
  }

  const { data } = supabase.storage.from(photosBucket).getPublicUrl(filePath)
  return {
    publicUrl: data.publicUrl,
    storagePath: filePath,
  }
}

export const deletePhotoByPath = async (storagePath) => {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_* values in .env.')
  }

  const normalizedPath = String(storagePath || '').trim().replace(/^\/+/, '')
  if (!normalizedPath) {
    return
  }

  await ensureSupabaseSession()

  const { error } = await supabase.storage.from(photosBucket).remove([normalizedPath])
  if (error) {
    const message = String(error.message || '')
    if (message.toLowerCase().includes('row-level security policy')) {
      throw new Error(
        'Supabase blocked delete by RLS policy. Allow authenticated deletes for this storage bucket.',
      )
    }
    throw new Error(error.message)
  }
}
