import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Trip } from '../types/database'

export function EditTripPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const navigate = useNavigate()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tripId) return
    void supabase
      .from('trips')
      .select('*')
      .eq('id', tripId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) setError(error?.message ?? 'Trip not found')
        else setTrip(data)
        setLoading(false)
      })
  }, [tripId])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!trip) return
    setSaving(true)
    const { error } = await supabase
      .from('trips')
      .update({
        title: trip.title,
        description: trip.description,
        destination: trip.destination,
        start_date: trip.start_date,
        end_date: trip.end_date,
      })
      .eq('id', trip.id)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(`/trips/${trip.id}`)
  }

  if (loading) return <div className="p-8 text-slate-500">Loading…</div>
  if (error || !trip) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-red-600">{error ?? 'Not found'}</p>
        <Link to="/trips" className="mt-4 inline-block text-indigo-600 hover:underline">
          Back to trips
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Edit trip</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
          <input
            required
            value={trip.title}
            onChange={(e) => setTrip({ ...trip, title: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Destination</label>
          <input
            value={trip.destination ?? ''}
            onChange={(e) => setTrip({ ...trip, destination: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
          <textarea
            rows={3}
            value={trip.description ?? ''}
            onChange={(e) => setTrip({ ...trip, description: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Start date</label>
            <input
              type="date"
              value={trip.start_date ?? ''}
              onChange={(e) => setTrip({ ...trip, start_date: e.target.value || null })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">End date</label>
            <input
              type="date"
              value={trip.end_date ?? ''}
              onChange={(e) => setTrip({ ...trip, end_date: e.target.value || null })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Link
            to={`/trips/${trip.id}`}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
