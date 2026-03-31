import { supabase } from './supabaseClient'

const photosBucket = import.meta.env.VITE_SUPABASE_PHOTOS_BUCKET ?? 'travel-photos'

export const uploadPhoto = async (file, options = {}) => {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_* values in .env.')
  }

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
    throw new Error(uploadError.message)
  }

  const { data } = supabase.storage.from(photosBucket).getPublicUrl(filePath)
  return {
    publicUrl: data.publicUrl,
    storagePath: filePath,
  }
}
