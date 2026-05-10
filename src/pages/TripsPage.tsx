import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { supabase } from '../lib/supabase'
import type { Trip } from '../types/database'
import { addDays, daysBetween, formatDateRange } from '../lib/utils'

interface TripRow extends Trip {
  role: 'owner' | 'editor' | 'viewer'
}

export function TripsPage() {
  const { user } = useAuth()
  const [trips, setTrips] = useState<TripRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    void loadTrips()
  }, [user])

  async function loadTrips() {
    setLoading(true)
    const { data, error } = await supabase
      .from('trip_members')
      .select('role, trip:trips(*)')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    const raw = (data ?? []) as unknown as Array<{ role: string; trip: Trip | null }>
    const rows = raw
      .map((r) => (r.trip ? { ...r.trip, role: r.role as TripRow['role'] } : null))
      .filter((x): x is TripRow => Boolean(x))
    setTrips(rows)
    setLoading(false)
  }

  async function deleteTrip(id: string) {
    if (!confirm('Delete this trip? This cannot be undone.')) return
    const { error } = await supabase.from('trips').delete().eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    setTrips((t) => t.filter((x) => x.id !== id))
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Your trips</h1>
          <p className="text-slate-500">Plan trips, collaborate with friends, see everything on a map.</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
        >
          New trip
        </button>
      </div>

      {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : trips.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-600">No trips yet — start your first adventure.</p>
          <button
            onClick={() => setShowNew(true)}
            className="mt-4 rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
          >
            Create a trip
          </button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((t) => (
            <li
              key={t.id}
              className="group flex flex-col rounded-lg border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
            >
              <Link to={`/trips/${t.id}`} className="block p-5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    {t.role}
                  </span>
                  {t.share_enabled && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      shared
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-semibold text-slate-900 group-hover:text-indigo-700">
                  {t.title}
                </h2>
                {t.destination && <p className="text-sm text-slate-600">{t.destination}</p>}
                <p className="mt-1 text-sm text-slate-500">{formatDateRange(t.start_date, t.end_date)}</p>
              </Link>
              {t.role === 'owner' && (
                <div className="flex items-center justify-end border-t border-slate-100 px-5 py-2">
                  <button
                    onClick={() => deleteTrip(t.id)}
                    className="text-xs text-slate-500 hover:text-red-600"
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {showNew && (
        <NewTripModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false)
            void loadTrips()
          }}
        />
      )}
    </div>
  )
}

function NewTripModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setLoading(true)
    setError(null)
    const { data: trip, error } = await supabase
      .from('trips')
      .insert({
        title,
        destination: destination || null,
        start_date: startDate || null,
        end_date: endDate || null,
        owner_id: user.id,
      })
      .select()
      .single()
    if (error || !trip) {
      setError(error?.message ?? 'Failed to create trip')
      setLoading(false)
      return
    }

    if (startDate && endDate) {
      const n = daysBetween(startDate, endDate) + 1
      const days = Array.from({ length: n }, (_, i) => ({
        trip_id: trip.id,
        day_index: i,
        date: addDays(startDate, i),
      }))
      await supabase.from('trip_days').insert(days)
    } else {
      await supabase.from('trip_days').insert({ trip_id: trip.id, day_index: 0 })
    }

    setLoading(false)
    onCreated()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">New trip</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Lisbon long weekend"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Destination</label>
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Lisbon, Portugal"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Start</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">End</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? 'Creating…' : 'Create trip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
