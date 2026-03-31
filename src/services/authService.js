import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth'
import { auth } from '../firebase/config'
import { ensureUserProfile } from './userService'

function getAuthInstance() {
  if (!auth) {
    throw new Error(
      'Firebase is not configured. Add VITE_FIREBASE_* variables in your environment first.',
    )
  }
  return auth
}

function getAuthErrorMessage(error) {
  switch (error?.code) {
    case 'auth/invalid-email':
      return 'Enter a valid email address.'
    case 'auth/missing-password':
      return 'Password is required.'
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 8 characters with mixed character types.'
    case 'auth/email-already-in-use':
      return 'An account already exists with this email.'
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email or password.'
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.'
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.'
    case 'auth/requires-recent-login':
      return 'For security, please log out and log in again before changing password.'
    default:
      return 'Authentication failed. Please try again.'
  }
}

export async function signupWithEmail(email, password) {
  try {
    const credential = await createUserWithEmailAndPassword(getAuthInstance(), email.trim(), password)
    await ensureUserProfile(credential.user)
    return credential
  } catch (error) {
    throw new Error(getAuthErrorMessage(error))
  }
}

export async function loginWithEmail(email, password) {
  try {
    const credential = await signInWithEmailAndPassword(getAuthInstance(), email.trim(), password)
    await ensureUserProfile(credential.user)
    return credential
  } catch (error) {
    throw new Error(getAuthErrorMessage(error))
  }
}

export async function logoutUser() {
  try {
    return await signOut(getAuthInstance())
  } catch (error) {
    throw new Error(getAuthErrorMessage(error))
  }
}

export async function changePassword(newPassword) {
  const authInstance = getAuthInstance()
  const currentUser = authInstance.currentUser

  if (!currentUser) {
    throw new Error('You need to be logged in to change password.')
  }

  try {
    await updatePassword(currentUser, String(newPassword || ''))
  } catch (error) {
    throw new Error(getAuthErrorMessage(error))
  }
}
