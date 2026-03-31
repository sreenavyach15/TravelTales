import { Link } from 'react-router-dom'

function AuthLanding() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <h1 className="text-4xl font-bold text-slate-900">Travel Tales</h1>
        <p className="mt-3 text-sm text-slate-600">
          Choose an option to continue to your shared travel workspace.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            to="/login"
            className="rounded-md bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Login
          </Link>
          <Link
            to="/signup"
            className="rounded-md border border-slate-300 px-6 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  )
}

export default AuthLanding
