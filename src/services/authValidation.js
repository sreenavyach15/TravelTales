const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i

export const PASSWORD_REQUIREMENTS = [
  'At least 8 characters',
  'At least one uppercase letter',
  'At least one lowercase letter',
  'At least one number',
  'At least one special character',
]

export function validateEmail(email) {
  const normalizedEmail = email.trim()
  if (!normalizedEmail) {
    return 'Email is required.'
  }
  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return 'Enter a valid email address.'
  }
  return ''
}

export function validatePassword(password) {
  if (!password) {
    return 'Password is required.'
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long.'
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter.'
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include at least one lowercase letter.'
  }
  if (!/\d/.test(password)) {
    return 'Password must include at least one number.'
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must include at least one special character.'
  }
  return ''
}

export function validateLoginForm({ email, password }) {
  const errors = {}
  const emailError = validateEmail(email)
  const passwordError = validatePassword(password)

  if (emailError) {
    errors.email = emailError
  }
  if (passwordError) {
    errors.password = passwordError
  }

  return errors
}

export function validateSignupForm({ email, password }) {
  return validateLoginForm({ email, password })
}
