import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'

export function AppHeader() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">W</span>
          Wanderly
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <span className="hidden text-slate-500 sm:inline">{user.email}</span>
              <button
                onClick={async () => {
                  await signOut()
                  navigate('/login')
                }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-slate-700 hover:text-slate-900">
                Log in
              </Link>
              <Link
                to="/signup"
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-700"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
