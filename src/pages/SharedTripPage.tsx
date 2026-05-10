import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { ItineraryItem, Place, Trip, TripDay } from '../types/database'
import { TripMap } from '../components/TripMap'
import { formatDateRange } from '../lib/utils'

export function SharedTripPage() {
  const { token } = useParams<{ token: string }>()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [days, setDays] = useState<TripDay[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [items, setItems] = useState<ItineraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data: t, error } = await supabase
        .from('trips')
        .select('*')
        .eq('share_token', token)
        .eq('share_enabled', true)
        .maybeSingle()
      if (cancelled) return
      if (error || !t) {
        setError('This shared link is invalid or has been disabled.')
        setLoading(false)
        return
      }
      const tripRow = t as Trip
      setTrip(tripRow)
      const [{ data: d }, { data: p }, { data: i }] = await Promise.all([
        supabase.from('trip_days').select('*').eq('trip_id', tripRow.id).order('day_index'),
        supabase.from('places').select('*').eq('trip_id', tripRow.id).order('created_at'),
        supabase.from('itinerary_items').select('*').eq('trip_id', tripRow.id).order('position'),
      ])
      if (cancelled) return
      setDays((d as TripDay[] | null) ?? [])
      setPlaces((p as Place[] | null) ?? [])
      setItems((i as ItineraryItem[] | null) ?? [])
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  if (loading) return <div className="p-8 text-slate-500">Loading…</div>
  if (error || !trip) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <p className="text-red-600">{error}</p>
        <Link to="/" className="mt-4 inline-block text-indigo-600 hover:underline">
          Home
        </Link>
      </div>
    )
  }

  const placeMap = new Map(places.map((p) => [p.id, p]))

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <h1 className="text-2xl font-semibold text-slate-900">{trip.title}</h1>
          <p className="text-sm text-slate-500">
            {trip.destination ? `${trip.destination} · ` : ''}
            {formatDateRange(trip.start_date, trip.end_date)}
          </p>
          <span className="mt-2 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Read-only shared trip
          </span>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[1fr_minmax(420px,1fr)]">
        <div className="space-y-4">
          {days.map((d) => {
            const dayItems = items
              .filter((i) => i.day_id === d.id)
              .sort((a, b) => a.position - b.position)
            return (
              <div key={d.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="mb-2 text-base font-semibold text-slate-900">
                  Day {d.day_index + 1}
                  {d.date && (
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  )}
                </h3>
                {dayItems.length === 0 ? (
                  <p className="text-sm text-slate-400">Nothing planned.</p>
                ) : (
                  <ul className="space-y-2">
                    {dayItems.map((it) => {
                      const p = it.place_id ? placeMap.get(it.place_id) : undefined
                      return (
                        <li
                          key={it.id}
                          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                        >
                          <div className="text-sm font-medium text-slate-900">
                            {p?.name ?? it.title ?? 'Untitled'}
                          </div>
                          {p?.address && <div className="text-xs text-slate-500">{p.address}</div>}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
        <div className="sticky top-4 h-[60vh] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:h-[calc(100vh-8rem)]">
          <TripMap places={places} />
        </div>
      </div>
    </div>
  )
}
