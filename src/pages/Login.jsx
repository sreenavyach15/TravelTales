import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import PageContainer from '../components/PageContainer'
import { loginWithEmail } from '../services/authService'
import { PASSWORD_REQUIREMENTS, validateLoginForm } from '../services/authValidation'

function Login() {
  const [formData, setFormData] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((previous) => ({ ...previous, [name]: value }))
    setErrors((previous) => {
      if (!previous[name]) {
        return previous
      }
      const next = { ...previous }
      delete next[name]
      return next
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setStatus('')
    const validationErrors = validateLoginForm(formData)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      setStatus('Please correct the highlighted fields.')
      return
    }

    setErrors({})
    setIsSubmitting(true)
    try {
      await loginWithEmail(formData.email, formData.password)
      const targetPath = location.state?.from || '/dashboard'
      navigate(targetPath, { replace: true })
    } catch (error) {
      setStatus(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PageContainer title="Login" description="Sign in to access your Travel Tales dashboard.">
      <form className="mx-auto max-w-md space-y-4" onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            aria-invalid={Boolean(errors.email)}
            className={`w-full rounded-md border px-3 py-2 focus:outline-none ${
              errors.email
                ? 'border-rose-500 focus:border-rose-500'
                : 'border-slate-300 focus:border-slate-500'
            }`}
          />
          {errors.email && <p className="mt-1 text-sm text-rose-600">{errors.email}</p>}
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={formData.password}
            onChange={handleChange}
            aria-invalid={Boolean(errors.password)}
            className={`w-full rounded-md border px-3 py-2 focus:outline-none ${
              errors.password
                ? 'border-rose-500 focus:border-rose-500'
                : 'border-slate-300 focus:border-slate-500'
            }`}
          />
          {errors.password && <p className="mt-1 text-sm text-rose-600">{errors.password}</p>}
          <p className="mt-2 text-xs text-slate-500">
            Password rules: {PASSWORD_REQUIREMENTS.join(', ')}.
          </p>
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isSubmitting ? 'Logging in...' : 'Login'}
        </button>
        {status && <p className="text-sm text-rose-600">{status}</p>}
        <p className="text-sm text-slate-600">
          New here?{' '}
          <Link to="/signup" className="font-semibold text-slate-900 hover:underline">
            Create an account
          </Link>
        </p>
      </form>
    </PageContainer>
  )
}

export default Login
