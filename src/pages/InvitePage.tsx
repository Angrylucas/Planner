import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { supabase } from '../lib/supabase'
import type { TripInvite } from '../types/database'

export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [invite, setInvite] = useState<TripInvite | null>(null)
  const [tripTitle, setTripTitle] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      const { data: inv, error } = await supabase
        .from('trip_invites')
        .select('*')
        .eq('token', token)
        .maybeSingle()
      if (cancelled) return
      if (error || !inv) {
        setError('Invite not found or already used.')
        setLoading(false)
        return
      }
      const invRow = inv as TripInvite
      setInvite(invRow)
      if (invRow.accepted_at) {
        setError('This invite has already been used.')
      }
      const { data: trip } = await supabase
        .from('trips')
        .select('title')
        .eq('id', invRow.trip_id)
        .maybeSingle()
      if (cancelled) return
      setTripTitle((trip as { title?: string } | null)?.title ?? '')
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [token, user])

  async function accept() {
    if (!invite || !user) return
    setAccepting(true)
    setError(null)
    if (
      user.email &&
      invite.email.toLowerCase() !== user.email.toLowerCase()
    ) {
      setError(
        `This invite was sent to ${invite.email}. Please log in with that email.`,
      )
      setAccepting(false)
      return
    }
    const { error: memberErr } = await supabase.from('trip_members').upsert({
      trip_id: invite.trip_id,
      user_id: user.id,
      role: invite.role,
      created_at: new Date().toISOString(),
    })
    if (memberErr) {
      setError(memberErr.message)
      setAccepting(false)
      return
    }
    await supabase
      .from('trip_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invite.id)
    navigate(`/trips/${invite.trip_id}`)
  }

  if (loading || authLoading) {
    return <div className="p-8 text-slate-500">Loading invite…</div>
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <h1 className="mb-2 text-xl font-semibold text-slate-900">Invitation</h1>
        <p className="text-red-600">{error}</p>
        <Link to="/trips" className="mt-4 inline-block text-indigo-600 hover:underline">
          Back to trips
        </Link>
      </div>
    )
  }

  if (!user) {
    const next = encodeURIComponent(`/invite/${token}`)
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <h1 className="mb-2 text-xl font-semibold text-slate-900">You're invited</h1>
        <p className="mb-4 text-slate-600">
          You've been invited to collaborate on{' '}
          <span className="font-semibold">{tripTitle}</span> as{' '}
          <span className="font-semibold">{invite?.role}</span>.
        </p>
        <p className="mb-4 text-sm text-slate-500">
          Log in or create an account with <strong>{invite?.email}</strong> to accept.
        </p>
        <div className="flex justify-center gap-2">
          <Link
            to={`/login?next=${next}`}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Log in
          </Link>
          <Link
            to={`/signup?next=${next}`}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
          >
            Sign up
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 text-center">
      <h1 className="mb-2 text-xl font-semibold text-slate-900">You're invited</h1>
      <p className="mb-6 text-slate-600">
        Join <span className="font-semibold">{tripTitle}</span> as{' '}
        <span className="font-semibold">{invite?.role}</span>.
      </p>
      <button
        onClick={accept}
        disabled={accepting}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {accepting ? 'Joining…' : 'Accept invite'}
      </button>
    </div>
  )
}
