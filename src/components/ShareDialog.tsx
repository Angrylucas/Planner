import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { generateToken } from '../lib/utils'
import type { Trip, TripInvite, TripMember, Profile, Role } from '../types/database'
import { useAuth } from '../contexts/auth-context'

interface MemberRow extends TripMember {
  profile?: Profile | null
}

export function ShareDialog({
  trip,
  isOwner,
  canEdit,
  onClose,
  onTripChange,
}: {
  trip: Trip
  isOwner: boolean
  canEdit: boolean
  onClose: () => void
  onTripChange: (t: Trip) => void
}) {
  const { user } = useAuth()
  const [members, setMembers] = useState<MemberRow[]>([])
  const [invites, setInvites] = useState<TripInvite[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('editor')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [trip.id])

  async function load() {
    const [{ data: m }, { data: inv }] = await Promise.all([
      supabase.from('trip_members').select('*, profile:profiles(*)').eq('trip_id', trip.id),
      supabase.from('trip_invites').select('*').eq('trip_id', trip.id).is('accepted_at', null),
    ])
    setMembers((m as MemberRow[] | null) ?? [])
    setInvites((inv as TripInvite[] | null) ?? [])
  }

  async function invite(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !user) return
    setBusy(true)
    setError(null)
    const token = generateToken(20)
    const { error } = await supabase.from('trip_invites').insert({
      trip_id: trip.id,
      email: email.trim().toLowerCase(),
      role: role === 'owner' ? 'editor' : role,
      token,
      invited_by: user.id,
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setEmail('')
    void load()
  }

  async function revokeInvite(id: string) {
    await supabase.from('trip_invites').delete().eq('id', id)
    void load()
  }

  async function changeRole(userId: string, newRole: Role) {
    if (newRole === 'owner') return
    await supabase
      .from('trip_members')
      .update({ role: newRole })
      .eq('trip_id', trip.id)
      .eq('user_id', userId)
    void load()
  }

  async function removeMember(userId: string) {
    if (!confirm('Remove this collaborator?')) return
    await supabase.from('trip_members').delete().eq('trip_id', trip.id).eq('user_id', userId)
    void load()
  }

  async function toggleShareLink(enabled: boolean) {
    setBusy(true)
    let token = trip.share_token
    if (enabled && !token) token = generateToken(16)
    const { data, error } = await supabase
      .from('trips')
      .update({ share_enabled: enabled, share_token: token })
      .eq('id', trip.id)
      .select()
      .single()
    setBusy(false)
    if (error || !data) {
      setError(error?.message ?? 'Failed to update share link')
      return
    }
    onTripChange(data)
  }

  const inviteUrl = (token: string) =>
    `${window.location.origin}/invite/${token}`
  const shareUrl = trip.share_token
    ? `${window.location.origin}/shared/${trip.share_token}`
    : ''

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // ignore
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Share trip</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            ✕
          </button>
        </div>

        {canEdit && (
          <form onSubmit={invite} className="mb-4 space-y-2">
            <label className="block text-sm font-medium text-slate-700">Invite by email</label>
            <div className="flex gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="friend@example.com"
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="rounded-md border border-slate-300 px-2 py-2 text-sm"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                Invite
              </button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        )}

        <div className="mb-4">
          <h3 className="mb-2 text-sm font-medium text-slate-700">People with access</h3>
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <div className="font-medium text-slate-800">
                    {m.profile?.full_name || m.profile?.email || m.user_id.slice(0, 8)}
                  </div>
                  {m.profile?.email && (
                    <div className="text-xs text-slate-500">{m.profile.email}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isOwner && m.role !== 'owner' ? (
                    <select
                      value={m.role}
                      onChange={(e) => void changeRole(m.user_id, e.target.value as Role)}
                      className="rounded border border-slate-300 px-1 py-0.5 text-xs"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  ) : (
                    <span className="text-xs text-slate-500">{m.role}</span>
                  )}
                  {isOwner && m.role !== 'owner' && (
                    <button
                      onClick={() => void removeMember(m.user_id)}
                      className="text-xs text-slate-400 hover:text-red-600"
                    >
                      remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {invites.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-medium text-slate-700">Pending invites</h3>
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-800">{i.email}</div>
                    <div className="truncate text-xs text-slate-500">{i.role}</div>
                  </div>
                  <button
                    onClick={() => void copy(inviteUrl(i.token))}
                    className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                    title={inviteUrl(i.token)}
                  >
                    Copy link
                  </button>
                  {canEdit && (
                    <button
                      onClick={() => void revokeInvite(i.id)}
                      className="text-xs text-slate-400 hover:text-red-600"
                    >
                      revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-700">Public share link</h3>
          <p className="mb-2 text-xs text-slate-500">
            Anyone with this link can view the trip (read-only). Editors still need an account.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={trip.share_enabled && shareUrl ? shareUrl : 'Disabled'}
              className="flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
            />
            <button
              disabled={!trip.share_enabled || !shareUrl}
              onClick={() => void copy(shareUrl)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Copy
            </button>
            {isOwner && (
              <button
                onClick={() => void toggleShareLink(!trip.share_enabled)}
                disabled={busy}
                className={
                  trip.share_enabled
                    ? 'rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50'
                    : 'rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700'
                }
              >
                {trip.share_enabled ? 'Disable' : 'Enable'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
