import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { supabase } from '../lib/supabase'
import type {
  ItineraryItem,
  Place,
  Role,
  Trip,
  TripDay,
} from '../types/database'
import { addDays, daysBetween, formatDateRange } from '../lib/utils'
import { TripMap } from '../components/TripMap'
import { PlaceSearch, type NominatimResult } from '../components/PlaceSearch'
import { ItineraryDay } from '../components/ItineraryDay'
import { ShareDialog } from '../components/ShareDialog'

export function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [days, setDays] = useState<TripDay[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [items, setItems] = useState<ItineraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [focusPlaceId, setFocusPlaceId] = useState<string | null>(null)
  const [activeDayId, setActiveDayId] = useState<string | null>(null)
  const [showShare, setShowShare] = useState(false)

  const placeMap = useMemo(() => new Map(places.map((p) => [p.id, p])), [places])
  const canEdit = role === 'owner' || role === 'editor'
  const isOwner = role === 'owner'

  useEffect(() => {
    if (!tripId || !user) return
    void loadAll(tripId)
  }, [tripId, user])

  // Realtime: collaborators see live updates.
  useEffect(() => {
    if (!tripId) return
    const channel = supabase
      .channel(`trip-${tripId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'places', filter: `trip_id=eq.${tripId}` },
        () => void refreshPlaces(tripId),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'itinerary_items', filter: `trip_id=eq.${tripId}` },
        () => void refreshItems(tripId),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_days', filter: `trip_id=eq.${tripId}` },
        () => void refreshDays(tripId),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [tripId])

  async function loadAll(id: string) {
    setLoading(true)
    setError(null)
    const [{ data: t, error: tErr }, { data: m }] = await Promise.all([
      supabase.from('trips').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('trip_members')
        .select('role')
        .eq('trip_id', id)
        .eq('user_id', user!.id)
        .maybeSingle(),
    ])
    if (tErr || !t) {
      setError(tErr?.message ?? 'Trip not found')
      setLoading(false)
      return
    }
    setTrip(t)
    setRole((m?.role as Role | undefined) ?? (t.share_enabled ? 'viewer' : null))
    await Promise.all([refreshDays(id), refreshPlaces(id), refreshItems(id)])
    setLoading(false)
  }

  async function refreshDays(id: string) {
    const { data } = await supabase
      .from('trip_days')
      .select('*')
      .eq('trip_id', id)
      .order('day_index', { ascending: true })
    const list = (data as TripDay[] | null) ?? []
    setDays(list)
    setActiveDayId((cur) => cur ?? list[0]?.id ?? null)
  }

  async function refreshPlaces(id: string) {
    const { data } = await supabase
      .from('places')
      .select('*')
      .eq('trip_id', id)
      .order('created_at', { ascending: true })
    setPlaces((data as Place[] | null) ?? [])
  }

  async function refreshItems(id: string) {
    const { data } = await supabase
      .from('itinerary_items')
      .select('*')
      .eq('trip_id', id)
      .order('position', { ascending: true })
    setItems((data as ItineraryItem[] | null) ?? [])
  }

  const addPlaceFromSearch = useCallback(
    async (r: NominatimResult) => {
      if (!trip || !user || !canEdit) return
      const lat = parseFloat(r.lat)
      const lng = parseFloat(r.lon)
      const name = r.display_name.split(',')[0]?.trim() || r.display_name
      const { data, error } = await supabase
        .from('places')
        .insert({
          trip_id: trip.id,
          name,
          address: r.display_name,
          lat,
          lng,
          category: r.type ?? r.class ?? null,
          created_by: user.id,
        })
        .select()
        .single()
      if (error || !data) {
        alert(error?.message ?? 'Failed to save place')
        return
      }
      setPlaces((p) => [...p, data])
      setFocusPlaceId(data.id)
    },
    [trip, user, canEdit],
  )

  async function addItineraryItem(dayId: string, placeId: string | null, title: string | null) {
    if (!trip || !canEdit) return
    const dayItems = items.filter((i) => i.day_id === dayId)
    const position = dayItems.length
    const { data, error } = await supabase
      .from('itinerary_items')
      .insert({
        trip_id: trip.id,
        day_id: dayId,
        place_id: placeId,
        title,
        position,
      })
      .select()
      .single()
    if (error || !data) {
      alert(error?.message ?? 'Failed to add item')
      return
    }
    setItems((prev) => [...prev, data])
  }

  async function removeItineraryItem(itemId: string) {
    if (!canEdit) return
    setItems((prev) => prev.filter((i) => i.id !== itemId))
    await supabase.from('itinerary_items').delete().eq('id', itemId)
  }

  async function reorderDay(dayId: string, ordered: ItineraryItem[]) {
    if (!canEdit) return
    const updates = ordered.map((it, idx) => ({ ...it, position: idx }))
    setItems((prev) => {
      const others = prev.filter((i) => i.day_id !== dayId)
      return [...others, ...updates]
    })
    await Promise.all(
      updates.map((u) =>
        supabase.from('itinerary_items').update({ position: u.position }).eq('id', u.id),
      ),
    )
  }

  async function removePlace(placeId: string) {
    if (!canEdit) return
    if (!confirm('Remove this place from the trip?')) return
    setPlaces((p) => p.filter((x) => x.id !== placeId))
    await supabase.from('places').delete().eq('id', placeId)
  }

  async function ensureDays() {
    if (!trip || !canEdit) return
    if (days.length > 0) return
    if (!trip.start_date || !trip.end_date) {
      await supabase.from('trip_days').insert({ trip_id: trip.id, day_index: 0 })
    } else {
      const n = daysBetween(trip.start_date, trip.end_date) + 1
      const rows = Array.from({ length: n }, (_, i) => ({
        trip_id: trip.id,
        day_index: i,
        date: addDays(trip.start_date!, i),
      }))
      await supabase.from('trip_days').insert(rows)
    }
    await refreshDays(trip.id)
  }

  async function addNewDay() {
    if (!trip || !canEdit) return
    const idx = days.length
    const date =
      trip.start_date && idx > 0 ? addDays(trip.start_date, idx) : trip.start_date ?? null
    await supabase.from('trip_days').insert({ trip_id: trip.id, day_index: idx, date })
    await refreshDays(trip.id)
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-500">Loading trip…</div>
    )
  }
  if (error || !trip) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-red-600">{error ?? 'Trip not found'}</p>
        <Link to="/trips" className="mt-4 inline-block text-indigo-600 hover:underline">
          Back to trips
        </Link>
      </div>
    )
  }

  const activeItems = items
    .filter((i) => i.day_id === activeDayId)
    .sort((a, b) => a.position - b.position)
  const focusPlace = focusPlaceId ? placeMap.get(focusPlaceId) : null
  const bias = focusPlace?.lat != null && focusPlace?.lng != null
    ? { lat: focusPlace.lat, lng: focusPlace.lng }
    : places.find((p) => p.lat != null && p.lng != null)
    ? { lat: places[0].lat as number, lng: places[0].lng as number }
    : null

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link to="/trips" className="text-xs text-slate-500 hover:text-slate-700">
                ← All trips
              </Link>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">{trip.title}</h1>
              <p className="text-sm text-slate-500">
                {trip.destination ? `${trip.destination} · ` : ''}
                {formatDateRange(trip.start_date, trip.end_date)}
              </p>
              {role && (
                <span className="mt-2 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  Your role: {role}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {canEdit && (
                <button
                  onClick={() => navigate(`/trips/${trip.id}/edit`)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  Edit details
                </button>
              )}
              <button
                onClick={() => setShowShare(true)}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
              >
                Share
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[1fr_minmax(420px,1fr)]">
        <div className="space-y-4">
          {canEdit && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-medium text-slate-700">Add a place</h3>
              <PlaceSearch
                onSelect={addPlaceFromSearch}
                placeholder="Search restaurants, hotels, attractions…"
                bias={bias}
              />
              <p className="mt-2 text-xs text-slate-500">
                Powered by OpenStreetMap (Nominatim).
              </p>
            </div>
          )}

          <PlacesList
            places={places}
            canEdit={canEdit}
            activeDayId={activeDayId}
            onFocus={(id) => setFocusPlaceId(id)}
            onRemove={removePlace}
            onAddToDay={(placeId) =>
              activeDayId && addItineraryItem(activeDayId, placeId, null)
            }
          />

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Itinerary</h2>
              {canEdit && (
                <div className="flex items-center gap-2">
                  {days.length === 0 && (
                    <button
                      onClick={() => void ensureDays()}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Add days
                    </button>
                  )}
                  {days.length > 0 && (
                    <button
                      onClick={() => void addNewDay()}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      + Day
                    </button>
                  )}
                </div>
              )}
            </div>
            {days.length === 0 ? (
              <p className="text-sm text-slate-500">
                No days yet. {canEdit ? 'Click "Add days" to get started.' : ''}
              </p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  {days.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setActiveDayId(d.id)}
                      className={
                        activeDayId === d.id
                          ? 'rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white'
                          : 'rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50'
                      }
                    >
                      Day {d.day_index + 1}
                    </button>
                  ))}
                </div>
                {activeDayId && (
                  <ItineraryDay
                    day={days.find((d) => d.id === activeDayId)!}
                    items={activeItems}
                    places={placeMap}
                    canEdit={canEdit}
                    onReorder={(ordered) => void reorderDay(activeDayId, ordered)}
                    onAddItem={(placeId, title) =>
                      addItineraryItem(activeDayId, placeId, title)
                    }
                    onRemoveItem={removeItineraryItem}
                    onFocusPlace={(id) => setFocusPlaceId(id)}
                  />
                )}
              </>
            )}
          </div>
        </div>

        <div className="sticky top-4 h-[60vh] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:h-[calc(100vh-8rem)]">
          <TripMap places={places} focusPlaceId={focusPlaceId} onSelect={setFocusPlaceId} />
        </div>
      </div>

      {showShare && (
        <ShareDialog
          trip={trip}
          isOwner={isOwner}
          canEdit={canEdit}
          onClose={() => setShowShare(false)}
          onTripChange={setTrip}
        />
      )}
    </div>
  )
}

function PlacesList({
  places,
  canEdit,
  activeDayId,
  onFocus,
  onRemove,
  onAddToDay,
}: {
  places: Place[]
  canEdit: boolean
  activeDayId: string | null
  onFocus: (id: string) => void
  onRemove: (id: string) => void
  onAddToDay: (id: string) => void
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold text-slate-900">Saved places</h2>
      {places.length === 0 ? (
        <p className="text-sm text-slate-500">
          No places yet. {canEdit ? 'Search above to add one.' : ''}
        </p>
      ) : (
        <ul className="space-y-2">
          {places.map((p) => (
            <li
              key={p.id}
              className="flex items-start justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <button onClick={() => onFocus(p.id)} className="flex-1 text-left">
                <div className="text-sm font-medium text-slate-900">{p.name}</div>
                {p.address && <div className="text-xs text-slate-500">{p.address}</div>}
                {p.category && (
                  <div className="text-xs text-slate-400">{p.category}</div>
                )}
              </button>
              {canEdit && (
                <div className="flex items-center gap-1">
                  {activeDayId && (
                    <button
                      onClick={() => onAddToDay(p.id)}
                      className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-white"
                    >
                      + Day
                    </button>
                  )}
                  <button
                    onClick={() => onRemove(p.id)}
                    className="text-xs text-slate-400 hover:text-red-600"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
